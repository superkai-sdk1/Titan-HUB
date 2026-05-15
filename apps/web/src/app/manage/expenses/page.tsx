'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

interface Expense {
  id: string
  date: string
  category: string
  amount: number
  comment?: string
}

const CATEGORY_MAP: Record<string, [string, string, string]> = {
  food:       ['Еда',           'restaurant', '#10B981'],
  salary:     ['Зарплата',      'payments',   '#8B5CF6'],
  utilities:  ['Коммунальные',  'bolt',       '#F59E0B'],
  supplies:   ['Закупки',       'inventory_2','#4cd7f6'],
  marketing:  ['Маркетинг',     'campaign',   '#F43F5E'],
  other:      ['Прочее',        'category',   '#94A3B8'],
}

function formatAmount(n: number) {
  return n.toLocaleString('ru-RU') + ' ₽'
}

function getMonthTotal(expenses: Expense[]) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  return expenses
    .filter(e => {
      const d = new Date(e.date)
      return d.getFullYear() === y && d.getMonth() === m
    })
    .reduce((sum, e) => sum + e.amount, 0)
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const [formDate, setFormDate] = useState(today)
  const [formCategory, setFormCategory] = useState('other')
  const [formAmount, setFormAmount] = useState('')
  const [formComment, setFormComment] = useState('')

  const { data } = useQuery<{ expenses: Expense[] }>({
    queryKey: ['expenses'],
    queryFn: () => api.get('/expenses'),
  })

  const expenses = [...(data?.expenses ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const monthTotal = getMonthTotal(data?.expenses ?? [])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses'] })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/expenses', body),
    onSuccess: () => { invalidate(); closeForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => invalidate(),
  })

  function closeForm() {
    setShowForm(false)
    setFormDate(today)
    setFormCategory('other')
    setFormAmount('')
    setFormComment('')
  }

  function submitForm() {
    const amt = parseFloat(formAmount)
    if (!formDate || isNaN(amt) || amt <= 0) return
    createMutation.mutate({ date: formDate, category: formCategory, amount: amt, comment: formComment })
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  }

  const sheetStyle: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    borderRadius: '24px 24px 0 0',
    padding: 24, paddingBottom: 40,
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Расходы</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
            За этот месяц: {formatAmount(monthTotal)}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
            color: '#fff', fontWeight: 600, fontSize: 14,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
          Добавить
        </button>
      </div>

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16, color: 'var(--on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.4 }}>receipt_long</span>
          <p style={{ margin: 0, fontSize: 16 }}>Расходов нет</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {expenses.map(e => {
            const cat = CATEGORY_MAP[e.category] ?? CATEGORY_MAP.other
            const [catLabel, catIcon, catColor] = cat
            let dateStr = ''
            try {
              dateStr = format(new Date(e.date), 'd MMM', { locale: ru })
            } catch {
              dateStr = e.date
            }
            return (
              <div
                key={e.id}
                className="glass-l2"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16 }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                  background: `${catColor}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: catColor }}>{catIcon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontStyle: 'italic', fontSize: 15, color: 'var(--on-surface)' }}>
                      {formatAmount(e.amount)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{dateStr}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: catColor, fontWeight: 600 }}>{catLabel}</span>
                    {e.comment && (
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        · {e.comment}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={ev => { ev.stopPropagation(); deleteMutation.mutate(e.id) }}
                  disabled={deleteMutation.isPending}
                  style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                    color: '#EF4444', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div style={overlayStyle} onClick={closeForm}>
          <div className="glass-l1" style={sheetStyle} onClick={ev => ev.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Новый расход</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LBL}>Дата</label>
                <input
                  style={INP}
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                />
              </div>
              <div>
                <label style={LBL}>Категория</label>
                <select style={SEL} value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                  {Object.entries(CATEGORY_MAP).map(([key, [label]]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LBL}>Сумма (₽)</label>
                <input
                  style={INP}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                />
              </div>
              <div>
                <label style={LBL}>Комментарий</label>
                <input
                  style={INP}
                  placeholder="Описание расхода"
                  value={formComment}
                  onChange={e => setFormComment(e.target.value)}
                />
              </div>
              <button
                onClick={submitForm}
                disabled={createMutation.isPending}
                style={{
                  padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
                  color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 4,
                }}
              >
                {createMutation.isPending ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
