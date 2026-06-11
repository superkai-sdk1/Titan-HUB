'use client'
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { PageHeader, Sheet, Button, IconButton, ConfirmDialog, Chip, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

interface Expense { id: string; expenseDate: string; category: string; amount: number; description?: string; unitPrice?: string | number | null; quantity?: string | number | null }
interface StaffRow { staffId: string; nickname: string; role: string | null; salary: number; salaryCash: number; salaryTransfer: number; salaryCount: number; compCost: number; compRetail: number; compChecks: number; total: number }
interface Summary {
  period: { from: string; to: string }
  categories: { category: string; amount: number }[]
  opexTotal: number
  salary: { total: number; cash: number; transfer: number; byStaff: any[] }
  staffComp: { cost: number; retail: number; checksCount: number; byStaff: any[] }
  byStaff: StaffRow[]
  pnlTotal: number
  staffTotal: number
  expenses: Expense[]
}

// Ключи строго совпадают с category в БД (text+CHECK, миграция 039).
const CATEGORY_MAP: Record<string, [string, string, string]> = {
  rent:        ['Аренда',       'home',        '#10B981'],
  utilities:   ['Коммунальные', 'bolt',        '#F59E0B'],
  supplies:    ['Закупки',      'inventory_2', '#4cd7f6'],
  consumables: ['Расходники',   'cleaning_services', '#22C55E'],
  tobacco:     ['Табак',        'smoking_rooms', '#D97706'],
  salary:      ['Зарплата',     'payments',    '#8B5CF6'],
  marketing:   ['Маркетинг',    'campaign',    '#F43F5E'],
  equipment:   ['Оборудование', 'build',       '#0EA5E9'],
  other:       ['Прочее',       'category',    '#94A3B8'],
}
const ROLE_LABEL: Record<string, string> = { owner: 'Владелец', staff: 'Сотрудник' }

// ─── Период по БИЗНЕС-ДНЮ (09:00→06:00), как в дашборде аналитики ──────────────
const MSK_OFFSET = 3 * 3600 * 1000
function mskBizDay(daysAgo = 0): string {
  return new Date(Date.now() + MSK_OFFSET - 9 * 3600000 - daysAgo * 86400000).toISOString().split('T')[0]
}
type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: '7d', label: '7 дней' },
  { key: '30d', label: '30 дней' },
  { key: 'month', label: 'Месяц' },
  { key: 'custom', label: 'Период' },
]
function periodRange(preset: Preset, cf: string, ct: string): { from: string; to: string } {
  switch (preset) {
    case 'today': return { from: mskBizDay(0), to: mskBizDay(0) }
    case 'yesterday': return { from: mskBizDay(1), to: mskBizDay(1) }
    case '7d': return { from: mskBizDay(6), to: mskBizDay(0) }
    case '30d': return { from: mskBizDay(29), to: mskBizDay(0) }
    case 'month': { const m = new Date(Date.now() + MSK_OFFSET).toISOString().slice(0, 7); return { from: `${m}-01`, to: mskBizDay(0) } }
    case 'custom': return { from: cf || mskBizDay(6), to: ct || mskBizDay(0) }
  }
}
function periodLabel(preset: Preset, from: string, to: string): string {
  if (preset === 'custom' || preset === 'month') return from === to ? from : `${from} — ${to}`
  return PRESETS.find(o => o.key === preset)?.label ?? ''
}

// ─── Позиции расхода (как в поставке): название, категория, цена за ед., кол-во ──
type Pos = { name: string; category: string; unitPrice: string; qty: string }
const blankPos = (): Pos => ({ name: '', category: 'other', unitPrice: '', qty: '1' })
const numIn = (s: string) => parseFloat((s || '').replace(',', '.')) || 0
const posTotal = (p: Pos) => numIn(p.unitPrice) * numIn(p.qty)
// Категории формы — без «Зарплата» (она начисляется на странице «Зарплата»).
const FORM_CATEGORIES = Object.entries(CATEGORY_MAP).filter(([k]) => k !== 'salary')

