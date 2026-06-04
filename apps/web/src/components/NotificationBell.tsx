'use client'
/**
 * Колокольчик уведомлений для шапки кассы + центр уведомлений (Sheet).
 *
 *  • Кнопка показывает иконку 'notifications' и бейдж с числом непрочитанных.
 *  • Пока есть непрочитанные «важные» (вызов из кабинки / запрос счёта) —
 *    колокольчик ТРЯСЁТСЯ раз в 5 секунд, пока их не прочитают.
 *  • Клик открывает панель NotificationCenter со всеми уведомлениями;
 *    при открытии важные помечаются прочитанными (тряска прекращается).
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/manage/DesignSystem'
import {
  useNotifications, notifIcon, notifColor, notifUrl, type AppNotification,
} from '@/components/NotificationsProvider'

function formatTime(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24 && date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function NotificationBell() {
  const { unreadCount, hasImportantUnread, markRead, markAllRead, notifications } = useNotifications()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [shaking, setShaking] = useState(false)

  // Тряска раз в 5с, пока есть непрочитанные важные. Класс вешаем на ~0.8с.
  useEffect(() => {
    if (!hasImportantUnread) { setShaking(false); return }
    setShaking(true)
    const off = setTimeout(() => setShaking(false), 800)
    const interval = setInterval(() => {
      setShaking(true)
      setTimeout(() => setShaking(false), 800)
    }, 5000)
    return () => { clearTimeout(off); clearInterval(interval) }
  }, [hasImportantUnread])

  const openCenter = () => setOpen(true)

  // «Прочитано при просмотре»: пока центр открыт, через ~1.2с помечаем всё
  // показанное прочитанным — тапать каждое не нужно. Новые уведомления, пришедшие
  // при открытом центре, тоже погасятся (эффект перезапустится по unreadCount).
  useEffect(() => {
    if (!open || unreadCount === 0) return
    const t = setTimeout(() => markAllRead(), 1200)
    return () => clearTimeout(t)
  }, [open, unreadCount, markAllRead])

  // Переход по уведомлению — на нужный экран (и в приложении, и из PWA-пуша это
  // один и тот же маршрут notifUrl). Сразу помечаем прочитанным и закрываем центр.
  const openItem = (n: AppNotification) => {
    markRead(n.id)
    setOpen(false)
    const url = notifUrl(n)
    if (url && url !== '/') router.push(url)
  }

  return (
    <>
      <button
        onClick={openCenter}
        className={`glass-l2 notif-bell${shaking ? ' notif-bell--shake' : ''}`}
        title="Уведомления"
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Icon
          name="notifications"
          size={18}
          color={hasImportantUnread ? '#F59E0B' : 'var(--on-surface-variant)'}
        />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--danger)', color: '#fff',
            fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
            boxShadow: '0 0 0 2px var(--surface, #1d1a24)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <style>{`
          @keyframes notif-shake {
            0%, 100% { transform: rotate(0); }
            15% { transform: rotate(-14deg); }
            30% { transform: rotate(12deg); }
            45% { transform: rotate(-10deg); }
            60% { transform: rotate(8deg); }
            75% { transform: rotate(-5deg); }
            90% { transform: rotate(3deg); }
          }
          .notif-bell--shake { animation: notif-shake 0.8s ease-in-out; transform-origin: 50% 35%; }
        `}</style>
      </button>

      <NotificationCenter
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onOpenItem={openItem}
        onMarkAllRead={markAllRead}
      />
    </>
  )
}

function NotificationCenter({
  open, onClose, notifications, unreadCount, onOpenItem, onMarkAllRead,
}: {
  open: boolean
  onClose: () => void
  notifications: AppNotification[]
  unreadCount: number
  onOpenItem: (n: AppNotification) => void
  onMarkAllRead: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Уведомления" initialHeight="70dvh" desktopSize="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Шапка действий */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            {unreadCount > 0 ? `Непрочитанных: ${unreadCount}` : 'Все прочитаны'}
          </span>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--info)', fontSize: 13, fontWeight: 600, padding: '4px 2px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon name="done_all" size={16} color="var(--info)" />
              Прочитать всё
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '48px 16px', textAlign: 'center',
          }}>
            <Icon name="notifications_off" size={36} color="var(--on-surface-variant)" />
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Уведомлений пока нет</p>
          </div>
        ) : (
          notifications.map((n) => {
            const icon = notifIcon(n.type)
            const color = notifColor(n.type)
            const count = Number((n.meta as Record<string, unknown> | undefined)?.['count'] ?? 1)
            return (
              <button
                key={n.id}
                onClick={() => onOpenItem(n)}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
                  padding: '12px 14px', borderRadius: 14, width: '100%', cursor: 'pointer',
                  background: n.isRead ? 'rgba(255,255,255,0.03)' : `${color}14`,
                  border: `1px solid ${n.isRead ? 'rgba(255,255,255,0.06)' : `${color}40`}`,
                }}
              >
                <div style={{
                  position: 'relative',
                  width: 36, height: 36, borderRadius: 10, background: `${color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={icon} size={20} color={color} />
                  {count > 1 && (
                    <span style={{
                      position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 999, background: color, color: '#fff',
                      fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
                      boxShadow: '0 0 0 2px var(--surface, #1d1a24)',
                    }}>×{count > 99 ? '99+' : count}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{
                      fontSize: 13, fontWeight: n.isRead ? 600 : 800, margin: 0,
                      color: 'var(--on-surface)', flex: 1, minWidth: 0,
                    }}>{n.title}</p>
                    {!n.isRead && (
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{n.body}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '4px 0 0' }}>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.7 }}>{formatTime(n.createdAt)}</span>
                    <Icon name="chevron_right" size={14} color="var(--on-surface-variant)" />
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </Sheet>
  )
}
