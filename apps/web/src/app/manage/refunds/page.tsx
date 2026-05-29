'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { PageHeader, Sheet, Button, ToggleRow, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

const REASONS = [
  ['return', 'Возврат товара'],
  ['exchange', 'Обмен'],
  ['discount', 'Скидка'],
  ['damage', 'Брак'],
] as const
const REASON_LABELS: Record<string, string> = Object.fromEntries(REASONS)

const METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'Перевод',
  deposit: 'Депозит', bonus: 'Бонусы', certificate: 'Сертификат', debt: 'Долг',
}

interface Tender { method: string; amount: number }

interface Refund {
  id: string
  checkId: string
  totalAmount: string
  refundType: 'full' | 'partial'
  reason: string
  note?: string | null
  // Разбивка возврата по способам оплаты (новые возвраты); у старых — null.
  tenders?: Tender[] | null
  // UUID оформившего возврат (без джойна на профиль в API /refunds).
  createdBy?: string | null
  createdAt: string
}

interface ClosedCheck {
  id: string
  totalAmount: string
  closedAt: string
  itemCount: number
  guestName?: string | null
}

interface PrepItem { itemId: string; name: string; quantity: number; priceAtTime: number; trackStock: boolean }
interface Prep {
  check: { id: string; totalAmount: string; closedAt: string; status: string; playerId?: string | null; certificateId?: string | null }
  items: PrepItem[]
  paidTotal: number
  refundedTotal: number
  maxRefund: number
  paidByMethod: Record<string, number>
  availableByMethod: Record<string, number>
}

function fmtDate(s?: string) {
  if (!s) return '—'
  try { return format(new Date(s), 'd MMM yyyy, HH:mm', { locale: ru }) } catch { return '—' }
}

