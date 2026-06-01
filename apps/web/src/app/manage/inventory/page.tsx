'use client'
import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

type FilterTab = 'all' | 'low' | 'untracked'

interface ItemStats {
  item: { id: string; name: string; stockQuantity: number; costPrice: number; price: number; minThreshold: number; trackStock: boolean }
  lastSupply: { date: string; quantity: number; costPerUnit: number } | null
  sales: { totalQty: number; totalRevenue: number; avgDaily: number; allTimeQty: number; series: { date: string; qty: number }[] }
}

/* Мини-тайл статистики */
function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 800, margin: '3px 0 0', color: color ?? 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>{sub}</p>}
    </div>
  )
}

/* График продаж по дням (30 дней) */
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

interface MenuItem {
  id: string
  name: string
  category?: string
  stockQuantity: number
  minThreshold: number
  trackStock: boolean
  costPrice?: string | number
}

export default function InventoryPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [newThreshold, setNewThreshold] = useState('')

  // /inventory (не /menu/items): возвращает активные И неактивные позиции,
  // исключая только мягко удалённые. Скрытая из меню позиция всё равно учитывается
  // в остатках. /menu/items фильтрует isActive=true и прятал бы такие товары.
  const { data, isLoading } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu-items-inventory'],
    queryFn: () => api.get('/inventory'),
  })

  // Статистика позиции для карточки (грузится при открытии панели).
  const { data: stats, isLoading: statsLoading } = useQuery<ItemStats>({
    queryKey: ['inventory-stats', selected?.id],
    queryFn: () => api.get(`/inventory/${selected!.id}/stats`),
    enabled: !!selected,
  })

  const allItems = data?.items ?? []
  const lowStockCount = allItems.filter(i => i.trackStock && i.stockQuantity <= i.minThreshold).length
  // Сводка склада: стоимость остатка по себестоимости, заканчивающиеся (>0 и ≤ порога)
  // и отсутствующие (=0) позиции — только по товарам с учётом.
  const tracked = allItems.filter(i => i.trackStock)
  const stockValue = tracked.reduce((s, i) => s + i.stockQuantity * (parseFloat(String(i.costPrice ?? 0)) || 0), 0)
  const endingCount = tracked.filter(i => i.stockQuantity > 0 && i.stockQuantity <= i.minThreshold).length
  const outCount = tracked.filter(i => i.stockQuantity === 0).length
  // FIX #15: reduce вместо Math.max(...array) — спред падает на больших списках
  // (превышение лимита аргументов).
  const maxQty = useMemo(() => allItems.reduce((m, i) => Math.max(m, i.stockQuantity), 1), [allItems])

  const filtered = useMemo(() => {
    let result = allItems
    if (filter === 'low') result = result.filter(i => i.trackStock && i.stockQuantity <= i.minThreshold)
    else if (filter === 'untracked') result = result.filter(i => !i.trackStock)
    if (search) result = result.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()))
    return result
  }, [allItems, filter, search])

  // Какие позиции сейчас в процессе inline-обновления (по id).
  // Защищает от двойного тапа по ОДНОЙ позиции, не блокируя другие строки.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const patchMut = useMutation({
    mutationFn: (body: { id: string; stockQuantity?: number; adjustDelta?: number; minThreshold?: number; reason?: string }) =>
      api.patch(`/inventory/${body.id}`, { stockQuantity: body.stockQuantity, adjustDelta: body.adjustDelta, minThreshold: body.minThreshold, reason: body.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items-inventory'] }),
    onError: () => show('Не удалось обновить остаток', 'error'),
  })

  function adjustInline(item: MenuItem, delta: number) {
    if (pendingIds.has(item.id)) return // защита от двойного тапа по той же позиции
    setPendingIds(prev => new Set(prev).add(item.id))
    patchMut.mutate(
      { id: item.id, adjustDelta: delta },
      {
        onSettled: () => setPendingIds(prev => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        }),
      },
    )
  }

  function openDetail(item: MenuItem) { setSelected(item); setNewThreshold(String(item.minThreshold ?? 0)) }
  function closeSheet() { setSelected(null); setNewThreshold('') }
  function saveThreshold() {
    if (!selected) return
    const threshold = parseInt(newThreshold)
    // Меняем только порог пополнения (конфиг). Остаток здесь не редактируется.
    if (!Number.isNaN(threshold) && threshold !== (selected.minThreshold ?? 0)) {
      patchMut.mutate({ id: selected.id, minThreshold: threshold })
    }
    closeSheet()
  }

  function stockColor(item: MenuItem) {
    if (!item.trackStock) return 'var(--on-surface-variant)'
    if (item.stockQuantity <= item.minThreshold) return 'var(--danger)'
    if (item.stockQuantity <= item.minThreshold * 2) return 'var(--warning)'
    return 'var(--success)'
  }

  function stockLabel(item: MenuItem) {
    if (!item.trackStock) return null
    if (item.stockQuantity === 0) return 'Нет'
    if (item.stockQuantity <= item.minThreshold) return 'Мало'
    if (item.stockQuantity <= item.minThreshold * 2) return 'Норм'
    return 'Ок'
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'low', label: `Мало (${lowStockCount})` },
    { key: 'untracked', label: 'Без учёта' },
  ]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Остатки"
        subtitle={lowStockCount > 0 ? `${lowStockCount} товаров ниже порога` : 'Все товары в норме'}
      />

      {/* Filter bar */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{ padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', background: filter === t.key ? (t.key === 'low' ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.2)') : 'rgba(255,255,255,0.06)', color: filter === t.key ? (t.key === 'low' ? '#EF4444' : '#c4b5fd') : 'var(--on-surface-variant)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Сводка склада */}
        {data && tracked.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="payments" size={22} color="#a78bfa" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Стоимость склада</p>
                <p style={{ fontSize: 22, fontWeight: 800, margin: '1px 0 0', color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(stockValue)}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setFilter('low')} className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', border: filter === 'low' ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.08)' }}>
                <Icon name="warning" size={20} color="#F59E0B" />
                <p style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 0', color: '#F59E0B', lineHeight: 1 }}>{endingCount}</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>Заканчивается</p>
              </button>
              <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px' }}>
                <Icon name="remove_shopping_cart" size={20} color="#F43F5E" />
                <p style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 0', color: '#F43F5E', lineHeight: 1 }}>{outCount}</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>Нет в наличии</p>
              </div>
            </div>
          </div>
        )}
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
                <div key={item.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}44` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => openDetail(item)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    </div>
                    {item.trackStock && lbl && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${color}15`, color, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{lbl}</span>
                    )}
                    {item.trackStock && (
                      <div style={{ textAlign: 'right', minWidth: 50, flexShrink: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>{item.stockQuantity}</div>
                        <div style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>шт</div>
                      </div>
                    )}
                    {!item.trackStock && (
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', flexShrink: 0 }}>Не отслеж.</span>
                    )}
                  </div>

                  {item.trackStock && (
                    <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                  )}

                  {item.trackStock && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>порог: {item.minThreshold}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); adjustInline(item, -1) }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <button onClick={e => { e.stopPropagation(); adjustInline(item, 1) }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.08)', color: '#10B981', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onClose={closeSheet} title={selected?.name}>
        {statsLoading && !stats ? (
          <StateView state="loading" />
        ) : stats ? (() => {
          const it = stats.item
          const profit = it.price - it.costPrice
          const marginPct = it.price > 0 ? Math.round((profit / it.price) * 100) : 0
          const stockVal = it.stockQuantity * it.costPrice
          const daysLeft = it.trackStock && stats.sales.avgDaily > 0 ? Math.ceil(it.stockQuantity / stats.sales.avgDaily) : null
          const qColor = !it.trackStock ? 'var(--on-surface-variant)' : it.stockQuantity <= it.minThreshold ? '#F43F5E' : it.stockQuantity <= it.minThreshold * 2 ? '#F59E0B' : '#34D399'
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Остаток + стоимость остатка */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Количество</p>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '2px 0 0', color: qColor, lineHeight: 1 }}>
                    {it.trackStock ? it.stockQuantity : '—'}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4, color: 'var(--on-surface-variant)' }}>{it.trackStock ? 'шт' : 'без учёта'}</span>
                  </p>
                </div>
                <StatTile label="Стоимость остатка" value={formatMoney(stockVal)} />
              </div>

              {/* Цена / себестоимость / маржа */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <StatTile label="Себестоимость" value={formatMoney(it.costPrice)} />
                <StatTile label="Цена" value={formatMoney(it.price)} />
                <StatTile label="Маржа" value={`${marginPct}%`} sub={formatMoney(profit)} color={profit >= 0 ? '#34D399' : '#F87171'} />
              </div>

              {/* График продаж */}
              <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', letterSpacing: '0.02em' }}>ПРОДАЖИ · 30 ДНЕЙ</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>{stats.sales.totalQty} шт</span>
                </div>
                <SalesChart series={stats.sales.series} />
              </div>

              {/* Агрегаты продаж */}
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

              {/* Порог пополнения (конфиг, не остаток) */}
              {it.trackStock && (
                <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label style={LBL}>Порог пополнения</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...INP, flex: 1 }} type="number" min="0" value={newThreshold} onChange={e => setNewThreshold(e.target.value)} placeholder="Уведомлять, когда остаток ≤ порога" />
                    <button onClick={saveThreshold} disabled={patchMut.isPending} style={{ padding: '0 18px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>ОК</button>
                  </div>
                </div>
              )}
            </div>
          )
        })() : null}
      </Sheet>
    </div>
  )
}
