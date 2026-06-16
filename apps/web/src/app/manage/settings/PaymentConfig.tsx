'use client'
/**
 * Блок «Приём оплат» (вкладка «Заведение»).
 *
 * Активный СБП-эквайер НЕ выбирается вручную — одно заведение использует один
 * эквайер, тот, чьи ключи введены во вкладке «Интеграции». Здесь — только
 * информация о выбранном эквайере и его специфичные настройки + тестовый режим.
 */
import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

interface PayCfg {
  sbpProvider: string
  sbpProviderLabel: string
  sbpConfigured: boolean
  fiscalProvider: string
  fiscalLabel: string
  fiscalStandalone: boolean
  testMode: boolean
  vatCode: number
  defaultPhone: string
  itemized: boolean
  fiscalMethods: string[]
  receiptFooter: string
}

// Способы оплаты, которые можно включать/исключать из фискализации (порядок — от
// «реальных денег» к служебным).
const PAY_METHODS: { key: string; label: string }[] = [
  { key: 'cash', label: 'Наличные' },
  { key: 'card', label: 'Карта' },
  { key: 'transfer', label: 'СБП / Перевод' },
  { key: 'split', label: 'Раздельная' },
  { key: 'certificate', label: 'Сертификат' },
  { key: 'deposit', label: 'Депозит' },
  { key: 'debt', label: 'Долг' },
  { key: 'bonus', label: 'Бонусы' },
]

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0' }
const divider: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)' }

export function PaymentConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const { data } = useQuery<PayCfg>({ queryKey: ['payment-config'], queryFn: () => api.get('/system/payment-config') })
  const save = useMutation({
    mutationFn: (patch: Partial<PayCfg>) => api.put('/system/payment-config', patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-config'] }); show('Настройки оплат сохранены', 'success') },
    onError: () => show('Не удалось сохранить', 'error'),
  })
  if (!data) return null

  const isYooKassa = data.sbpProvider === 'yookassa'

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="point_of_sale" size={18} color="#a78bfa" />
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Приём оплат</p>
      </div>

      <span style={{ ...LBL, margin: '4px 0 0' }}>Активный СБП-эквайер</span>
      {data.sbpConfigured ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)' }}>
          <Icon name="check_circle" size={18} color="#10B981" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{data.sbpProviderLabel}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <Icon name="info" size={18} color="#F59E0B" />
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Эквайер не настроен — введите ключи во вкладке «Интеграции».</span>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '4px 0 0', lineHeight: 1.5 }}>
        Заведение использует один эквайер — тот, чьи ключи введены в «Интеграциях». Кнопка «СБП» на кассе работает через него.
      </p>

      {data.sbpConfigured && (
        <>
          <div style={{ ...divider, margin: '10px 0 0' }} />
          <label style={toggleRow}>
            <span style={{ fontSize: 13.5 }}>Тестовый режим <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— песочница эквайера (без реальных денег)</span></span>
            <input type="checkbox" checked={data.testMode} disabled={save.isPending} onChange={(e) => save.mutate({ testMode: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#8B5CF6' }} />
          </label>
        </>
      )}

      {/* Фискализация 54-ФЗ применяется ко ВСЕМ продажам (включая наличные). */}
      <div style={{ ...divider, margin: '10px 0 0' }} />
      <span style={{ ...LBL, margin: '8px 0 2px' }}>Фискализация 54-ФЗ</span>
      {data.fiscalStandalone ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)' }}>
          <Icon name="check_circle" size={18} color="#10B981" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{data.fiscalLabel}</span>
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>— чек по каждой продаже</span>
        </div>
      ) : isYooKassa ? (
        <>
          <label style={toggleRow}>
            <span style={{ fontSize: 13.5 }}>Чеки через ЮKassa <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— ЮKassa сама пробивает чек при оплате</span></span>
            <input type="checkbox" checked={data.fiscalProvider === 'yookassa'} disabled={save.isPending} onChange={(e) => save.mutate({ fiscalProvider: e.target.checked ? 'yookassa' : '' })} style={{ width: 18, height: 18, accentColor: '#8B5CF6' }} />
          </label>
          {data.fiscalProvider === 'yookassa' && (
            <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.5 }}>
              Чек уходит, если у гостя в карточке есть телефон (фискализируются только оплаты через ЮKassa).
            </p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.5 }}>
          Подключите кассу 54-ФЗ (АТОЛ Онлайн) во вкладке «Интеграции» — она пробивает чек по каждой продаже, включая наличные.
        </p>
      )}

      {/* Тонкая настройка фискализации — когда чек реально пробивается. */}
      {!!data.fiscalProvider && (
        <>
          <label style={{ ...toggleRow, marginTop: 4 }}>
            <span style={{ fontSize: 13.5 }}>Позиции в чеке <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— детально (товары) вместо одной строки «Оплата по чеку»</span></span>
            <input type="checkbox" checked={data.itemized} disabled={save.isPending} onChange={(e) => save.mutate({ itemized: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#8B5CF6' }} />
          </label>

          <div style={divider} />
          <span style={{ ...LBL, margin: '8px 0 2px' }}>Какие оплаты фискализировать</span>
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '0 0 6px', lineHeight: 1.5 }}>
            Снимите галочку — оплаты этим способом НЕ уходят в налоговую (например, скрыть наличные, депозит или долг).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PAY_METHODS.map((m) => {
              const on = data.fiscalMethods.includes(m.key)
              return (
                <button key={m.key} disabled={save.isPending}
                  onClick={() => {
                    const next = on ? data.fiscalMethods.filter((x) => x !== m.key) : [...data.fiscalMethods, m.key]
                    save.mutate({ fiscalMethods: next })
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 11, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    border: on ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.12)',
                    background: on ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: on ? '#34d399' : 'var(--on-surface-variant)',
                  }}>
                  <Icon name={on ? 'check_circle' : 'radio_button_unchecked'} size={14} color={on ? '#34d399' : 'var(--on-surface-variant)'} />
                  {m.label}
                </button>
              )
            })}
          </div>

          <div style={{ ...divider, margin: '12px 0 0' }} />
          <span style={{ ...LBL, margin: '8px 0 2px' }}>Подпись в чеке</span>
          <input
            type="text" defaultValue={data.receiptFooter} key={data.receiptFooter} maxLength={256}
            placeholder="Напр.: Спасибо за визит! Клуб «Титан»"
            onBlur={(e) => { if (e.target.value !== data.receiptFooter) save.mutate({ receiptFooter: e.target.value }) }}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 13.5 }}
          />
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Доп. текст внизу фискального чека (печатается кассой). Сохраняется по выходу из поля.
          </p>
        </>
      )}
    </div>
  )
}
