'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const INP: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const LBL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block',
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? '#8B5CF6' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </div>
  )
}

interface SettingRow { key: string; value: string }

export default function BonusesPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const [enabled, setEnabled] = useState(true)
  const [rate, setRate] = useState('5')
  const [minPurchase, setMinPurchase] = useState('0')
  const [maxSpend, setMaxSpend] = useState('50')
  const [expiryDays, setExpiryDays] = useState('0')
  const [onDebt, setOnDebt] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data } = useQuery<{ settings: SettingRow[] }>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/system/settings'),
  })

  useEffect(() => {
    if (!data?.settings) return
    const map = Object.fromEntries(data.settings.map(s => [s.key, s.value]))
    if (map.bonus_enabled !== undefined) setEnabled(map.bonus_enabled !== 'false')
    if (map.bonus_accrual_rate) setRate(map.bonus_accrual_rate)
    if (map.bonus_min_purchase) setMinPurchase(map.bonus_min_purchase)
    if (map.bonus_max_spend) setMaxSpend(map.bonus_max_spend)
    if (map.bonus_expiry_days) setExpiryDays(map.bonus_expiry_days)
    if (map.bonus_accrual_on_debt !== undefined) setOnDebt(map.bonus_accrual_on_debt === 'true')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (settings: Record<string, string>) => api.post('/system/settings', { settings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function handleSave() {
    saveMut.mutate({
      bonus_enabled: String(enabled),
      bonus_accrual_rate: rate,
      bonus_min_purchase: minPurchase,
      bonus_max_spend: maxSpend,
      bonus_expiry_days: expiryDays,
      bonus_accrual_on_debt: String(onDebt),
    })
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Бонусная программа</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Настройки начисления и списания</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Main toggle */}
        <div className="glass-l2" style={{ borderRadius: 18, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#EAB308', fontVariationSettings: "'FILL' 1" }}>star</span>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Бонусная программа</p>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{enabled ? 'Активна' : 'Отключена'}</p>
              </div>
            </div>
            <Toggle value={enabled} onChange={setEnabled} />
          </div>
        </div>

        {/* Settings */}
        <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
          <p style={{ ...LBL, margin: 0 }}>Параметры начисления</p>

          <div>
            <label style={LBL}>Процент начисления (%)</label>
            <input type="number" min="0" max="100" value={rate} onChange={e => setRate(e.target.value)} style={INP} />
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '6px 0 0' }}>
              За покупку на 1000 ₽ → {Math.floor(1000 * parseFloat(rate || '0') / 100)} бонусов
            </p>
          </div>

          <div>
            <label style={LBL}>Минимальная сумма покупки (₽)</label>
            <input type="number" min="0" value={minPurchase} onChange={e => setMinPurchase(e.target.value)} style={INP} />
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '6px 0 0' }}>
              Бонусы не начисляются при покупках ниже этой суммы
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Начислять при оплате долгом</p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Учитывать долговые платежи при начислении</p>
            </div>
            <Toggle value={onDebt} onChange={setOnDebt} />
          </div>
        </div>

        <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
          <p style={{ ...LBL, margin: 0 }}>Параметры списания</p>

          <div>
            <label style={LBL}>Макс. % оплаты бонусами (%)</label>
            <input type="number" min="0" max="100" value={maxSpend} onChange={e => setMaxSpend(e.target.value)} style={INP} />
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '6px 0 0' }}>
              Гость может оплатить бонусами не более {maxSpend}% от суммы
            </p>
          </div>

          <div>
            <label style={LBL}>Срок действия бонусов (дней, 0 = без срока)</label>
            <input type="number" min="0" value={expiryDays} onChange={e => setExpiryDays(e.target.value)} style={INP} />
          </div>
        </div>

        {/* Preview card */}
        <div style={{ padding: 20, borderRadius: 18, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
          <p style={{ ...LBL, color: '#EAB308', margin: '0 0 12px' }}>Пример расчёта</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Покупка на', value: '500 ₽', ok: parseFloat(minPurchase || '0') <= 500 },
              { label: 'Начислится', value: `${Math.floor(500 * parseFloat(rate || '0') / 100)} бонусов`, ok: true },
              { label: 'Макс. списание', value: `${Math.floor(500 * parseFloat(maxSpend || '0') / 100)} ₽`, ok: true },
            ].map(({ label, value, ok }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: ok ? 'var(--on-surface)' : '#F43F5E', fontFamily: "'JetBrains Mono',monospace" }}>{ok ? value : 'ниже порога'}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: 'pointer', background: saved ? 'rgba(16,185,129,0.8)' : 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 15, fontWeight: 700, transition: 'background 0.3s', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
        >
          {saved ? '✓ Сохранено' : saveMut.isPending ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
}
