'use client'
/**
 * Центр уведомлений приложения.
 *
 * Единая точка сбора всех уведомлений для staff/owner:
 *  • при монтировании грузит GET /notifications и открывает SSE-поток
 *    /notifications/stream (логика перенесена из старого StaffNotifications);
 *  • хранит список, считает unreadCount и hasImportantUnread (непрочитанные
 *    вызовы из кабинки / запросы счёта);
 *  • при новом SSE-событии добавляет уведомление в начало списка (непрочитанным),
 *    проигрывает звук и показывает временный нижний toast (богатая карточка);
 *  • markRead(id) / markAllRead() — вызывают PUT-эндпоинты и обновляют локальный
 *    стейт.
 *
 * Нижние временные toast-карточки рендерятся прямо здесь (авто-скрытие ~6с),
 * над плавающей навигацией.
 */
import {
  createContext, useContext, useState, useEffect, useRef, useCallback, useMemo,
} from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'
import { openSse } from '@/lib/sse'
import { Icon } from '@/components/Icon'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  meta?: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

interface TransientToast extends AppNotification {
  shownAt: number
}

interface NotificationsContextValue {
  notifications: AppNotification[]
  unreadCount: number
  hasImportantUnread: boolean
  markRead: (id: string) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

// Важные типы — те, что вызывают тряску «колокольчика» до прочтения.
const IMPORTANT_TYPES = new Set(['staff_call', 'request_bill', 'client_order', 'chat_message'])

export const NOTIF_ICONS: Record<string, string> = {
  staff_call: 'support_agent',
  request_bill: 'receipt_long',
  client_order: 'room_service',
  chat_message: 'chat',
}
export const NOTIF_COLORS: Record<string, string> = {
  staff_call: '#F59E0B',
  request_bill: '#10B981',
  client_order: '#8B5CF6',
  chat_message: '#4cd7f6',
}
export function notifIcon(type: string) { return NOTIF_ICONS[type] ?? 'notifications' }
export function notifColor(type: string) { return NOTIF_COLORS[type] ?? '#A78BFA' }

function playChime() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  const pathname = usePathname()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [toasts, setToasts] = useState<TransientToast[]>([])
  // id уже виденных уведомлений — защита от дублей (load + SSE re-emit одного и того же).
  const seenRef = useRef<Set<string>>(new Set())

  // Планшет-киоск работает под staff-токеном, но это УСТРОЙСТВО ГОСТЯ — на нём
  // не показываем уведомления персонала (это сам гость их и инициирует).
  const isTablet = pathname?.startsWith('/tablet') ?? false
  const isStaff = !!token && !!user && ['owner', 'staff'].includes(user.role) && !isTablet

  // ── Загрузка истории + открытие SSE-потока ──────────────────────────────
  useEffect(() => {
    if (!isStaff) {
      setNotifications([])
      setToasts([])
      seenRef.current = new Set()
      return
    }

    let cancelled = false
    let es: EventSource | null = null

    // 1) История
    api.get<{ notifications: AppNotification[] }>('/notifications')
      .then((res) => {
        if (cancelled) return
        const list = res.notifications ?? []
        list.forEach((n) => seenRef.current.add(n.id))
        setNotifications(list)
      })
      .catch(() => { /* нет сети — список останется пустым */ })

    // 2) Живой поток
    openSse('/notifications/stream').then((stream) => {
      if (cancelled) { stream.close(); return }
      es = stream
      stream.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as AppNotification
          if (seenRef.current.has(data.id)) return
          seenRef.current.add(data.id)
          const incoming: AppNotification = { ...data, isRead: false }
          setNotifications((prev) => [incoming, ...prev])
          setToasts((prev) => [...prev, { ...incoming, shownAt: Date.now() }])
          playChime()
        } catch {}
      }
      stream.onerror = () => { /* EventSource реконнектится сам */ }
    }).catch(() => { /* нет тикета/сети — поток не открываем */ })

    return () => {
      cancelled = true
      es?.close()
    }
  }, [isStaff])

  // Авто-скрытие нижних toast через ~6с
  useEffect(() => {
    if (toasts.length === 0) return
    const t = setInterval(() => {
      setToasts((prev) => prev.filter((tt) => Date.now() - tt.shownAt < 6000))
    }, 500)
    return () => clearInterval(t)
  }, [toasts.length])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((tt) => tt.id !== id))
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id)
      if (!target || target.isRead) return prev
      return prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    })
    api.put(`/notifications/${id}/read`).catch(() => { /* best-effort */ })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.some((n) => !n.isRead)
      ? prev.map((n) => ({ ...n, isRead: true }))
      : prev)
    api.put('/notifications/read-all').catch(() => { /* best-effort */ })
  }, [])

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [notifications],
  )
  const hasImportantUnread = useMemo(
    () => notifications.some((n) => !n.isRead && IMPORTANT_TYPES.has(n.type)),
    [notifications],
  )

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, hasImportantUnread, markRead, markAllRead }),
    [notifications, unreadCount, hasImportantUnread, markRead, markAllRead],
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <TransientToasts toasts={toasts} onDismiss={dismissToast} />
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}

// ── Нижние временные карточки (над навигацией) ────────────────────────────
function TransientToasts({ toasts, onDismiss }: { toasts: TransientToast[]; onDismiss: (id: string) => void }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--bottom-nav-clear, 96px) + 10px)',
      left: '50%', transform: 'translateX(-50%)',
      zIndex: 9998, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      width: 'min(calc(100vw - 32px), 360px)',
    }}>
      <AnimatePresence>
        {toasts.slice(-3).map((t) => {
          const icon = notifIcon(t.type)
          const color = notifColor(t.type)
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              onClick={() => onDismiss(t.id)}
              style={{
                padding: '14px 16px', borderRadius: 16,
                background: 'rgba(29,26,36,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: `1px solid ${color}55`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${color}22`,
                display: 'flex', gap: 12, alignItems: 'flex-start',
                pointerEvents: 'auto', cursor: 'pointer',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: `${color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name={icon} size={20} color={color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: 'var(--on-surface)' }}>{t.title}</p>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>{t.body}</p>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
