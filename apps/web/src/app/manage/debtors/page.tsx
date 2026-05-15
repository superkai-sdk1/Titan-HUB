'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

interface Client {
  id: string
  nickname: string
  balance: number
  lastVisit?: string
  clientTier?: string
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

function avatarColor(name: string) {
  const hues = [0, 10, 350, 5, 355]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % hues.length
  return `hsl(${hues[h]}, 65%, 40%)`
}

function formatDate(str: string) {
  try {
    return format(new Date(str), 'd MMM yyyy', { locale: ru })
  } catch {
    return '—'
  }
}

export default function DebtorsPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Client | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const { data } = useQuery<{ clients: Client[] }>({
    queryKey: ['clients-debtors'],
    queryFn: () => api.get('/clients?filter=debtors'),
  })

  const allClients = data?.clients ?? []

  const debtors = useMemo(
    () =>
      allClients
        .filter(c => c.balance < 0)
        .sort((a, b) => a.balance - b.balance), // most negative first
    [allClients]
  )

  const totalDebt = debtors.reduce((sum, c) => sum + Math.abs(c.balance), 0)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clients-debtors'] })

  const payMut = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api.post(`/clients/${id}/balance`, { amount, reason }),
    onSuccess: () => { invalidate(); closeSheet() },
  })

  function openSheet(client: Client) {
    setSelected(client)
    setAmount(String(Math.abs(client.balance)))
    setNote('')
  }

  function closeSheet() {
    setSelected(null)
    setAmount('')
    setNote('')
  }

  function handlePay() {
    if (!selected || !amount) return
    payMut.mutate({ id: selected.id, amount: parseFloat(amount), reason: note.trim() || 'debt_payment' })
  }

  const isOpen = !!selected

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>Должники</h1>
        <p style={{ fontSize: 12, color: debtors.length > 0 ? '#EF4444' : 'var(--on-surface-variant)', margin: 0 }}>
          {debtors.length > 0 ? `Общий долг: ${fmt(totalDebt)} ₽` : 'Нет задолженностей'}
        </p>
      </div>

      {/* List */}
      <div style={{ padding: '16px 32px 80px', flex: 1 }}>
        {debtors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#10B981', opacity: 0.4, display: 'block', marginBottom: 12 }}>check_circle</span>
            <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Должников нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {debtors.map((client) => {
              const initial = (client.nickname ?? '?')[0].toUpperCase()
              const color = avatarColor(client.nickname ?? '')
              return (
                <div
                  key={client.id}
                  className="glass-l2"
                  style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
                >
                  {/* Avatar */}
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 17, fontWeight: 800, color: '#fff', border: '2px solid rgba(239,68,68,0.4)' }}>
                    {initial}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{client.nickname}</div>
                    {client.lastVisit && (
                      <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                        Последний визит: {formatDate(client.lastVisit)}
                      </div>
                    )}
                  </div>

                  {/* Balance + button */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#EF4444', fontStyle: 'italic' }}>
                      −{fmt(Math.abs(client.balance))} ₽
                    </div>
                    <button
                      onClick={() => openSheet(client)}
                      style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                    >
                      Погасить долг
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Overlay */}
      {isOpen && (
        <div onClick={closeSheet} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      )}

      {/* Bottom sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
          transform: isOpen ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          background: 'rgba(29,26,36,0.98)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '24px 24px 0 0', padding: '20px 24px 32px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px' }}>Погасить долг</h2>
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 6px' }}>
          Клиент: <strong style={{ color: 'var(--on-surface)' }}>{selected?.nickname}</strong>
        </p>
        <p style={{ fontSize: 13, margin: '0 0 20px' }}>
          Текущий баланс: <strong style={{ color: '#EF4444', fontStyle: 'italic' }}>
            −{fmt(Math.abs(selected?.balance ?? 0))} ₽
          </strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Сумма пополнения (₽)</label>
            <input
              style={INP}
              type="number"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Сумма"
            />
          </div>
          <div>
            <label style={LBL}>Заметка</label>
            <input
              style={INP}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Причина / комментарий"
            />
          </div>

          <button
            onClick={handlePay}
            disabled={!amount || parseFloat(amount) <= 0}
            style={{ width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff', fontSize: 15, fontWeight: 700, opacity: (!amount || parseFloat(amount) <= 0) ? 0.5 : 1 }}
          >
            Зачислить
          </button>
        </div>
      </div>
    </div>
  )
}
