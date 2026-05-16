'use client'
/**
 * SSE-подписка для staff/owner на уведомления (вызовы с планшетов, запросы счёта).
 * Показывает toast при получении нового уведомления.
 */
import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/store/auth.store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api'

interface NotifEvent {
  id: string
  type: string
  title: string
  body: string
  meta?: Record<string, unknown>
  createdAt: string
}

interface Toast extends NotifEvent {
  shownAt: number
}

const ICONS: Record<string, string> = {
  staff_call: 'support_agent',
  request_bill: 'receipt_long',
}
const COLORS: Record<string, string> = {
  staff_call: '#F59E0B',
  request_bill: '#10B981',
}

export function StaffNotifications() {
  const { token, user } = useAuthStore()
  const [toasts, setToasts] = useState<Toast[]>([])
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Только для staff/owner
    if (!token || !user || !['owner', 'staff'].includes(user.role)) return

    // EventSource не поддерживает кастомные заголовки → токен в query
    const url = `${API_BASE}/notifications/stream?token=${encodeURIComponent(token)}`
    let es: EventSource
    try {
      es = new EventSource(url)
    } catch {
      return
    }
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as NotifEvent
        setToasts((prev) => [...prev, { ...data, shownAt: Date.now() }])
        // Звуковое уведомление (опционально, если разрешено)
        if (typeof window !== 'undefined' && 'AudioContext' in window) {
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
      } catch {}
    }
    es.onerror = () => {
      // SSE автоматически реконнектится — ничего не делаем
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [token, user])

  // Автоматически скрываем toast через 6 сек
  useEffect(() => {
    if (toasts.length === 0) return
    const t = setInterval(() => {
      setToasts((prev) => prev.filter((tt) => Date.now() - tt.shownAt < 6000))
    }, 500)
    return () => clearInterval(t)
  }, [toasts.length])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 'calc(20px + env(safe-area-inset-top))',
      right: 16,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 60,
      maxWidth: 340,
      pointerEvents: 'none',
    }}>
      {toasts.slice(-3).map((t) => {
        const icon = ICONS[t.type] ?? 'notifications'
        const color = COLORS[t.type] ?? '#A78BFA'
        return (
          <div
            key={t.id}
            style={{
              padding: '14px 18px', borderRadius: 16,
              background: 'rgba(29,26,36,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              border: `1px solid ${color}55`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${color}22`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
              animation: 'slide-in-right 0.3s ease',
              pointerEvents: 'auto',
            }}
            onClick={() => setToasts((prev) => prev.filter((tt) => tt.id !== t.id))}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: `${color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color }}>{icon}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: 'var(--on-surface)' }}>{t.title}</p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>{t.body}</p>
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
