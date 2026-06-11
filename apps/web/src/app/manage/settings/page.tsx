'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader, SaveButton, ToggleRow, INP, SEL, LBL } from '@/components/manage/DesignSystem'
import { TimeInput24 } from '@/components/TimeInput24'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

function SectionCard({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={16} color={color} />
        </div>
        <span style={{ ...LBL, margin: 0, color }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <Icon name={icon} size={12} />}
        {label}
      </label>
      {children}
    </div>
  )
}

interface FormData {
  venue_name: string
  venue_address: string
  hours_open: string
  hours_close: string
  default_payment: string
  receipt_footer: string
  auto_close_shift: boolean
  telegram_notifications: boolean
  low_stock_threshold: string
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<FormData>({
    venue_name: '', venue_address: '', hours_open: '', hours_close: '',
    default_payment: 'cash', receipt_footer: '',
    auto_close_shift: false, telegram_notifications: false,
    low_stock_threshold: '5',
  })

  const { data, isLoading } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['settings'],
    queryFn: () => api.get('/system/settings'),
  })

  useEffect(() => {
    if (!data?.settings) return
    const s = data.settings
    setForm({
      venue_name: s.venue_name ?? '',
      venue_address: s.venue_address ?? '',
      hours_open: s.hours_open ?? '',
      hours_close: s.hours_close ?? '',
      default_payment: s.default_payment ?? 'cash',
      receipt_footer: s.receipt_footer ?? '',
      auto_close_shift: s.auto_close_shift === 'true',
      telegram_notifications: s.telegram_notifications === 'true',
      low_stock_threshold: s.low_stock_threshold ?? '5',
    })
  }, [data])

  const save = useMutation({
    mutationFn: () => api.patch('/system/settings', {
      venue_name: form.venue_name,
      venue_address: form.venue_address,
      hours_open: form.hours_open,
      hours_close: form.hours_close,
      default_payment: form.default_payment,
      receipt_footer: form.receipt_footer,
      auto_close_shift: String(form.auto_close_shift),
      telegram_notifications: String(form.telegram_notifications),
      low_stock_threshold: form.low_stock_threshold,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: () => show('Не удалось сохранить настройки', 'error'),
  })

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Настройки" subtitle="Параметры заведения и системы" />

      <div style={{ padding: '20px 16px var(--bottom-nav-clear, 24px)', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : (
          <>
            {/* Venue */}
            <SectionCard title="Заведение" icon="store" color="#8B5CF6">
              <Field label="Название" icon="label">
                <input style={INP} value={form.venue_name} onChange={e => set('venue_name', e.target.value)} placeholder="Titan HUB" />
              </Field>
              <Field label="Адрес" icon="location_on">
                <input style={INP} value={form.venue_address} onChange={e => set('venue_address', e.target.value)} placeholder="ул. Примерная, 1" />
              </Field>
              <Field label="Часы работы" icon="schedule">
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...LBL, color: 'rgba(204,195,216,0.5)' }}>Открытие</label>
                    <TimeInput24 value={form.hours_open} onChange={v => set('hours_open', v)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...LBL, color: 'rgba(204,195,216,0.5)' }}>Закрытие</label>
                    <TimeInput24 value={form.hours_close} onChange={v => set('hours_close', v)} />
                  </div>
                </div>
              </Field>
            </SectionCard>

            {/* POS */}
            <SectionCard title="POS-терминал" icon="point_of_sale" color="#4cd7f6">
              <Field label="Оплата по умолчанию" icon="payments">
                <select style={SEL} value={form.default_payment} onChange={e => set('default_payment', e.target.value)}>
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="transfer">Перевод</option>
                </select>
              </Field>
              <Field label="Подпись в чеке" icon="receipt_long">
                <textarea
                  style={{ ...INP, minHeight: 72, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5 }}
                  value={form.receipt_footer}
                  onChange={e => set('receipt_footer', e.target.value)}
                  placeholder="Текст внизу чека..."
                />
              </Field>
              <ToggleRow
                label="Автозакрытие смены"
                subtitle="Закрывать смену по расписанию"
                value={form.auto_close_shift}
                onChange={v => set('auto_close_shift', v)}
              />
            </SectionCard>

            {/* Notifications */}
            <SectionCard title="Уведомления" icon="notifications" color="#10B981">
              <ToggleRow
                label="Telegram-уведомления"
                subtitle="Получать оповещения в Telegram"
                value={form.telegram_notifications}
                onChange={v => set('telegram_notifications', v)}
              />
              <Field label="Порог низкого остатка (шт.)" icon="inventory_2">
                <input type="number" style={INP} value={form.low_stock_threshold} min={0} onChange={e => set('low_stock_threshold', e.target.value)} placeholder="5" />
              </Field>
            </SectionCard>

            {/* Save */}
            <SaveButton onClick={() => save.mutate()} isPending={save.isPending} isSaved={saved} label="Сохранить изменения" />
          </>
        )}
      </div>
    </div>
  )
}
