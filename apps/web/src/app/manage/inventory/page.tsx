'use client'
import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, LBL } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

type FilterTab = 'all' | 'low' | 'untracked'

interface MenuItem {
  id: string
  name: string
  category?: string
  stockQuantity: number
  minThreshold: number
  trackStock: boolean
}

export default function InventoryPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [newQty, setNewQty] = useState('')
  const [note, setNote] = useState('')

  const { data, isLoading } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu-items-inventory'],
    queryFn: () => api.get('/menu/items'),
  })

  const allItems = data?.items ?? []
  const lowStockCount = allItems.filter(i => i.trackStock && i.stockQuantity <= i.minThreshold).length
  const maxQty = useMemo(() => Math.max(...allItems.map(i => i.stockQuantity), 1), [allItems])

  const filtered = useMemo(() => {
    let result = allItems
    if (filter === 'low') result = result.filter(i => i.trackStock && i.stockQuantity <= i.minThreshold)
    else if (filter === 'untracked') result = result.filter(i => !i.trackStock)
    if (search) result = result.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()))
    return result
  }, [allItems, filter, search])

  const patchMut = useMutation({
    mutationFn: (body: { id: string; stockQuantity?: number; adjustDelta?: number; reason?: string }) =>
      api.patch(`/inventory/${body.id}`, { stockQuantity: body.stockQuantity, adjustDelta: body.adjustDelta, reason: body.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items-inventory'] }),
    onError: () => show('Не удалось обновить остаток', 'error'),
  })

  function adjustInline(item: MenuItem, delta: number) {
    if (patchMut.isPending) return // защита от двойного тапа / гонки потерянного обновления
    patchMut.mutate({ id: item.id, adjustDelta: delta })
  }

  function openEdit(item: MenuItem) { setSelected(item); setNewQty(String(item.stockQuantity)); setNote('') }
  function closeSheet() { setSelected(null); setNewQty(''); setNote('') }
  function saveEdit() {
    if (!selected) return
    patchMut.mutate({ id: selected.id, stockQuantity: parseInt(newQty) || 0, reason: note.trim() || undefined })
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => openEdit(item)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{item.category ?? '—'}</div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Текущий остаток</span>
            <strong style={{ color: selected ? stockColor(selected) : undefined }}>{selected?.stockQuantity} шт</strong>
          </div>
          <div><label style={LBL}>Новое количество</label><input style={INP} type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="Введите количество" /></div>
          <div><label style={LBL}>Причина / заметка</label><input style={INP} value={note} onChange={e => setNote(e.target.value)} placeholder="Поставка, инвентаризация…" /></div>
          <button onClick={saveEdit} style={{ width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 15, fontWeight: 700 }}>
            Сохранить
          </button>
        </div>
      </Sheet>
    </div>
  )
}
