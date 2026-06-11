'use client'
import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

export type ItemsFilter = 'all' | 'low' | 'out' | 'untracked'

interface MenuItem {
  id: string
  name: string
  category?: string
  stockQuantity: number
  minThreshold: number
  reorderPoint?: number | null
  parLevel?: number | null
  trackStock: boolean
  costPrice?: string | number
  isService?: boolean
  linkedSpaceId?: string | null
  searchTags?: string[]
}

interface ItemStats {
  item: { id: string; name: string; stockQuantity: number; costPrice: number; price: number; minThreshold: number; trackStock: boolean }
  lastSupply: { date: string; quantity: number; costPerUnit: number } | null
  sales: { totalQty: number; totalRevenue: number; avgDaily: number; allTimeQty: number; series: { date: string; qty: number }[] }
}

interface Movement {
  id: string
  type: string
  delta: number
  qtyAfter: number
  unitCost: string | null
  sourceType: string | null
  sourceId: string | null
  reason: string | null
  note: string | null
  createdAt: string
  author: string | null
}

// Метаданные типов движений для ленты (best practice — журнал как UI).
const MOVE_META: Record<string, { label: string; icon: string; color: string }> = {
  opening:    { label: 'Открытие',     icon: 'flag',            color: '#94A3B8' },
  receipt:    { label: 'Приход',       icon: 'local_shipping',  color: '#34D399' },
  sale:       { label: 'Продажа',      icon: 'point_of_sale',   color: '#a78bfa' },
  return:     { label: 'Возврат',      icon: 'undo',            color: '#22D3EE' },
  adjustment: { label: 'Корректировка', icon: 'tune',           color: '#F59E0B' },
  write_off:  { label: 'Списание',     icon: 'delete_sweep',    color: '#F87171' },
  count:      { label: 'Ревизия',      icon: 'fact_check',      color: '#F59E0B' },
  transfer:   { label: 'Перемещение',  icon: 'swap_horiz',      color: '#94A3B8' },
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 800, margin: '3px 0 0', color: color ?? 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>{sub}</p>}
    </div>
  )
}

