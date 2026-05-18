'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'

const INP: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}
const SEL: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
}
const LBL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  color: 'var(--on-surface-variant)', margin: '0 0 8px', display: 'block',
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 52, height: 28, borderRadius: 14, background: value ? '#8B5CF6' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, boxShadow: value ? '0 0 12px rgba(139,92,246,0.4)' : 'none' }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 27 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </div>
  )
}

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

function ToggleRow({ label, subtitle, value, onChange }: { label: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div>
        <span style={{ fontSize: 14, color: 'var(--on-surface)', fontWeight: 500 }}>{label}</span>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
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
  const router = useRouter()
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
  })

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
            <Icon name="arrow_back" size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Настройки</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Параметры заведения и системы</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--on-surface-variant)' }}>
            <Icon name="settings" size={40} style={{ display: 'block', marginBottom: 12, opacity: 0.4 }} />
            Загрузка настроек…
          </div>
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
                    <input type="time" style={INP} value={form.hours_open} onChange={e => set('hours_open', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...LBL, color: 'rgba(204,195,216,0.5)' }}>Закрытие</label>
                    <input type="time" style={INP} value={form.hours_close} onChange={e => set('hours_close', e.target.value)} />
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
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              style={{
                width: '100%', padding: '16px', borderRadius: 16, border: 'none',
                background: saved ? 'rgba(16,185,129,0.8)' : save.isPending ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
                color: save.isPending ? 'var(--on-surface-variant)' : '#fff',
                fontSize: 15, fontWeight: 800, cursor: save.isPending ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: saved ? '0 4px 20px rgba(16,185,129,0.3)' : '0 4px 20px rgba(124,58,237,0.3)',
              }}
            >
              {saved
                ? <><Icon name="check_circle" size={18} />Сохранено!</>
                : save.isPending
                ? <><Icon name="progress_activity" size={18} style={{ animation: 'spin 1s linear infinite' }} />Сохраняем…</>
                : <><Icon name="save" size={18} />Сохранить изменения</>
              }
            </button>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  )
}
