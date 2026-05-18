'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

type NotifType = 'payment' | 'shift' | 'alert' | 'system' | 'bonus' | 'refund' | string

interface Notification {
  id: string
  type: NotifType
  title: string
  body?: string
  createdAt: string
  isRead: boolean
}

interface NotifSettings {
  [key: string]: boolean
}

const TYPE_ICONS: Record<string, string> = {
  payment: 'payments',
  shift: 'schedule',
  alert: 'warning',
  system: 'settings',
  bonus: 'stars',
  refund: 'undo',
}

const SETTING_LABELS: Record<string, string> = {
  payment: 'Платежи',
  shift: 'Смены',
  alert: 'Предупреждения',
  system: 'Системные',
  bonus: 'Бонусы',
  refund: 'Возвраты',
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  return format(new Date(dateStr), 'd MMM', { locale: ru })
}

export default function NotificationsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: Notification[] }>('/notifications'),
  })

  const { data: settingsData } = useQuery({
    queryKey: ['notifications', 'settings'],
    queryFn: () => api.get<{ settings: NotifSettings }>('/notifications/settings'),
  })

  const readOne = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const readAll = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const saveSettings = useMutation({
    mutationFn: (settings: NotifSettings) => api.put('/notifications/settings', { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'settings'] }),
  })

  const notifications: Notification[] = notifData?.notifications ?? []
  const unreadCount = notifications.filter(n => !n.isRead).length
  const settings: NotifSettings = settingsData?.settings ?? {}

  function handleCardClick(n: Notification) {
    if (!n.isRead) readOne.mutate(n.id)
    setExpanded(prev => (prev === n.id ? null : n.id))
  }

  function toggleSetting(key: string) {
    const next = { ...settings, [key]: !settings[key] }
    saveSettings.mutate(next)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Уведомления</h1>
          {unreadCount > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: 'var(--primary)', color: '#fff', lineHeight: 1.5,
            }}>
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={() => readAll.mutate()}
          disabled={readAll.isPending || unreadCount === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            color: 'var(--on-surface-variant)', flexShrink: 0,
            opacity: unreadCount === 0 ? 0.4 : 1,
          }}
        >
          <Icon name="done_all" size={16} />
          Отметить все
        </button>
      </div>

      {/* List */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--on-surface-variant)' }}>
            <Icon name="notifications_off" size={56} style={{ display: 'block', marginBottom: 12, opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 15 }}>Нет уведомлений</p>
          </div>
        ) : (
          notifications.map(n => {
            const icon = TYPE_ICONS[n.type] ?? 'notifications'
            const isOpen = expanded === n.id
            return (
              <button
                key={n.id}
                onClick={() => handleCardClick(n)}
                className="glass-l2"
                style={{
                  width: '100%', border: 'none', cursor: 'pointer', borderRadius: 16,
                  padding: '14px 16px', textAlign: 'left',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  opacity: n.isRead ? 0.7 : 1,
                }}
              >
                {/* Unread dot */}
                <div style={{ width: 8, flexShrink: 0, paddingTop: 6 }}>
                  {!n.isRead && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                  )}
                </div>

                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={icon} size={18} color="var(--primary)" />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: n.isRead ? 400 : 600, color: 'var(--on-surface)', lineHeight: 1.3 }}>
                      {n.title}
                    </p>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', flexShrink: 0, marginTop: 1 }}>
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  {(n.body && !isOpen) && (
                    <p style={{
                      margin: '4px 0 0', fontSize: 12, color: 'var(--on-surface-variant)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.body}
                    </p>
                  )}
                  {isOpen && n.body && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
                      {n.body}
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Settings section */}
      <div style={{ padding: '32px 16px 0' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', padding: '0 4px' }}>
          Настройки уведомлений
        </h2>
        <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
          {Object.entries(SETTING_LABELS).map(([key, label], idx, arr) => (
            <div
              key={key}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name={TYPE_ICONS[key] ?? 'notifications'} size={18} color="var(--on-surface-variant)" />
                <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>{label}</span>
              </div>
              <button
                onClick={() => toggleSetting(key)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  position: 'relative', transition: 'background 0.2s',
                  background: settings[key] !== false ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: settings[key] !== false ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
