'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader, Toggle, INP } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { getPushStatus, enablePush, disablePush, type PushStatus } from '@/lib/push'
import { useAuthStore } from '@/store/auth.store'

// Описание типа уведомления с бэкенда (GET /notifications/types).
interface NotifType {
  key: string
  label: string
  description: string
  defaultEnabled: boolean
}

// Контракт API: настройки хранятся как карта типов → { enabled (web push), telegram }.
type NotifTypeSetting = { enabled: boolean; channel?: string; telegram?: boolean }
type NotifTypesMap = Record<string, NotifTypeSetting>
interface NotifSettingsRow {
  types?: NotifTypesMap | null
}

const DEFAULT_CHANNEL = 'push'

const TYPE_ICONS: Record<string, string> = {
  staff_call: 'support_agent',
  request_bill: 'receipt_long',
  client_order: 'room_service',
  chat_message: 'chat',
  payment: 'payments',
  shift: 'schedule',
  alert: 'warning',
  system: 'settings',
  bonus: 'stars',
  refund: 'money_return',
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
  const [busy, setBusy] = useState(false)

  // ─── Статус push на этом устройстве ──────────────────────────────────────
  const { data: pushStatus } = useQuery<PushStatus>({
    queryKey: ['push-status'],
    queryFn: getPushStatus,
    staleTime: 5_000,
  })
  const pushSupported = pushStatus?.supported !== false
  const pushOn = pushStatus?.subscribed && pushStatus?.permission === 'granted'

  // ─── Доступные типы + сохранённые настройки пользователя ─────────────────
  const { data: typesData } = useQuery({
    queryKey: ['notifications', 'types'],
    queryFn: () => api.get<{ types: NotifType[] }>('/notifications/types'),
  })

  const { data: settingsData } = useQuery({
    queryKey: ['notifications', 'settings'],
    queryFn: () => api.get<{ settings: NotifSettingsRow | null; telegramLinked?: boolean }>('/notifications/settings'),
  })
  const telegramLinked = settingsData?.telegramLinked ?? false

  const [linkCode, setLinkCode] = useState<string | null>(null)
  const tgLink = useMutation({
    mutationFn: () => api.post<{ code: string }>('/notifications/tg-link'),
    onSuccess: (r) => setLinkCode(r.code),
    onError: () => show('Не удалось создать код привязки', 'error'),
  })

  const saveSettings = useMutation({
    // API ожидает { types: Record<string, { enabled, channel }> }.
    mutationFn: (types: NotifTypesMap) => api.put('/notifications/settings', { types }),
    onMutate: async (types) => {
      // Оптимистичное обновление: тумблер реагирует мгновенно.
      await qc.cancelQueries({ queryKey: ['notifications', 'settings'] })
      const prev = qc.getQueryData<{ settings: NotifSettingsRow | null; telegramLinked?: boolean }>(['notifications', 'settings'])
      qc.setQueryData(['notifications', 'settings'], { ...(prev ?? {}), settings: { ...(prev?.settings ?? {}), types } })
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

  // ─── Настраиваемые пороги сумм (крупный чек / крупный возврат) — только владелец ─
  const isOwner = useAuthStore((s) => s.user?.role) === 'owner'
  const { data: appSettingsData } = useQuery({
    queryKey: ['system', 'settings'],
    queryFn: () => api.get<{ settings: Record<string, string> }>('/system/settings'),
    enabled: isOwner,
  })
  const [largeCheck, setLargeCheck] = useState('')
  const [largeRefund, setLargeRefund] = useState('')
  useEffect(() => {
    const s = appSettingsData?.settings
    if (!s) return
    setLargeCheck((prev) => (prev === '' ? (s['large_check_threshold'] ?? '3000') : prev))
    setLargeRefund((prev) => (prev === '' ? (s['large_refund_threshold'] ?? '3000') : prev))
  }, [appSettingsData])
  const saveThresholds = useMutation({
    mutationFn: () => api.patch('/system/settings', {
      large_check_threshold: String(Math.max(0, parseInt(largeCheck) || 0)),
      large_refund_threshold: String(Math.max(0, parseInt(largeRefund) || 0)),
    }),
    onSuccess: () => { show('Пороги сохранены', 'success'); qc.invalidateQueries({ queryKey: ['system', 'settings'] }) },
    onError: () => show('Не удалось сохранить пороги', 'error'),
  })

  const notifTypes: NotifType[] = typesData?.types ?? []
  const savedTypes: NotifTypesMap = settingsData?.settings?.types ?? {}

  // Включён ли тип: явная настройка пользователя > defaultEnabled из контракта.
  function isEnabled(t: NotifType): boolean {
    return savedTypes[t.key]?.enabled ?? t.defaultEnabled
  }
  // Telegram-доставка — opt-in (по умолчанию выкл).
  function isTgEnabled(t: NotifType): boolean {
    return savedTypes[t.key]?.telegram ?? false
  }

  function setTypeField(t: NotifType, field: 'enabled' | 'telegram', value: boolean) {
    // Строим полную карту по всем известным типам, затем меняем одно поле.
    const next: NotifTypesMap = {}
    for (const item of notifTypes) {
      next[item.key] = { enabled: isEnabled(item), telegram: isTgEnabled(item), channel: savedTypes[item.key]?.channel ?? DEFAULT_CHANNEL }
    }
    next[t.key] = { ...next[t.key]!, [field]: value }
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
        subtitle="Какие уведомления получать и куда"
      />

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>

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

        {/* ─── Telegram-привязка ──────────────────────────────────────── */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: telegramLinked ? 0 : 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: telegramLinked ? 'rgba(34,158,217,0.18)' : 'rgba(148,163,184,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="send" size={22} color={telegramLinked ? '#229ED9' : '#94A3B8'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: telegramLinked ? '#229ED9' : 'var(--on-surface)' }}>
                {telegramLinked ? 'Telegram привязан' : 'Telegram не привязан'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.4 }}>
                {telegramLinked ? 'Типы с галочкой «TG» ниже приходят в Telegram-бот' : 'Привяжите, чтобы получать выбранные уведомления в Telegram'}
              </p>
            </div>
          </div>
          {!telegramLinked && !linkCode && (
            <button onClick={() => tgLink.mutate()} disabled={tgLink.isPending}
              style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #229ED9, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: tgLink.isPending ? 0.7 : 1 }}>
              <Icon name="link" size={20} />{tgLink.isPending ? 'Создаём код…' : 'Привязать Telegram'}
            </button>
          )}
          {!telegramLinked && linkCode && (
            <div style={{ borderRadius: 12, padding: '14px', background: 'rgba(34,158,217,0.08)', border: '1px solid rgba(34,158,217,0.25)' }}>
              <p style={{ fontSize: 12.5, color: 'var(--on-surface)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Откройте админ-бота в Telegram и отправьте ему этот код:
              </p>
              <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.18em', textAlign: 'center', margin: 0, color: '#229ED9', fontFamily: "'JetBrains Mono',monospace" }}>{linkCode}</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '10px 0 0', textAlign: 'center' }}>Код действует 30 минут</p>
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

        {/* ─── Пороги сумм (настраиваемые) — только владелец ──────────────── */}
        {isOwner && (
          <div className="glass-l2" style={{ borderRadius: 16, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="payments" size={22} color="#34D399" />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>Пороги «крупных» сумм</p>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.4 }}>С какой суммы чек/возврат считается крупным и шлёт уведомление «Крупный…».</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Крупный чек, ₽</label>
                <input type="number" inputMode="numeric" min={0} value={largeCheck} onChange={(e) => setLargeCheck(e.target.value)} style={INP} placeholder="3000" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Крупный возврат, ₽</label>
                <input type="number" inputMode="numeric" min={0} value={largeRefund} onChange={(e) => setLargeRefund(e.target.value)} style={INP} placeholder="3000" />
              </div>
            </div>
            <button
              onClick={() => saveThresholds.mutate()}
              disabled={saveThresholds.isPending}
              style={{ width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, opacity: saveThresholds.isPending ? 0.6 : 1 }}
            >
              {saveThresholds.isPending ? 'Сохраняем…' : 'Сохранить пороги'}
            </button>
          </div>
        )}
      </div>

      {/* ─── Настройки типов (per user) ──────────────────────────────────── */}
      <div style={{ padding: '24px 16px var(--bottom-nav-clear, 24px)', maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', padding: '0 4px' }}>
          Какие уведомления получать
        </h2>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 4px 16px', lineHeight: 1.5 }}>
          Включая обращения гостей с планшетов: вызов персонала, запрос счёта, заказ.
        </p>
        {notifTypes.length === 0 ? (
          <StateView state="empty" icon="notifications_off" title="Нет доступных типов" />
        ) : (
          <>
            {/* Заголовки колонок каналов */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 8px' }}>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ width: 42, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Push</span>
                <span style={{ width: 42, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#229ED9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TG</span>
              </div>
            </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <div style={{ width: 42, display: 'flex', justifyContent: 'center' }}>
                      <Toggle size="sm" value={isEnabled(t)} onChange={(v) => setTypeField(t, 'enabled', v)} color="#F59E0B" ariaLabel={`${t.label} push`} />
                    </div>
                    <div style={{ width: 42, display: 'flex', justifyContent: 'center' }}>
                      <Toggle size="sm" value={isTgEnabled(t)} onChange={(v) => setTypeField(t, 'telegram', v)} color="#229ED9" ariaLabel={`${t.label} telegram`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '12px 4px 0', lineHeight: 1.5 }}>
          Настройки индивидуальны для вашего аккаунта. «Push» — на это устройство, «TG» — в Telegram-бот (нужна привязка выше).
        </p>
      </div>
    </div>
  )
}
