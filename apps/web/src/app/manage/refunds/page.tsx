'use client'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { PageHeader, Sheet, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { Icon } from '@/components/Icon'

const REASON_LABELS: Record<string, string> = {
  return: 'Возврат товара',
  exchange: 'Обмен',
  discount: 'Скидка',
  damage: 'Брак',
}

interface Refund {
  id: string
  checkId: string
  totalAmount: string
  refundType: 'full' | 'partial'
  reason: string
  note?: string | null
  createdAt: string
}

function fmtDate(s?: string) {
  if (!s) return '—'
  try { return format(new Date(s), 'd MMM yyyy, HH:mm', { locale: ru }) } catch { return '—' }
}

export default function RefundsPage() {
  const [selected, setSelected] = useState<Refund | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['refunds'],
    queryFn: () => api.get<{ refunds: Refund[] }>('/refunds'),
  })

  const refunds = data?.refunds ?? []
  const total = refunds.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader title="Возвраты" subtitle={refunds.length > 0 ? `${refunds.length} · на сумму ${formatMoney(total)}` : 'История возвратов'} />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : refunds.length === 0 ? (
          <StateView state="empty" icon="refund" title="Возвратов нет" description="Здесь появятся все проведённые возвраты по чекам." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {refunds.map(r => (
              <button key={r.id} onClick={() => setSelected(r)} className="glass-l2" style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: 14, padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'rgba(251,113,133,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="refund" size={22} color="var(--danger)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{REASON_LABELS[r.reason] ?? r.reason}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--on-surface-variant)' }}>
                    {r.refundType === 'partial' ? 'Частичный' : 'Полный'} · чек #{r.checkId.slice(0, 8)} · {fmtDate(r.createdAt)}
                  </p>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(-(parseFloat(r.totalAmount) || 0))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Возврат" desktopSize="sm">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...LBL, margin: 0 }}>Сумма</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(-(parseFloat(selected.totalAmount) || 0))}</span>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <div><span style={LBL}>Тип</span><p style={{ margin: 0, fontSize: 14 }}>{selected.refundType === 'partial' ? 'Частичный' : 'Полный'}</p></div>
            <div><span style={LBL}>Причина</span><p style={{ margin: 0, fontSize: 14 }}>{REASON_LABELS[selected.reason] ?? selected.reason}</p></div>
            <div><span style={LBL}>Чек</span><p style={{ margin: 0, fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>#{selected.checkId.slice(0, 8)}</p></div>
            {selected.note && (<div><span style={LBL}>Комментарий</span><p style={{ margin: 0, fontSize: 14 }}>{selected.note}</p></div>)}
            <div><span style={LBL}>Дата</span><p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface-variant)' }}>{fmtDate(selected.createdAt)}</p></div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