export default function RefundsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [selected, setSelected] = useState<Refund | null>(null)

  // create flow
  const [creating, setCreating] = useState(false)
  const [step, setStep] = useState<'pick' | 'form'>('pick')
  const [prep, setPrep] = useState<Prep | null>(null)
  const [prepLoading, setPrepLoading] = useState(false)
  const [reason, setReason] = useState('return')
  const [tenderAmounts, setTenderAmounts] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [restoreStock, setRestoreStock] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['refunds'],
    queryFn: () => api.get<{ refunds: Refund[] }>('/refunds'),
  })

  const { data: closedData, isLoading: closedLoading } = useQuery({
    queryKey: ['checks', 'closed'],
    queryFn: () => api.get<{ checks: ClosedCheck[] }>('/pos/checks/closed'),
    enabled: creating && step === 'pick',
  })

  const createRefund = useMutation({
    mutationFn: (body: object) => api.post('/refunds', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['refunds'] }); show('Возврат оформлен', 'success'); closeCreate() },
    onError: (e) => show(e instanceof ApiError ? String((e.data as Record<string, unknown>)?.error ?? 'Не удалось оформить возврат') : 'Ошибка сети', 'error'),
  })

  const refunds = data?.refunds ?? []
  const total = refunds.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0)
  const closedChecks = closedData?.checks ?? []

  function openCreate() { setCreating(true); setStep('pick'); setPrep(null) }
  function closeCreate() { setCreating(false); setStep('pick'); setPrep(null); setTenderAmounts({}); setNote(''); setReason('return'); setRestoreStock(true) }

  async function loadPrepare(id: string) {
    setPrepLoading(true)
    try {
      const p = await api.get<Prep>(`/refunds/prepare/${id}`)
      setPrep(p)
      // По умолчанию — полный возврат по каждому способу оплаты.
      const init: Record<string, string> = {}
      for (const [m, v] of Object.entries(p.availableByMethod ?? {})) if (v > 0) init[m] = String(v)
      setTenderAmounts(init); setReason('return'); setNote(''); setRestoreStock(true)
      setStep('form')
    } catch {
      show('Не удалось загрузить чек', 'error')
    } finally {
      setPrepLoading(false)
    }
  }

  // Суммы по тендерам, ограниченные доступным; итог — их сумма.
  const tenderList = prep
    ? Object.entries(prep.availableByMethod ?? {})
        .filter(([, avail]) => avail > 0)
        .map(([method, avail]) => ({
          method,
          avail,
          amount: Math.min(Math.max(0, parseFloat(tenderAmounts[method] ?? '0') || 0), avail),
        }))
    : []
  const refundAmount = Math.round(tenderList.reduce((s, t) => s + t.amount, 0) * 100) / 100

  function submit() {
    if (!prep || refundAmount <= 0) return
    const tenders = tenderList.filter(t => t.amount > 0).map(t => ({ method: t.method, amount: t.amount }))
    if (tenders.length === 0) return
    const isFull = refundAmount >= prep.maxRefund - 0.01
    createRefund.mutate({
      checkId: prep.check.id,
      tenders,
      refundType: isFull ? 'full' : 'partial',
      reason,
      note: note.trim() || undefined,
      itemsToRestore: restoreStock ? prep.items.filter(i => i.trackStock && i.quantity > 0).map(i => ({ itemId: i.itemId, quantity: i.quantity })) : [],
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Возвраты"
        subtitle={refunds.length > 0 ? `${refunds.length} · на сумму ${formatMoney(total)}` : 'История возвратов'}
        action={{ label: 'Создать', icon: 'add', onClick: openCreate }}
      />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : refunds.length === 0 ? (
          <StateView state="empty" icon="refund" title="Возвратов нет" description="Нажмите «Создать», чтобы оформить возврат по чеку." />
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

      {/* Detail (read-only) */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Возврат" desktopSize="sm">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...LBL, margin: 0 }}>Сумма</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(-(parseFloat(selected.totalAmount) || 0))}</span>
            </div>

            {/* Разбивка по способам оплаты (если возврат хранит tenders). */}
            {selected.tenders && selected.tenders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
                <span style={LBL}>По способам оплаты</span>
                {selected.tenders.map((t, i) => (
                  <div key={`${t.method}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--on-surface-variant)' }}>{METHOD_LABELS[t.method] ?? t.method}</span>
                    <strong style={{ color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(-(Number(t.amount) || 0))}</strong>
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <div><span style={LBL}>Тип</span><p style={{ margin: 0, fontSize: 14 }}>{selected.refundType === 'partial' ? 'Частичный' : 'Полный'}</p></div>
            <div><span style={LBL}>Причина</span><p style={{ margin: 0, fontSize: 14 }}>{REASON_LABELS[selected.reason] ?? selected.reason}</p></div>
            <div><span style={LBL}>Чек</span><p style={{ margin: 0, fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>#{selected.checkId.slice(0, 8)}</p></div>
            {selected.note && (<div><span style={LBL}>Комментарий</span><p style={{ margin: 0, fontSize: 14 }}>{selected.note}</p></div>)}
            <div><span style={LBL}>Дата</span><p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface-variant)' }}>{fmtDate(selected.createdAt)}</p></div>
            {selected.createdBy && (<div><span style={LBL}>Оформил</span><p style={{ margin: 0, fontSize: 14, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)' }}>#{selected.createdBy.slice(0, 8)}</p></div>)}
          </div>
        )}
      </Sheet>

      {/* Create flow */}
      <Sheet open={creating} onClose={closeCreate} title={step === 'pick' ? 'Выберите чек' : 'Оформить возврат'} desktopSize="md">
        {step === 'pick' ? (
          closedLoading || prepLoading ? (
            <StateView state="loading" />
          ) : closedChecks.length === 0 ? (
            <StateView state="empty" icon="receipt_long" title="Нет закрытых чеков" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {closedChecks.map(ch => (
                <button key={ch.id} onClick={() => loadPrepare(ch.id)} className="glass-l2" style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: 12, padding: '12px 14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{ch.guestName || 'Гость'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--on-surface-variant)' }}>{ch.itemCount} поз. · {fmtDate(ch.closedAt)}</p>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(ch.totalAmount)}</span>
                  <Icon name="chevron_right" size={18} color="var(--on-surface-variant)" />
                </button>
              ))}
            </div>
          )
        ) : prep ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button onClick={() => setStep('pick')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
              <Icon name="arrow_back" size={16} /> К списку чеков
            </button>

            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--on-surface-variant)' }}>Оплачено</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(prep.paidTotal)}</strong></div>
              {prep.refundedTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--on-surface-variant)' }}>Уже возвращено</span><strong style={{ color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(prep.refundedTotal)}</strong></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--on-surface-variant)' }}>Доступно к возврату</span><strong style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(prep.maxRefund)}</strong></div>
            </div>

            <div>
              <label style={LBL}>Причина</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REASONS.map(([key, label]) => (
                  <button key={key} onClick={() => setReason(key)} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${reason === key ? 'var(--primary-violet)' : 'rgba(255,255,255,0.1)'}`, background: reason === key ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)', color: reason === key ? 'var(--primary-violet)' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={LBL}>Возврат по способам оплаты</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(prep.availableByMethod).filter(([, a]) => a > 0).map(([method, avail]) => (
                  <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--on-surface)' }}>
                      {METHOD_LABELS[method] ?? method}
                      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}> · до {formatMoney(avail)}</span>
                    </span>
                    <input
                      style={{ ...INP, width: 130, textAlign: 'right' }}
                      type="number" min="0" max={avail} inputMode="decimal"
                      value={tenderAmounts[method] ?? ''}
                      onChange={e => setTenderAmounts(prev => ({ ...prev, [method]: e.target.value }))}
                    />
                  </div>
                ))}
                {Object.values(prep.availableByMethod).every(a => a <= 0) && (
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Нечего возвращать — всё уже возвращено по этому чеку.</p>
                )}
              </div>
            </div>

            {prep.items.some(i => i.trackStock) && (
              <ToggleRow label="Вернуть товары на склад" subtitle="Остаток проданных позиций будет восстановлен" value={restoreStock} onChange={setRestoreStock} />
            )}

            <div>
              <label style={LBL}>Комментарий</label>
              <input style={INP} value={note} onChange={e => setNote(e.target.value)} placeholder="Необязательно" />
            </div>

            <Button fullWidth size="lg" loading={createRefund.isPending} disabled={refundAmount <= 0} onClick={submit} style={{ background: 'linear-gradient(135deg, #FB7185, #F43F5E)', boxShadow: '0 4px 20px rgba(251,113,133,0.3)' }}>
              Оформить возврат — {formatMoney(refundAmount)}
            </Button>
          </div>
        ) : (
          <StateView state="loading" />
        )}
      </Sheet>
    </div>
  )
}