// Строка позиции с автоподбором по названию (последняя цена для аналитики).
function PosRow({ pos, idx, onChange, onRemove, canRemove }: { pos: Pos; idx: number; onChange: (patch: Partial<Pos>) => void; onRemove: () => void; canRemove: boolean }) {
  const [sugs, setSugs] = useState<{ name: string; unitPrice: number | null; category: string }[]>([])
  const [focused, setFocused] = useState(false)
  const timer = useRef<any>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = pos.name.trim()
    if (!q || !focused) { setSugs([]); return }
    timer.current = setTimeout(async () => {
      try { const r = await api.get<{ items: any[] }>(`/expenses/catalog?q=${encodeURIComponent(q)}`); setSugs(r.items ?? []) } catch { setSugs([]) }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [pos.name, focused])
  const total = posTotal(pos)
  const [, , catColor] = CATEGORY_MAP[pos.category] ?? CATEGORY_MAP.other
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input value={pos.name} onChange={e => onChange({ name: e.target.value })} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} placeholder="Название позиции" style={INP} />
          {focused && sugs.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: 'rgba(29,26,36,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              {sugs.map((s, i) => {
                const [cl, , cc] = CATEGORY_MAP[s.category] ?? CATEGORY_MAP.other
                return (
                  <button key={i} type="button" onMouseDown={e => e.preventDefault()}
                    onClick={() => { onChange({ name: s.name, category: s.category || pos.category, unitPrice: s.unitPrice != null ? String(s.unitPrice) : pos.unitPrice }); setFocused(false) }}
                    style={{ width: '100%', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: cc }}>{cl}</span>
                    {s.unitPrice != null && <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>{s.unitPrice.toLocaleString('ru')} ₽</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {canRemove && <button type="button" onClick={onRemove} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.08)', color: '#F87171', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={16} /></button>}
      </div>
      {/* Категория позиции */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {FORM_CATEGORIES.map(([key, [label, icon, color]]) => (
          <button key={key} type="button" onClick={() => onChange({ category: key })}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, border: `1px solid ${pos.category === key ? color : 'rgba(255,255,255,0.1)'}`, background: pos.category === key ? `${color}22` : 'rgba(255,255,255,0.04)', color: pos.category === key ? color : 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Icon name={icon} size={13} />{label}
          </button>
        ))}
      </div>
      {/* Цена × кол-во = сумма */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={pos.unitPrice} onChange={e => onChange({ unitPrice: e.target.value })} placeholder="Цена/шт" style={{ ...INP, flex: 1 }} />
        <span style={{ color: 'var(--on-surface-variant)' }}>×</span>
        <input type="number" inputMode="decimal" min="0" step="0.001" value={pos.qty} onChange={e => onChange({ qty: e.target.value })} placeholder="Кол-во" style={{ ...INP, width: 80 }} />
        <span style={{ color: 'var(--on-surface-variant)' }}>=</span>
        <span style={{ minWidth: 80, textAlign: 'right', fontWeight: 800, color: catColor, fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(total)}</span>
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)

  const [preset, setPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  useEffect(() => {
    try {
      const raw = localStorage.getItem('expenses:period')
      if (raw) { const p = JSON.parse(raw); if (p.preset) setPreset(p.preset); if (p.customFrom) setCustomFrom(p.customFrom); if (p.customTo) setCustomTo(p.customTo) }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('expenses:period', JSON.stringify({ preset, customFrom, customTo })) } catch { /* ignore */ }
  }, [preset, customFrom, customTo])
  const { from, to } = periodRange(preset, customFrom, customTo)
  const periodText = periodLabel(preset, from, to)

  const today = new Date().toISOString().slice(0, 10)
  const [formDate, setFormDate] = useState(today)
  const [positions, setPositions] = useState<Pos[]>([blankPos()])

  const { data, isLoading } = useQuery<Summary>({
    queryKey: ['expenses', 'summary', from, to],
    queryFn: () => api.get(`/expenses/summary?from=${from}&to=${to}`),
  })

  const pnlTotal = data?.pnlTotal ?? 0
  const staffTotal = data?.staffTotal ?? 0
  const expenses = data?.expenses ?? []

  // Категории + зарплата отдельным баром (источник ЗП — salaryPayments).
  const catBars = useMemo(() => {
    const arr = [...(data?.categories ?? [])]
    if ((data?.salary.total ?? 0) > 0) arr.push({ category: 'salary', amount: data!.salary.total })
    return arr.sort((a, b) => b.amount - a.amount)
  }, [data])
  const maxCat = catBars[0]?.amount ?? 1

  const staffRows = useMemo(() => (data?.byStaff ?? []).filter(s => s.total > 0), [data])
  const maxStaff = staffRows[0]?.total ?? 1

  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses'] })
  const idemRef = useRef(crypto.randomUUID())

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/expenses', body),
    onSuccess: () => { invalidate(); closeForm(); idemRef.current = crypto.randomUUID() },
    onError: () => show('Не удалось добавить расход', 'error'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => invalidate(),
    onError: () => show('Не удалось удалить', 'error'),
  })

  function closeForm() { setShowForm(false); setFormDate(today); setPositions([blankPos()]) }
  const setPos = (i: number, patch: Partial<Pos>) => setPositions(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p))
  const addPos = () => setPositions(ps => [...ps, blankPos()])
  const removePos = (i: number) => setPositions(ps => ps.length > 1 ? ps.filter((_, j) => j !== i) : ps)
  const formTotal = positions.reduce((s, p) => s + posTotal(p), 0)
  function submitForm() {
    if (!formDate) return
    const items = positions
      .map(p => ({ category: p.category, description: p.name.trim() || undefined, unitPrice: numIn(p.unitPrice) || undefined, quantity: numIn(p.qty) || undefined, amount: Math.round(posTotal(p) * 100) / 100 }))
      .filter(it => it.amount > 0)
    if (items.length === 0) { show('Добавьте хотя бы одну позицию с суммой', 'error'); return }
    createMutation.mutate({ expenseDate: formDate, items, idempotencyKey: idemRef.current })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Расходы"
        subtitle={periodText}
        action={{ label: 'Добавить', icon: 'add', onClick: () => setShowForm(true) }}
      />

      {/* Период (бизнес-день) */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {PRESETS.map(f => (
              <Chip key={f.key} active={preset === f.key} onClick={() => setPreset(f.key)} size="sm">
                {f.label}
              </Chip>
            ))}
          </div>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...INP, flex: 1 }} />
              <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...INP, flex: 1 }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Два итога рядом */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#F43F5E', margin: '0 0 4px', lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(pnlTotal)}</p>
            <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Расходы (P&L)</p>
            <p style={{ fontSize: 10, color: 'rgba(204,195,216,0.45)', margin: '2px 0 0' }}>опекс + зарплата</p>
          </div>
          <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#8B5CF6', margin: '0 0 4px', lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(staffTotal)}</p>
            <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Затраты на персонал</p>
            <p style={{ fontSize: 10, color: 'rgba(204,195,216,0.45)', margin: '2px 0 0' }}>зарплата + себест. списаний</p>
          </div>
        </div>

        {/* Категории */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>По категориям</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface-variant)' }}>{periodText}</span>
          </div>
          {catBars.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catBars.map(({ category, amount }) => {
                const [label, icon, color] = CATEGORY_MAP[category] ?? CATEGORY_MAP.other
                const pct = Math.round((amount / maxCat) * 100)
                return (
                  <div key={category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={icon} size={12} color={color} />
                        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(amount)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', textAlign: 'center', padding: '12px 0', margin: 0 }}>Нет расходов за период</p>}
        </div>

        {/* По сотрудникам */}
        <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ ...LBL, margin: 0 }}>По сотрудникам — {periodText}</span>
          </div>
          {staffRows.length === 0 ? (
            <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Затрат на персонал за период нет</p>
          ) : staffRows.map((s, i) => (
            <div key={s.staffId ?? i} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#8B5CF6', flexShrink: 0 }}>{(s.nickname ?? '??').slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nickname ?? '—'}</p>
                    {s.role && ROLE_LABEL[s.role] && <span style={{ fontSize: 9, fontWeight: 700, color: '#8B5CF6', background: 'rgba(139,92,246,0.14)', borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ROLE_LABEL[s.role]}</span>}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.4 }}>
                    {s.salary > 0 && <>Зарплата {formatMoney(s.salary)} <span style={{ color: 'rgba(204,195,216,0.5)' }}>(нал {formatMoney(s.salaryCash)} / пер {formatMoney(s.salaryTransfer)})</span></>}
                    {s.salary > 0 && s.compCost > 0 && ' · '}
                    {s.compCost > 0 && <>Списания {formatMoney(s.compCost)} <span style={{ color: 'rgba(204,195,216,0.5)' }}>({s.compChecks})</span></>}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#8B5CF6', margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(s.total)}</p>
                  <p style={{ fontSize: 9, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>итого</p>
                </div>
              </div>
              <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.total / maxStaff) * 100}%`, background: '#8B5CF6', borderRadius: 9999 }} />
              </div>
            </div>
          ))}
          {(data?.staffComp.cost ?? 0) > 0 && (
            <p style={{ fontSize: 10, color: 'rgba(204,195,216,0.45)', margin: 0, padding: '10px 18px 14px', lineHeight: 1.5 }}>
              Себестоимость списаний уже учтена в общей себестоимости (COGS) дашборда — здесь показана отдельно и в итог «Расходы (P&L)» не входит.
            </p>
          )}
        </div>

        {/* Ручные расходы (без зарплаты) */}
        <div style={{ ...LBL, margin: '0 4px 10px' }}>Операционные расходы</div>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : expenses.length === 0 ? (
          <StateView state="empty" icon="receipt_long" title="Расходов нет" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map(e => {
              const [catLabel, catIcon, catColor] = CATEGORY_MAP[e.category] ?? CATEGORY_MAP.other
              let dateStr = ''
              try { dateStr = format(new Date(e.expenseDate), 'd MMM', { locale: ru }) } catch { dateStr = e.expenseDate }
              return (
                <div key={e.id} className="glass-l2" style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: `${catColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={catIcon} size={22} color={catColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--on-surface)', fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(e.amount)}</span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{dateStr}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 11, color: catColor, fontWeight: 700 }}>{catLabel}</span>
                      {e.description && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {e.description}</span>}
                      {e.quantity != null && e.unitPrice != null && (
                        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace" }}>· {Number(e.quantity)} × {Number(e.unitPrice).toLocaleString('ru')} ₽</span>
                      )}
                    </div>
                  </div>
                  <IconButton icon="delete" ariaLabel="Удалить расход" variant="danger" onClick={() => setDelId(e.id)} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={showForm} onClose={closeForm} title="Новый расход">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Дата</label><input style={INP} type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
          <div>
            <label style={LBL}>Позиции</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {positions.map((p, i) => (
                <PosRow key={i} pos={p} idx={i} onChange={(patch) => setPos(i, patch)} onRemove={() => removePos(i)} canRemove={positions.length > 1} />
              ))}
            </div>
            <button type="button" onClick={addPos} style={{ marginTop: 10, width: '100%', padding: '11px 0', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="add" size={16} /> Добавить позицию
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 4px' }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Итого</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#F43F5E', fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(formTotal)}</span>
          </div>
          <Button fullWidth size="lg" loading={createMutation.isPending} disabled={formTotal <= 0} onClick={submitForm} style={{ marginTop: 4 }}>Создать расход</Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => { if (delId) deleteMutation.mutate(delId); setDelId(null) }}
        title="Удалить расход?"
        confirmLabel="Удалить"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
