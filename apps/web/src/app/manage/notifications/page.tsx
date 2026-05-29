'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Toggle } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

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
  const { show } = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: notifData, isLoading } = useQuery({
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
    onError: () => show('Не удалось отметить', 'error'),
  })

  const saveSettings = useMutation({
    mutationFn: (settings: NotifSettings) => api.put('/notifications/settings', { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'settings'] }),
    onError: () => show('Не удалось сохранить настройку', 'error'),
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Уведомления"
        subtitle={unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все прочитаны'}
        action={unreadCount > 0 ? { label: 'Прочитать все', icon: 'done_all', onClick: () => readAll.mutate() } : undefined}
      />

      {/* List */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading && !notifData ? (
          <StateView state="loading" />
        ) : notifications.length === 0 ? (
          <StateView state="empty" icon="notifications_off" title="Нет уведомлений" />
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
      <div style={{ padding: '32px 16px var(--bottom-nav-clear, 24px)', maxWidth: 680, margin: '0 auto', width: '100%' }}>
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
              <Toggle size="sm" value={settings[key] !== false} onChange={() => toggleSetting(key)} ariaLabel={label} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
