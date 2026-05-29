'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader, Toggle, INP, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'

export default function BonusesPage() {
  const qc = useQueryClient()
  const { show } = useToast()

  const [enabled, setEnabled] = useState(true)
  const [rate, setRate] = useState('5')
  const [minPurchase, setMinPurchase] = useState('0')
  const [maxSpend, setMaxSpend] = useState('50')
  const [expiryDays, setExpiryDays] = useState('0')
  const [onDebt, setOnDebt] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/system/settings'),
  })

  useEffect(() => {
    if (!data?.settings) return
    const map = data.settings
    if (map.bonus_enabled !== undefined) setEnabled(map.bonus_enabled !== 'false')
    if (map.bonus_accrual_rate) setRate(map.bonus_accrual_rate)
    if (map.bonus_min_purchase) setMinPurchase(map.bonus_min_purchase)
    if (map.bonus_max_spend) setMaxSpend(map.bonus_max_spend)
    if (map.bonus_expiry_days) setExpiryDays(map.bonus_expiry_days)
    if (map.bonus_accrual_on_debt !== undefined) setOnDebt(map.bonus_accrual_on_debt === 'true')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (settings: Record<string, string>) => api.patch('/system/settings', settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: () => show('Не удалось сохранить настройки', 'error'),
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

  const exampleAmount = 1000
  const exampleBonus = Math.floor(exampleAmount * parseFloat(rate || '0') / 100)
  const exampleMax = Math.floor(exampleAmount * parseFloat(maxSpend || '0') / 100)
  const belowMin = parseFloat(minPurchase || '0') > exampleAmount

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Бонусная программа" subtitle="Начисление и списание баллов" />

      <div style={{ padding: '20px 16px var(--bottom-nav-clear, 24px)', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, margin: '0 auto', width: '100%' }}>

        {/* Hero toggle */}
        <div style={{
          borderRadius: 20, padding: 24, position: 'relative', overflow: 'hidden',
          background: enabled
            ? 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(245,158,11,0.08) 100%)'
            : 'rgba(255,255,255,0.04)',
          border: enabled ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(255,255,255,0.08)',
          transition: 'all 0.4s ease',
          boxShadow: enabled ? '0 0 40px rgba(234,179,8,0.1)' : 'none',
        }}>
          {enabled && (
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,179,8,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: enabled ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s', boxShadow: enabled ? '0 0 20px rgba(234,179,8,0.3)' : 'none' }}>
                <Icon name="star" size={28} color={enabled ? '#EAB308' : 'var(--on-surface-variant)'} style={{ transition: 'color 0.3s' }} />
              </div>
              <div>
                <p style={{ fontSize: 17, fontWeight: 800, margin: 0, color: enabled ? 'var(--on-surface)' : 'var(--on-surface-variant)' }}>Программа лояльности</p>
                <p style={{ fontSize: 13, color: enabled ? '#EAB308' : 'rgba(204,195,216,0.4)', margin: '4px 0 0', fontWeight: 600 }}>
                  {enabled ? '● Активна' : '○ Отключена'}
                </p>
              </div>
            </div>
            <Toggle value={enabled} onChange={setEnabled} color="#EAB308" />
          </div>
        </div>

        {/* Accrual section */}
        <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="add_circle" size={16} color="#EAB308" />
            </div>
            <span style={{ ...LBL, margin: 0, color: '#EAB308' }}>Начисление</span>
          </div>

          <div>
            <label style={LBL}>Процент начисления</label>
            <div style={{ position: 'relative' }}>
              <input type="number" min="0" max="100" value={rate} onChange={e => setRate(e.target.value)} style={{ ...INP, paddingRight: 40 }} />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#EAB308', fontWeight: 700, fontSize: 16 }}>%</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>
              За покупку 1 000 ₽ → <strong style={{ color: '#EAB308' }}>{Math.floor(1000 * parseFloat(rate || '0') / 100)} бонусов</strong>
            </p>
          </div>

          <div>
            <label style={LBL}>Минимальная сумма покупки (₽)</label>
            <input type="number" min="0" value={minPurchase} onChange={e => setMinPurchase(e.target.value)} style={INP} />
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>
              Бонусы не начисляются при покупках ниже этой суммы
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 3px' }}>Начислять при долге</p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Учитывать долговые платежи</p>
            </div>
            <Toggle value={onDebt} onChange={setOnDebt} color="#EAB308" />
          </div>
        </div>

        {/* Redemption section */}
        <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="remove_circle" size={16} color="#EAB308" />
            </div>
            <span style={{ ...LBL, margin: 0, color: '#EAB308' }}>Списание</span>
          </div>

          <div>
            <label style={LBL}>Макс. % оплаты бонусами</label>
            <div style={{ position: 'relative' }}>
              <input type="number" min="0" max="100" value={maxSpend} onChange={e => setMaxSpend(e.target.value)} style={{ ...INP, paddingRight: 40 }} />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#EAB308', fontWeight: 700, fontSize: 16 }}>%</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>
              Гость может оплатить бонусами не более {maxSpend}% от суммы
            </p>
          </div>

          <div>
            <label style={LBL}>Срок действия бонусов (дней)</label>
            <input type="number" min="0" value={expiryDays} onChange={e => setExpiryDays(e.target.value)} style={INP} />
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>
              {expiryDays === '0' ? 'Бонусы не сгорают' : `Бонусы сгорают через ${expiryDays} дней`}
            </p>
          </div>
        </div>

        {/* Live preview */}
        <div style={{ padding: 20, borderRadius: 18, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon name="calculate" size={16} color="#EAB308" />
            <span style={{ ...LBL, margin: 0, color: '#EAB308' }}>Пример расчёта · 1 000 ₽</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                label: 'Начисление',
                value: belowMin ? 'Ниже порога' : `+${exampleBonus} бонусов`,
                ok: !belowMin,
                icon: 'star',
              },
              {
                label: 'Макс. списание',
                value: `${exampleMax} ₽`,
                ok: true,
                icon: 'payments',
              },
              {
                label: 'Срок действия',
                value: expiryDays === '0' ? 'Бессрочно' : `${expiryDays} дней`,
                ok: true,
                icon: 'schedule',
              },
            ].map(({ label, value, ok, icon }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={icon} size={14} color="var(--on-surface-variant)" />
                  <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{label}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: ok ? '#EAB308' : '#F43F5E', fontFamily: "'JetBrains Mono',monospace" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
            background: saved
              ? 'rgba(16,185,129,0.8)'
              : saveMut.isPending
              ? 'rgba(255,255,255,0.08)'
              : 'linear-gradient(135deg, #EAB308, #F97316)',
            color: saveMut.isPending ? 'var(--on-surface-variant)' : '#000',
            fontSize: 15, fontWeight: 800,
            transition: 'all 0.3s',
            boxShadow: saved ? '0 4px 20px rgba(16,185,129,0.3)' : '0 4px 20px rgba(234,179,8,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {saved
            ? <><Icon name="check_circle" size={18} />Сохранено!</>
            : saveMut.isPending
            ? 'Сохраняем…'
            : <><Icon name="save" size={18} />Сохранить настройки</>
          }
        </button>
      </div>
    </div>
  )
}
