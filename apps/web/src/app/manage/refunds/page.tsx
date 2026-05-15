'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

type RefundStatus = 'pending' | 'approved' | 'rejected'

interface Refund {
  id: string
  clientName?: string
  checkNumber?: string
  amount: number
  reason?: string
  date: string
  status: RefundStatus
}

const STATUS_LABELS: Record<RefundStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён',
}

const STATUS_COLORS: Record<RefundStatus, string> = {
  pending: '#F59E0B',
  approved: '#10B981',
  rejected: 'rgba(204,195,216,0.4)',
}

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'pending', label: 'Ожидают' },
  { key: 'approved', label: 'Одобрены' },
  { key: 'rejected', label: 'Отклонены' },
]

export default function RefundsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState<Refund | null>(null)

  const { data } = useQuery({
    queryKey: ['refunds'],
    queryFn: () => api.get<{ refunds: Refund[] }>('/refunds'),
  })

  const approve = useMutation({
    mutationFn: (id: string) => api.put(`/refunds/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refunds'] })
      setSelected(null)
    },
  })

  const reject = useMutation({
    mutationFn: (id: string) => api.put(`/refunds/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refunds'] })
      setSelected(null)
    },
  })

  const allRefunds: Refund[] = data?.refunds ?? []
  const pendingCount = allRefunds.filter(r => r.status === 'pending').length

  const filtered = tab === 'all' ? allRefunds : allRefunds.filter(r => r.status === tab)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 0' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Возвраты</h1>
        <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--on-surface-variant)' }}>
          {pendingCount > 0 ? `${pendingCount} ожидают рассмотрения` : 'Нет ожидающих'}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 20px', display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 16px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--primary)' : 'var(--on-surface-variant)',
              borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, display: 'block', marginBottom: 12, opacity: 0.4 }}>undo</span>
            <p style={{ margin: 0, fontSize: 15 }}>Возвратов нет</p>
          </div>
        ) : (
          filtered.map(refund => (
            <button
              key={refund.id}
              onClick={() => setSelected(refund)}
              className="glass-l2"
              style={{
                width: '100%', border: 'none', cursor: 'pointer', borderRadius: 16,
                padding: '16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>
                    {refund.clientName || '—'}
                  </p>
                  {refund.checkNumber && (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--on-surface-variant)' }}>
                      Чек #{refund.checkNumber}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#f87171', flexShrink: 0 }}>
                  −{(refund.amount ?? 0).toLocaleString('ru')} ₽
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {refund.reason && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {refund.reason}
                    </p>
                  )}
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--on-surface-variant)' }}>
                    {format(new Date(refund.date), 'd MMM yyyy', { locale: ru })}
                  </p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                  background: `${STATUS_COLORS[refund.status]}22`,
                  color: STATUS_COLORS[refund.status],
                  border: `1px solid ${STATUS_COLORS[refund.status]}44`,
                }}>
                  {STATUS_LABELS[refund.status]}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Detail sheet */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            zIndex: 50, display: 'flex', alignItems: 'flex-end',
          }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          <div style={{
            width: '100%', background: 'var(--surface)', borderRadius: '24px 24px 0 0',
            padding: '24px 20px 40px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Возврат</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)' }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ ...LBL, margin: 0 }}>Сумма</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#f87171' }}>
                  −{(selected.amount ?? 0).toLocaleString('ru')} ₽
                </span>
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

              <div>
                <span style={LBL}>Клиент</span>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface)' }}>{selected.clientName || '—'}</p>
              </div>
              {selected.checkNumber && (
                <div>
                  <span style={LBL}>Номер чека</span>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface)' }}>#{selected.checkNumber}</p>
                </div>
              )}
              {selected.reason && (
                <div>
                  <span style={LBL}>Причина</span>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface)' }}>{selected.reason}</p>
                </div>
              )}
              <div>
                <span style={LBL}>Дата</span>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface)' }}>
                  {format(new Date(selected.date), 'd MMM yyyy', { locale: ru })}
                </p>
              </div>
              <div>
                <span style={LBL}>Статус</span>
                <span style={{
                  display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                  background: `${STATUS_COLORS[selected.status]}22`,
                  color: STATUS_COLORS[selected.status],
                  border: `1px solid ${STATUS_COLORS[selected.status]}44`,
                }}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>

              {selected.status === 'pending' && (
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    onClick={() => approve.mutate(selected.id)}
                    disabled={approve.isPending}
                    style={{
                      flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      fontSize: 14, fontWeight: 600, color: '#fff',
                      background: '#10B981', opacity: approve.isPending ? 0.6 : 1,
                    }}
                  >
                    {approve.isPending ? '...' : 'Одобрить'}
                  </button>
                  <button
                    onClick={() => reject.mutate(selected.id)}
                    disabled={reject.isPending}
                    style={{
                      flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      fontSize: 14, fontWeight: 600, color: '#fff',
                      background: '#EF4444', opacity: reject.isPending ? 0.6 : 1,
                    }}
                  >
                    {reject.isPending ? '...' : 'Отклонить'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
