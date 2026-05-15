'use client'
import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { PageHeader, Sheet, INP, LBL } from '@/components/manage/DesignSystem'

interface Expense {
  id: string
  date: string
  category: string
  amount: number
  comment?: string
}

const CATEGORY_MAP: Record<string, [string, string, string]> = {
  food:      ['Еда',          'restaurant',  '#10B981'],
  salary:    ['Зарплата',     'payments',    '#8B5CF6'],
  utilities: ['Коммунальные', 'bolt',        '#F59E0B'],
  supplies:  ['Закупки',      'inventory_2', '#4cd7f6'],
  marketing: ['Маркетинг',    'campaign',    '#F43F5E'],
  other:     ['Прочее',       'category',    '#94A3B8'],
}

type DateFilter = 'today' | 'week' | 'month' | 'all'

function formatAmount(n: number) { return n.toLocaleString('ru-RU') + ' ₽' }

function isInRange(dateStr: string, range: DateFilter): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  if (range === 'today') return d.toDateString() === now.toDateString()
  if (range === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
    return d >= weekAgo
  }
  if (range === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  return true
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('month')

  const today = new Date().toISOString().slice(0, 10)
  const [formDate, setFormDate] = useState(today)
  const [formCategory, setFormCategory] = useState('other')
  const [formAmount, setFormAmount] = useState('')
  const [formComment, setFormComment] = useState('')

  const { data } = useQuery<{ expenses: Expense[] }>({
    queryKey: ['expenses'],
    queryFn: () => api.get('/expenses'),
  })

  const allExpenses = data?.expenses ?? []
  const expenses = useMemo(() => [...allExpenses].filter(e => isInRange(e.date, dateFilter)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [allExpenses, dateFilter])
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  // Category breakdown
  const catTotals = useMemo(() => {
    const map: Record<string, number> = {}
    expenses.forEach(e => { map[e.category] = (map[e.category] ?? 0) + e.amount })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])
  const maxCat = catTotals[0]?.[1] ?? 1

  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses'] })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/expenses', body),
    onSuccess: () => { invalidate(); closeForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => invalidate(),
  })

  function closeForm() { setShowForm(false); setFormDate(today); setFormCategory('other'); setFormAmount(''); setFormComment('') }

  function submitForm() {
    const amt = parseFloat(formAmount)
    if (!formDate || isNaN(amt) || amt <= 0) return
    createMutation.mutate({ date: formDate, category: formCategory, amount: amt, comment: formComment })
  }

  const DATE_FILTERS: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'all', label: 'Всё' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Расходы"
        subtitle={formatAmount(total)}
        action={{ label: 'Добавить', icon: 'add', onClick: () => setShowForm(true) }}
      />

      {/* Filters */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', gap: 6 }}>
          {DATE_FILTERS.map(f => (
            <button key={f.key} onClick={() => setDateFilter(f.key)} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: dateFilter === f.key ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', color: dateFilter === f.key ? '#c4b5fd' : 'var(--on-surface-variant)', transition: 'all 0.15s' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {/* Total + category bars */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Итого за период</span>
            <span style={{ fontSize: 20, fontWeight: 800, fontStyle: 'italic', color: '#F43F5E', fontFamily: "'JetBrains Mono',monospace" }}>{formatAmount(total)}</span>
          </div>
          {catTotals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catTotals.map(([cat, amt]) => {
                const [label, icon, color] = CATEGORY_MAP[cat] ?? CATEGORY_MAP.other
                const pct = Math.round((amt / maxCat) * 100)
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12, color }}>{icon}</span>
                        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{formatAmount(amt)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {expenses.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60, gap: 16, color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.4 }}>receipt_long</span>
            <p style={{ margin: 0, fontSize: 15 }}>Расходов нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map(e => {
              const [catLabel, catIcon, catColor] = CATEGORY_MAP[e.category] ?? CATEGORY_MAP.other
              let dateStr = ''
              try { dateStr = format(new Date(e.date), 'd MMM', { locale: ru }) } catch { dateStr = e.date }
              return (
                <div key={e.id} className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: `${catColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 12px ${catColor}22` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: catColor }}>{catIcon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontStyle: 'italic', fontSize: 15, color: 'var(--on-surface)', fontFamily: "'JetBrains Mono',monospace" }}>{formatAmount(e.amount)}</span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{dateStr}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: catColor, fontWeight: 700 }}>{catLabel}</span>
                      {e.comment && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {e.comment}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteMutation.mutate(e.id)} disabled={deleteMutation.isPending} style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={showForm} onClose={closeForm} title="Новый расход">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Дата</label><input style={INP} type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>

          {/* Category pill grid */}
          <div>
            <label style={LBL}>Категория</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {Object.entries(CATEGORY_MAP).map(([key, [label, icon, color]]) => (
                <button key={key} onClick={() => setFormCategory(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${formCategory === key ? color : 'rgba(255,255,255,0.1)'}`, background: formCategory === key ? `${color}22` : 'rgba(255,255,255,0.04)', color: formCategory === key ? color : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>{label}
                </button>
              ))}
            </div>
          </div>

          <div><label style={LBL}>Сумма (₽)</label><input style={INP} type="number" min="0" step="0.01" placeholder="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} /></div>
          <div><label style={LBL}>Комментарий</label><input style={INP} placeholder="Описание расхода" value={formComment} onChange={e => setFormComment(e.target.value)} /></div>
          <button onClick={submitForm} disabled={createMutation.isPending} style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)', color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 4 }}>
            {createMutation.isPending ? 'Создание...' : 'Создать расход'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
