'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

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

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽'
}

function relTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru })
  } catch {
    return '—'
  }
}

const OP_ICON: Record<OpType, { icon: string; color: string }> = {
  deposit:    { icon: 'add_circle',      color: '#10B981' },
  withdrawal: { icon: 'remove_circle',   color: '#EF4444' },
  salary:     { icon: 'payments',        color: '#8B5CF6' },
}

export default function CashOpsPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [opType, setOpType] = useState<OpType>('deposit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const { data } = useQuery<{ operations: CashOp[]; balance: Balance }>({
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

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/cashops', body),
    onSuccess: () => { invalidate(); closeModal() },
  })

  function openModal(type: OpType) {
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
    if (!amount) return
    createMut.mutate({ type: opType, amount: parseFloat(amount), description: description.trim() || undefined })
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>Инкассация</h1>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Текущий баланс смены</p>
      </div>

      <div style={{ padding: '20px 32px 80px', flex: 1 }}>
        {/* Summary card */}
        <div className="glass-l2" style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>В кассе сейчас</p>
          <div style={{ fontSize: 36, fontWeight: 800, color: total >= 0 ? '#10B981' : '#EF4444', margin: '0 0 16px' }}>{fmt(total)}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Открытие смены', value: start, color: 'var(--on-surface-variant)' },
              { label: 'Наличные оплаты', value: cashPayments, color: '#10B981' },
              { label: 'Внесено', value: deposits, color: '#4cd7f6' },
              { label: 'Изъято', value: withdrawals, color: '#EF4444' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 3, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color }}>{fmt(value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <button
            onClick={() => openModal('deposit')}
            style={{ padding: '14px', borderRadius: 14, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
            Внести
          </button>
          <button
            onClick={() => openModal('withdrawal')}
            style={{ padding: '14px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>remove_circle</span>
            Изъять
          </button>
        </div>

        {/* Operations list */}
        {operations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>account_balance</span>
            <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Операций нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {operations.map((op) => {
              const { icon, color } = OP_ICON[op.type] ?? OP_ICON.deposit
              const isPositive = op.type === 'deposit'
              return (
                <div key={op.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color }}>{icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{op.description || (op.type === 'deposit' ? 'Внесение' : op.type === 'withdrawal' ? 'Изъятие' : 'Зарплата')}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                      {op.createdBy ? `${op.createdBy} · ` : ''}{relTime(op.createdAt)}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: isPositive ? '#10B981' : '#EF4444', flexShrink: 0 }}>
                    {isPositive ? '+' : '−'}{fmt(Math.abs(op.amount))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal overlay */}
      {showModal && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      )}

      {/* Modal */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
          transform: showModal ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          background: 'rgba(29,26,36,0.98)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '24px 24px 0 0', padding: '20px 24px 32px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 20px' }}>
          {opType === 'deposit' ? 'Внести в кассу' : 'Изъять из кассы'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Тип операции</label>
            <select style={SEL} value={opType} onChange={e => setOpType(e.target.value as OpType)}>
              <option value="deposit">Внесение</option>
              <option value="withdrawal">Изъятие</option>
              <option value="salary">Зарплата</option>
            </select>
          </div>

          <div>
            <label style={LBL}>Сумма (₽)</label>
            <input style={INP} type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>

          <div>
            <label style={LBL}>Описание</label>
            <input style={INP} value={description} onChange={e => setDescription(e.target.value)} placeholder="Комментарий к операции" />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!amount}
            style={{ width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer', background: opType === 'deposit' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #EF4444, #DC2626)', color: '#fff', fontSize: 15, fontWeight: 700, opacity: !amount ? 0.5 : 1 }}
          >
            {opType === 'deposit' ? 'Внести' : 'Изъять'}
          </button>
        </div>
      </div>
    </div>
  )
}
