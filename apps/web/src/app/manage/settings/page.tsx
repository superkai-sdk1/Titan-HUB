'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

interface SettingsData {
  venue_name?: string
  venue_address?: string
  hours_open?: string
  hours_close?: string
  default_payment?: string
  receipt_footer?: string
  auto_close_shift?: boolean
  bonus_rate?: number
  bonus_max_spend?: number
  bonus_expiry_days?: number
  telegram_notifications?: boolean
  low_stock_threshold?: number
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="glass-l2"
      style={{ borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <span style={LBL}>{title}</span>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={LBL}>{label}</span>
      {children}
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<SettingsData>({})

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingsData }>('/system/settings'),
  })

  useEffect(() => {
    if (data?.settings) setForm(data.settings)
  }, [data])

  const save = useMutation({
    mutationFn: (body: SettingsData) => api.put<void>('/system/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  function set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--on-surface)' }}>
          Настройки
        </h1>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--on-surface-variant)', fontSize: 14, textAlign: 'center', padding: 40 }}>
          Загрузка...
        </div>
      ) : (
        <>
          {/* ЗАВЕДЕНИЕ */}
          <SectionCard title="Заведение">
            <Field label="Название">
              <input
                style={INP}
                value={form.venue_name ?? ''}
                onChange={e => set('venue_name', e.target.value)}
                placeholder="Titan HUB"
              />
            </Field>
            <Field label="Адрес">
              <input
                style={INP}
                value={form.venue_address ?? ''}
                onChange={e => set('venue_address', e.target.value)}
                placeholder="ул. Примерная, 1"
              />
            </Field>
            <Field label="Время работы">
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ ...LBL, marginBottom: 4 }}>Открытие</span>
                  <input
                    type="time"
                    style={INP}
                    value={form.hours_open ?? ''}
                    onChange={e => set('hours_open', e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ ...LBL, marginBottom: 4 }}>Закрытие</span>
                  <input
                    type="time"
                    style={INP}
                    value={form.hours_close ?? ''}
                    onChange={e => set('hours_close', e.target.value)}
                  />
                </div>
              </div>
            </Field>
          </SectionCard>

          {/* POS */}
          <SectionCard title="POS">
            <Field label="Способ оплаты по умолчанию">
              <select
                style={SEL}
                value={form.default_payment ?? 'cash'}
                onChange={e => set('default_payment', e.target.value)}
              >
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
                <option value="transfer">Перевод</option>
              </select>
            </Field>
            <Field label="Подпись в чеке">
              <textarea
                style={{
                  ...INP,
                  minHeight: 72,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                }}
                value={form.receipt_footer ?? ''}
                onChange={e => set('receipt_footer', e.target.value)}
                placeholder="Текст внизу чека..."
              />
            </Field>
            <ToggleRow
              label="Автоматически закрывать смену"
              value={form.auto_close_shift ?? false}
              onChange={v => set('auto_close_shift', v)}
            />
          </SectionCard>

          {/* БОНУСНАЯ ПРОГРАММА */}
          <SectionCard title="Бонусная программа">
            <Field label="Процент начисления бонусов (%)">
              <input
                type="number"
                style={INP}
                value={form.bonus_rate ?? ''}
                min={0}
                max={100}
                onChange={e => set('bonus_rate', Number(e.target.value))}
                placeholder="5"
              />
            </Field>
            <Field label="Максимальное списание бонусов от чека (%)">
              <input
                type="number"
                style={INP}
                value={form.bonus_max_spend ?? ''}
                min={0}
                max={100}
                onChange={e => set('bonus_max_spend', Number(e.target.value))}
                placeholder="50"
              />
            </Field>
            <Field label="Срок действия бонусов (дней)">
              <input
                type="number"
                style={INP}
                value={form.bonus_expiry_days ?? ''}
                min={0}
                onChange={e => set('bonus_expiry_days', Number(e.target.value))}
                placeholder="365"
              />
            </Field>
          </SectionCard>

          {/* УВЕДОМЛЕНИЯ */}
          <SectionCard title="Уведомления">
            <ToggleRow
              label="Уведомления в Telegram"
              value={form.telegram_notifications ?? false}
              onChange={v => set('telegram_notifications', v)}
            />
            <Field label="Порог низкого остатка (шт.)">
              <input
                type="number"
                style={INP}
                value={form.low_stock_threshold ?? ''}
                min={0}
                onChange={e => set('low_stock_threshold', Number(e.target.value))}
                placeholder="5"
              />
            </Field>
          </SectionCard>

          {/* Save button */}
          <button
            onClick={() => save.mutate(form)}
            disabled={save.isPending}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              border: 'none',
              background: save.isPending
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg, #7c3aed, #2563eb)',
              color: save.isPending ? 'var(--on-surface-variant)' : '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: save.isPending ? 'not-allowed' : 'pointer',
              transition: 'all 0.18s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {save.isPending ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>
                  progress_activity
                </span>
                Сохранение...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                Сохранить изменения
              </>
            )}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </div>
  )
}