function SalesChart({ series }: { series: { date: string; qty: number }[] }) {
  const max = series.reduce((m, s) => Math.max(m, s.qty), 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 88 }}>
        {series.map((s, i) => (
          <div key={i} title={`${format(new Date(s.date), 'd MMM', { locale: ru })}: ${s.qty}`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ height: `${(s.qty / max) * 100}%`, minHeight: s.qty > 0 ? 3 : 0, borderRadius: 2, background: s.qty > 0 ? 'linear-gradient(180deg, #a78bfa, #8B5CF6)' : 'rgba(255,255,255,0.05)' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>{format(new Date(series[0]?.date ?? Date.now()), 'd MMM', { locale: ru })}</span>
        <span style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>сегодня</span>
      </div>
    </div>
  )
}

/* ─── Лента движений (журнал ledger) ─────────────────────────────────── */
function MovementsFeed({ itemId }: { itemId: string }) {
  const { data, isLoading } = useQuery<{ movements: Movement[] }>({
    queryKey: ['inventory-movements', itemId],
    queryFn: () => api.get(`/inventory/${itemId}/movements`),
  })
  const moves = data?.movements ?? []
  return (
    <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', margin: '0 0 12px', letterSpacing: '0.02em' }}>ДВИЖЕНИЯ СКЛАДА</p>
      {isLoading && !data ? (
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Загрузка…</p>
      ) : moves.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Движений пока нет.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {moves.map(m => {
            const meta = MOVE_META[m.type] ?? { label: m.type, icon: 'circle', color: '#94A3B8' }
            const up = m.delta > 0
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${meta.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={meta.icon} size={17} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>
                    {meta.label}
                    {m.reason ? <span style={{ fontWeight: 400, color: 'var(--on-surface-variant)' }}> · {m.reason}</span> : null}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>
                    {format(new Date(m.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}{m.author ? ` · ${m.author}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: up ? '#34D399' : '#F87171', fontVariantNumeric: 'tabular-nums' }}>{up ? '+' : ''}{m.delta}</p>
                  <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>→ {m.qtyAfter}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ACTION_BTN: React.CSSProperties = { padding: '0 16px', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }

export function ItemsTab({ filter, setFilter }: { filter: ItemsFilter; setFilter: (f: ItemsFilter) => void }) {
  const qc = useQueryClient()
  const { show } = useToast()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MenuItem | null>(null)
  // Формы карточки.
  const [reorder, setReorder] = useState('')
  const [par, setPar] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [writeOffQty, setWriteOffQty] = useState('')
  const [writeOffReason, setWriteOffReason] = useState('')

  const { data, isLoading } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu-items-inventory'],
    queryFn: () => api.get('/inventory'),
  })

  const { data: stats, isLoading: statsLoading } = useQuery<ItemStats>({
    queryKey: ['inventory-stats', selected?.id],
    queryFn: () => api.get(`/inventory/${selected!.id}/stats`),
    enabled: !!selected,
  })

  const { data: catsData } = useQuery<{ categories: { id: string; name: string }[] }>({
    queryKey: ['menu', 'categories'],
    queryFn: () => api.get('/menu/categories'),
  })
  const hiddenCatIds = useMemo(() => new Set(
    (catsData?.categories ?? [])
      .filter(c => { const n = (c.name ?? '').toLowerCase(); return n.includes('тариф') || n.includes('аренд') })
      .map(c => c.id),
  ), [catsData])

  // Склад — только физические товары (без услуг, аренды, тарифов).
  const allItems = (data?.items ?? []).filter(i =>
    !i.isService && !i.linkedSpaceId && !(i.category && hiddenCatIds.has(i.category)),
  )
  const threshOf = (i: MenuItem) => i.reorderPoint ?? i.minThreshold ?? 0
  const tracked = allItems.filter(i => i.trackStock)
  const lowStockCount = tracked.filter(i => i.stockQuantity > 0 && threshOf(i) > 0 && i.stockQuantity <= threshOf(i)).length
  const outCount = tracked.filter(i => i.stockQuantity <= 0).length
  const maxQty = useMemo(() => allItems.reduce((m, i) => Math.max(m, i.stockQuantity), 1), [allItems])

  const filtered = useMemo(() => {
    let result = allItems
    if (filter === 'low') result = result.filter(i => i.trackStock && i.stockQuantity > 0 && threshOf(i) > 0 && i.stockQuantity <= threshOf(i))
    else if (filter === 'out') result = result.filter(i => i.trackStock && i.stockQuantity <= 0)
    else if (filter === 'untracked') result = result.filter(i => !i.trackStock)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(i => i.name?.toLowerCase().includes(q) || (i.searchTags ?? []).some(t => t.toLowerCase().includes(q)))
    }
    return result
  }, [allItems, filter, search])

  function invalidateItem() {
    qc.invalidateQueries({ queryKey: ['menu-items-inventory'] })
    if (selected) {
      qc.invalidateQueries({ queryKey: ['inventory-stats', selected.id] })
      qc.invalidateQueries({ queryKey: ['inventory-movements', selected.id] })
    }
    qc.invalidateQueries({ queryKey: ['inventory-overview'] })
  }

  const patchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/inventory/${selected!.id}`, body),
    onSuccess: () => invalidateItem(),
    onError: () => show('Не удалось сохранить', 'error'),
  })
  const adjustMut = useMutation({
    mutationFn: (body: { adjustDelta: number; reason: string }) => api.patch(`/inventory/${selected!.id}`, body),
    onSuccess: () => { invalidateItem(); setAdjustQty(''); setAdjustReason(''); show('Остаток скорректирован', 'success') },
    onError: () => show('Не удалось скорректировать остаток', 'error'),
  })
  const writeOffMut = useMutation({
    mutationFn: (body: { quantity: number; reason: string }) => api.post(`/inventory/${selected!.id}/write-off`, body),
    onSuccess: () => { invalidateItem(); setWriteOffQty(''); setWriteOffReason(''); show('Списание проведено', 'success') },
    onError: () => show('Не удалось списать', 'error'),
  })

  function openDetail(item: MenuItem) {
    setSelected(item)
    setReorder(String(item.reorderPoint ?? item.minThreshold ?? 0))
    setPar(item.parLevel != null ? String(item.parLevel) : '')
    setAdjustQty(''); setAdjustReason(''); setWriteOffQty(''); setWriteOffReason('')
  }
  function closeSheet() { setSelected(null) }

  function saveThresholds() {
    if (!selected) return
    const rp = parseInt(reorder, 10)
    const pl = par === '' ? null : parseInt(par, 10)
    const body: Record<string, unknown> = {}
    if (!Number.isNaN(rp)) { body.reorderPoint = rp; body.minThreshold = rp }
    body.parLevel = pl != null && !Number.isNaN(pl) ? pl : null
    patchMut.mutate(body)
  }
  function applyAdjust() {
    const delta = parseInt(adjustQty, 10)
    if (Number.isNaN(delta) || delta === 0) return
    adjustMut.mutate({ adjustDelta: delta, reason: adjustReason.trim() || 'Ручная корректировка' })
  }
  function applyWriteOff() {
    const qty = parseInt(writeOffQty, 10)
    if (Number.isNaN(qty) || qty <= 0 || writeOffReason.trim().length === 0) return
    writeOffMut.mutate({ quantity: qty, reason: writeOffReason.trim() })
  }

  function stockColor(item: MenuItem) {
    if (!item.trackStock) return 'var(--on-surface-variant)'
    const t = threshOf(item)
    if (item.stockQuantity <= 0) return 'var(--danger)'
    if (t > 0 && item.stockQuantity <= t) return 'var(--danger)'
    if (t > 0 && item.stockQuantity <= t * 2) return 'var(--warning)'
    return 'var(--success)'
  }
  function stockLabel(item: MenuItem) {
    if (!item.trackStock) return null
    const t = threshOf(item)
    if (item.stockQuantity <= 0) return 'Нет'
    if (t > 0 && item.stockQuantity <= t) return 'Мало'
    if (t > 0 && item.stockQuantity <= t * 2) return 'Норм'
    return 'Ок'
  }

  const tabs: { key: ItemsFilter; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'low', label: `Мало (${lowStockCount})` },
    { key: 'out', label: `Нет (${outCount})` },
    { key: 'untracked', label: 'Без учёта' },
  ]

  return (
    <div>
      {/* Поиск + фильтр-чипы */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(t => {
            const active = filter === t.key
            const danger = t.key === 'low' || t.key === 'out'
            return (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{ padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', background: active ? (danger ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.2)') : 'rgba(255,255,255,0.06)', color: active ? (danger ? '#EF4444' : '#c4b5fd') : 'var(--on-surface-variant)' }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {isLoading && !data ? (
        <StateView state="loading" />
      ) : filtered.length === 0 ? (
        <StateView state="empty" icon="inventory_2" title="Нет товаров" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => {
            const barWidth = Math.min(100, (item.stockQuantity / maxQty) * 100)
            const color = stockColor(item)
            const lbl = stockLabel(item)
            return (
              <div key={item.id} className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.2s' }}
                onClick={() => openDetail(item)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  </div>
                  {item.trackStock && lbl && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${color}15`, color, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{lbl}</span>
                  )}
                  {item.trackStock ? (
                    <div style={{ textAlign: 'right', minWidth: 50, flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>{item.stockQuantity}</div>
                      <div style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>шт</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', flexShrink: 0 }}>Не отслеж.</span>
                  )}
                </div>
                {item.trackStock && (
                  <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                )}
                {item.trackStock && (
                  <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>точка заказа: {threshOf(item)}{item.parLevel != null ? ` · целевой: ${item.parLevel}` : ''}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={!!selected} onClose={closeSheet} title={selected?.name} desktopSize="lg">
        {statsLoading && !stats ? (
          <StateView state="loading" />
        ) : stats && selected ? (() => {
          const it = stats.item
          const profit = it.price - it.costPrice
          const marginPct = it.price > 0 ? Math.round((profit / it.price) * 100) : 0
          const stockVal = it.stockQuantity * it.costPrice
          const daysLeft = it.trackStock && stats.sales.avgDaily > 0 ? Math.ceil(it.stockQuantity / stats.sales.avgDaily) : null
          const qColor = !it.trackStock ? 'var(--on-surface-variant)' : it.stockQuantity <= (selected.reorderPoint ?? it.minThreshold) ? '#F43F5E' : '#34D399'
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Количество</p>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '2px 0 0', color: qColor, lineHeight: 1 }}>
                    {it.trackStock ? it.stockQuantity : '—'}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4, color: 'var(--on-surface-variant)' }}>{it.trackStock ? 'шт' : 'без учёта'}</span>
                  </p>
                </div>
                <StatTile label="Стоимость остатка" value={formatMoney(stockVal)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <StatTile label="Себестоимость" value={formatMoney(it.costPrice)} />
                <StatTile label="Цена" value={formatMoney(it.price)} />
                <StatTile label="Маржа" value={`${marginPct}%`} sub={formatMoney(profit)} color={profit >= 0 ? '#34D399' : '#F87171'} />
              </div>

              <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', letterSpacing: '0.02em' }}>ПРОДАЖИ · 30 ДНЕЙ</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>{stats.sales.totalQty} шт</span>
                </div>
                <SalesChart series={stats.sales.series} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatTile label="Выручка · 30 дней" value={formatMoney(stats.sales.totalRevenue)} sub={`всего продано: ${stats.sales.allTimeQty} шт`} />
                <StatTile label="В среднем в день" value={`${stats.sales.avgDaily.toFixed(1)} шт`} sub={daysLeft != null ? `хватит на ~${daysLeft} дн.` : undefined} />
              </div>

              {/* Последняя закупка */}
              <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(16,185,129,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="local_shipping" size={20} color="#34D399" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Последняя закупка</p>
                  {stats.lastSupply ? (
                    <p style={{ fontSize: 14, fontWeight: 700, margin: '2px 0 0' }}>
                      {format(new Date(stats.lastSupply.date), 'd MMMM yyyy', { locale: ru })}
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)' }}> · {stats.lastSupply.quantity} шт по {formatMoney(stats.lastSupply.costPerUnit)}</span>
                    </p>
                  ) : (
                    <p style={{ fontSize: 14, fontWeight: 600, margin: '2px 0 0', color: 'var(--on-surface-variant)' }}>Закупок не было</p>
                  )}
                </div>
              </div>

              {it.trackStock && (
                <>
                  {/* Параметры пополнения */}
                  <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <label style={LBL}>Параметры пополнения</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>Точка заказа</p>
                        <input style={INP} type="number" min="0" value={reorder} onChange={e => setReorder(e.target.value)} placeholder="Алерт при ≤" />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>Целевой запас</p>
                        <input style={INP} type="number" min="0" value={par} onChange={e => setPar(e.target.value)} placeholder="Дозаказ до" />
                      </div>
                    </div>
                    <button onClick={saveThresholds} disabled={patchMut.isPending} style={{ ...ACTION_BTN, width: '100%', marginTop: 10, background: 'var(--primary-violet)' }}>
                      {patchMut.isPending ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                  </div>

                  {/* Ручная корректировка остатка */}
                  <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <label style={LBL}>Корректировка остатка</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <input style={{ ...INP, width: 96, textAlign: 'center', flexShrink: 0 }} type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="±шт" />
                      <input style={{ ...INP, flex: 1 }} value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="Причина (необязательно)" />
                    </div>
                    <button onClick={applyAdjust} disabled={adjustMut.isPending || !adjustQty || parseInt(adjustQty, 10) === 0} style={{ ...ACTION_BTN, width: '100%', marginTop: 10, background: '#F59E0B', opacity: (!adjustQty || parseInt(adjustQty, 10) === 0) ? 0.5 : 1 }}>
                      {adjustMut.isPending ? 'Применяем…' : 'Скорректировать'}
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>Например, +5 или −3. Учётная правка ошибки (не списание).</p>
                  </div>

                  {/* Списание */}
                  <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.18)' }}>
                    <label style={LBL}>Списание (бой / порча / угощение)</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <input style={{ ...INP, width: 96, textAlign: 'center', flexShrink: 0 }} type="number" min="1" value={writeOffQty} onChange={e => setWriteOffQty(e.target.value)} placeholder="шт" />
                      <input style={{ ...INP, flex: 1 }} value={writeOffReason} onChange={e => setWriteOffReason(e.target.value)} placeholder="Причина *" />
                    </div>
                    <button onClick={applyWriteOff} disabled={writeOffMut.isPending || !writeOffQty || parseInt(writeOffQty, 10) <= 0 || !writeOffReason.trim()} style={{ ...ACTION_BTN, width: '100%', marginTop: 10, background: '#F43F5E', opacity: (!writeOffQty || parseInt(writeOffQty, 10) <= 0 || !writeOffReason.trim()) ? 0.5 : 1 }}>
                      {writeOffMut.isPending ? 'Списываем…' : 'Списать'}
                    </button>
                  </div>
                </>
              )}

              <MovementsFeed itemId={selected.id} />
            </div>
          )
        })() : null}
      </Sheet>
    </div>
  )
}
