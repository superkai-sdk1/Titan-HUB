'use client'

import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, Button, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

type OpType = 'deposit' | 'withdrawal' | 'salary'

interface CashOp {
  id: string
  type: OpType
  amount: number
  description?: string
  createdBy?: string
  createdAt: string
}

interface Balance {
  start?: number
  cashPayments?: number
  deposits?: number
  withdrawals?: number
  total?: number
}

function relTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru })
  } catch {
    return '—'
  }
}

const OP_ICON: Record<OpType, { icon: string; color: string }> = {
  deposit:    { icon: 'add_circle',    color: 'var(--success)' },
  withdrawal: { icon: 'remove_circle', color: 'var(--danger)' },
  salary:     { icon: 'payments',      color: 'var(--primary-violet)' },
}

export default function CashOpsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [opType, setOpType] = useState<Exclude<OpType, 'salary'>>('deposit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const { data, isLoading } = useQuery<{ operations: CashOp[]; balance: Balance }>({
    queryKey: ['cashops'],
    queryFn: () => api.get('/cashops'),
  })

  const operations = [...(data?.operations ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const balance = data?.balance ?? {}
  const start = balance.start ?? 0
  const cashPayments = balance.cashPayments ?? 0
  const deposits = balance.deposits ?? 0
  const withdrawals = balance.withdrawals ?? 0
  const total = balance.total ?? (start + cashPayments + deposits - withdrawals)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cashops'] })
  // Стабильный ключ идемпотентности на одну операцию (защита от двойного клика);
  // обновляется после успешного сохранения.
  const idemRef = useRef(crypto.randomUUID())

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/cashops', body),
    onSuccess: () => { invalidate(); closeModal(); idemRef.current = crypto.randomUUID() },
    onError: () => show('Не удалось сохранить операцию', 'error'),
  })

  function openModal(type: Exclude<OpType, 'salary'>) {
    setOpType(type)
    setAmount('')
    setDescription('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setAmount('')
    setDescription('')
  }

  function handleSubmit() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    createMut.mutate({ type: opType, amount: amt, description: description.trim() || undefined, idempotencyKey: idemRef.current })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader title="Инкассация" subtitle="Текущий баланс смены" />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : (
          <>
            {/* Summary card */}
            <div className="glass-l2" style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 16 }}>
              <p style={{ ...LBL, margin: '0 0 4px' }}>В кассе сейчас</p>
              <div style={{ fontSize: 34, fontWeight: 800, fontStyle: 'italic', color: total >= 0 ? 'var(--success)' : 'var(--danger)', margin: '0 0 16px', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Открытие смены', value: start, color: 'var(--on-surface-variant)' },
                  { label: 'Наличные оплаты', value: cashPayments, color: 'var(--success)' },
                  { label: 'Внесено', value: deposits, color: 'var(--secondary)' },
                  { label: 'Изъято', value: withdrawals, color: 'var(--danger)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 3, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(value)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <Button variant="secondary" icon="add_circle" onClick={() => openModal('deposit')} style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>Внести</Button>
              <Button variant="secondary" icon="remove_circle" onClick={() => openModal('withdrawal')} style={{ borderColor: 'rgba(251,113,133,0.3)', background: 'rgba(251,113,133,0.1)', color: 'var(--danger)' }}>Изъять</Button>
            </div>

            {/* Operations list */}
            {operations.length === 0 ? (
              <StateView state="empty" icon="account_balance" title="Операций нет" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {operations.map((op) => {
                  const { icon, color } = OP_ICON[op.type] ?? OP_ICON.deposit
                  const isPositive = op.type === 'deposit'
                  return (
                    <div key={op.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: `color-mix(in srgb, ${color} 18%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={icon} size={22} color={color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{op.description || (op.type === 'deposit' ? 'Внесение' : op.type === 'withdrawal' ? 'Изъятие' : 'Зарплата')}</div>
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                          {op.createdBy ? `${op.createdBy} · ` : ''}{relTime(op.createdAt)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: isPositive ? 'var(--success)' : 'var(--danger)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(isPositive ? op.amount : -Math.abs(op.amount), { sign: true })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={showModal} onClose={closeModal} title={opType === 'deposit' ? 'Внести в кассу' : 'Изъять из кассы'} desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Сумма (₽)</label>
            <input style={INP} type="number" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus />
          </div>
          <div>
            <label style={LBL}>Описание</label>
            <input style={INP} value={description} onChange={e => setDescription(e.target.value)} placeholder="Комментарий к операции" />
          </div>
          <Button
            fullWidth
            size="lg"
            loading={createMut.isPending}
            disabled={!parseFloat(amount)}
            onClick={handleSubmit}
            style={opType === 'deposit'
              ? { background: 'linear-gradient(135deg, #10B981, #059669)', boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }
              : { background: 'linear-gradient(135deg, #FB7185, #F43F5E)', boxShadow: '0 4px 20px rgba(251,113,133,0.3)' }}
          >
            {opType === 'deposit' ? 'Внести' : 'Изъять'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
