'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Toggle } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { getPushStatus, enablePush, disablePush, type PushStatus } from '@/lib/push'

type NotifTypeKey = 'payment' | 'shift' | 'alert' | 'system' | 'bonus' | 'refund' | string

interface Notification {
  id: string
  type: NotifTypeKey
  title: string
  body?: string
  createdAt: string
  isRead: boolean
}

// Описание типа уведомления с бэкенда (GET /notifications/types).
interface NotifType {
  key: string
  label: string
  description: string
  defaultEnabled: boolean
}

// Контракт API: настройки хранятся как карта типов → { enabled, channel }.
type NotifTypeSetting = { enabled: boolean; channel: string }
type NotifTypesMap = Record<string, NotifTypeSetting>
interface NotifSettingsRow {
  types?: NotifTypesMap | null
}

const DEFAULT_CHANNEL = 'push'

const TYPE_ICONS: Record<string, string> = {
  payment: 'payments',
  shift: 'schedule',
  alert: 'warning',
  system: 'settings',
  bonus: 'stars',
  refund: 'money_return',
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

// Запущено ли приложение как установленная PWA (с домашнего экрана).
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari выставляет этот флаг вместо display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ─── Статус push на этом устройстве ──────────────────────────────────────
  const { data: pushStatus } = useQuery<PushStatus>({
    queryKey: ['push-status'],
    queryFn: getPushStatus,
    staleTime: 5_000,
  })
  const pushSupported = pushStatus?.supported !== false
  const pushOn = pushStatus?.subscribed && pushStatus?.permission === 'granted'

  // ─── Лента уведомлений ───────────────────────────────────────────────────
  const { data: notifData, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: Notification[] }>('/notifications'),
  })

  // ─── Доступные типы + сохранённые настройки пользователя ─────────────────
  const { data: typesData } = useQuery({
    queryKey: ['notifications', 'types'],
    queryFn: () => api.get<{ types: NotifType[] }>('/notifications/types'),
  })

  const { data: settingsData } = useQuery({
    queryKey: ['notifications', 'settings'],
    queryFn: () => api.get<{ settings: NotifSettingsRow | null }>('/notifications/settings'),
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
    // API ожидает { types: Record<string, { enabled, channel }> }.
    mutationFn: (types: NotifTypesMap) => api.put('/notifications/settings', { types }),
    onMutate: async (types) => {
      // Оптимистичное обновление: тумблер реагирует мгновенно.
      await qc.cancelQueries({ queryKey: ['notifications', 'settings'] })
      const prev = qc.getQueryData<{ settings: NotifSettingsRow | null }>(['notifications', 'settings'])
      qc.setQueryData(['notifications', 'settings'], { settings: { types } })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications', 'settings'], ctx.prev)
      show('Не удалось сохранить настройку', 'error')
    },
    onSuccess: () => show('Сохранено', 'success'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications', 'settings'] }),
  })

  const test = useMutation({
    mutationFn: () => api.post('/notifications/push/test'),
    onSuccess: () => show('Тестовое уведомление отправлено', 'success'),
    onError: () => show('Не удалось отправить тест', 'error'),
  })

  const notifications: Notification[] = notifData?.notifications ?? []
  const unreadCount = notifications.filter(n => !n.isRead).length
  const notifTypes: NotifType[] = typesData?.types ?? []
  const savedTypes: NotifTypesMap = settingsData?.settings?.types ?? {}

  // Включён ли тип: явная настройка пользователя > defaultEnabled из контракта.
  function isEnabled(t: NotifType): boolean {
    return savedTypes[t.key]?.enabled ?? t.defaultEnabled
  }

  function handleCardClick(n: Notification) {
    if (!n.isRead) readOne.mutate(n.id)
    setExpanded(prev => (prev === n.id ? null : n.id))
  }

  function toggleSetting(t: NotifType, value: boolean) {
    // Строим полную карту по всем известным типам + изменённый.
    const next: NotifTypesMap = {}
    for (const item of notifTypes) {
      next[item.key] = { enabled: isEnabled(item), channel: savedTypes[item.key]?.channel ?? DEFAULT_CHANNEL }
    }
    next[t.key] = { enabled: value, channel: savedTypes[t.key]?.channel ?? DEFAULT_CHANNEL }
    saveSettings.mutate(next)
  }

  // ─── Действия push ───────────────────────────────────────────────────────
  async function onEnablePush() {
    setBusy(true)
    try {
      await enablePush()
      await qc.invalidateQueries({ queryKey: ['push-status'] })
      show('Push-уведомления включены', 'success')
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Не удалось включить push'
      show(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDisablePush() {
    setBusy(true)
    try {
      await disablePush()
      await qc.invalidateQueries({ queryKey: ['push-status'] })
      show('Push-уведомления отключены', 'info')
    } catch {
      show('Не удалось отключить push', 'error')
    } finally {
      setBusy(false)
    }
  }

  const showIOSHint = isIOS() && !isStandalone()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Уведомления"
        subtitle={unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все прочитаны'}
        action={unreadCount > 0 ? { label: 'Прочитать все', icon: 'done_all', onClick: () => readAll.mutate() } : undefined}
      />

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, margin: '0 auto', width: '100%' }}>

        {/* ─── Статус push ───────────────────────────────────────────── */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: pushSupported ? 14 : 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: pushOn ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={pushOn ? 'notifications' : 'notifications_off'} size={22} color={pushOn ? '#10B981' : '#F59E0B'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: pushOn ? '#10B981' : 'var(--on-surface)' }}>
                {!pushSupported ? 'Push не поддерживается' : pushOn ? 'Push включены' : 'Push выключены'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
                {!pushSupported
                  ? 'Браузер не поддерживает push-уведомления'
                  : pushOn
                  ? 'Это устройство получает уведомления'
                  : 'Включите, чтобы получать уведомления на это устройство'}
              </p>
            </div>
          </div>

          {pushSupported && !pushOn && (
            <button onClick={onEnablePush} disabled={busy}
              style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: busy ? 'default' : 'pointer', background: 'linear-gradient(135deg, #F59E0B, #F97316)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: busy ? 0.7 : 1 }}>
              <Icon name="notifications" size={20} />
              {busy ? 'Подключение…' : 'Включить push-уведомления'}
            </button>
          )}

          {pushSupported && pushOn && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => test.mutate()} disabled={test.isPending}
                style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#10B981', fontSize: 13, fontWeight: 700, cursor: test.isPending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="send" size={16} />
                {test.isPending ? 'Отправка…' : 'Отправить тест'}
              </button>
              <button onClick={onDisablePush} disabled={busy}
                style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#f43f5e', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="notifications_off" size={16} />
                {busy ? '…' : 'Отключить'}
              </button>
            </div>
          )}
        </div>

        {/* ─── Подсказка для iOS ──────────────────────────────────────── */}
        {showIOSHint && (
          <div style={{ borderRadius: 14, padding: '14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', gap: 12 }}>
            <Icon name="info" size={20} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12.5, color: 'var(--on-surface)', margin: 0, lineHeight: 1.5 }}>
              На iPhone push-уведомления работают только после установки приложения на главный экран. Откройте меню «Поделиться» в Safari и выберите «На экран „Домой“».
            </p>
          </div>
        )}

        {/* ─── Лента ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
                    )}
                  </div>

                  {/* Icon */}
                  <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      </div>

      {/* ─── Настройки типов (per user) ──────────────────────────────────── */}
      <div style={{ padding: '32px 16px var(--bottom-nav-clear, 24px)', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', padding: '0 4px' }}>
          Какие уведомления получать
        </h2>
        {notifTypes.length === 0 ? (
          <StateView state="empty" icon="notifications_off" title="Нет доступных типов" />
        ) : (
          <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
            {notifTypes.map((t, idx, arr) => (
              <div
                key={t.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '14px 16px',
                  borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <Icon name={TYPE_ICONS[t.key] ?? 'notifications'} size={18} color="var(--on-surface-variant)" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, margin: 0, color: 'var(--on-surface)' }}>{t.label}</p>
                    {t.description && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.4 }}>{t.description}</p>}
                  </div>
                </div>
                <Toggle size="sm" value={isEnabled(t)} onChange={(v) => toggleSetting(t, v)} color="#F59E0B" ariaLabel={t.label} />
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '12px 4px 0', lineHeight: 1.5 }}>
          Настройки уведомлений индивидуальны для вашего аккаунта.
        </p>
      </div>
    </div>
  )
}
