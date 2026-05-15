'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

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
  const [filter, setFilter] = useState<FilterTab>('all')
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [newQty, setNewQty] = useState('')
  const [note, setNote] = useState('')

  const { data } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu-items-inventory'],
    queryFn: () => api.get('/menu/items'),
  })

  const allItems = data?.items ?? []

  const lowStockCount = allItems.filter(i => i.trackStock && i.stockQuantity <= i.minThreshold).length

  const maxQty = useMemo(() => Math.max(...allItems.map(i => i.stockQuantity), 1), [allItems])

  const filtered = useMemo(() => {
    if (filter === 'low') return allItems.filter(i => i.trackStock && i.stockQuantity <= i.minThreshold)
    if (filter === 'untracked') return allItems.filter(i => !i.trackStock)
    return allItems
  }, [allItems, filter])

  const patchMut = useMutation({
    mutationFn: ({ id, stockQuantity }: { id: string; stockQuantity: number }) =>
      api.patch(`/inventory/${id}`, { stockQuantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items-inventory'] }),
  })

  function adjustInline(item: MenuItem, delta: number) {
    const next = Math.max(0, item.stockQuantity + delta)
    patchMut.mutate({ id: item.id, stockQuantity: next })
  }

  function openEdit(item: MenuItem) {
    setSelected(item)
    setNewQty(String(item.stockQuantity))
    setNote('')
  }

  function closeSheet() {
    setSelected(null)
    setNewQty('')
    setNote('')
  }

  function saveEdit() {
    if (!selected) return
    patchMut.mutate({ id: selected.id, stockQuantity: parseInt(newQty) || 0 })
    closeSheet()
  }

  function stockColor(item: MenuItem) {
    if (!item.trackStock) return 'var(--on-surface-variant)'
    if (item.stockQuantity <= item.minThreshold) return '#EF4444'
    if (item.stockQuantity <= item.minThreshold * 2) return '#F59E0B'
    return '#10B981'
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'low', label: 'Ниже порога' },
    { key: 'untracked', label: 'Не отслеживается' },
  ]

  const isOpen = !!selected

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Остатки</h1>
            <p style={{ fontSize: 12, color: lowStockCount > 0 ? '#EF4444' : 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {lowStockCount > 0 ? `${lowStockCount} товаров ниже порога` : 'Все в норме'}
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, paddingBottom: 16 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              style={{ padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', background: filter === t.key ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)', color: filter === t.key ? '#c4b5fd' : 'var(--on-surface-variant)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '16px 32px 80px', flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>inventory_2</span>
            <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Нет товаров</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((item) => {
              const barWidth = Math.min(100, (item.stockQuantity / maxQty) * 100)
              const color = stockColor(item)
              return (
                <div
                  key={item.id}
                  className="glass-l2"
                  style={{ borderRadius: 14, padding: '14px 18px', cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => openEdit(item)}>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{item.category ?? '—'}</div>
                    </div>

                    {/* Threshold */}
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 2 }}>порог</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.trackStock ? item.minThreshold : '—'}</div>
                    </div>

                    {/* Stock qty */}
                    <div style={{ textAlign: 'right', minWidth: 50 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{item.stockQuantity}</div>
                      <div style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>шт</div>
                    </div>
                  </div>

                  {/* Stock bar */}
                  <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>

                  {/* Quick adjust buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                    <button
                      onClick={e => { e.stopPropagation(); adjustInline(item, -1) }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                    >−</button>
                    <button
                      onClick={e => { e.stopPropagation(); adjustInline(item, 1) }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                    >+</button>
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
          maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px' }}>
          {selected?.name}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 20px' }}>
          Текущий остаток: <strong style={{ color: selected ? stockColor(selected) : undefined }}>{selected?.stockQuantity} шт</strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Новое количество</label>
            <input style={INP} type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="Введите количество" />
          </div>
          <div>
            <label style={LBL}>Причина / заметка</label>
            <input style={INP} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: поставка, инвентаризация…" />
          </div>
          <button
            onClick={saveEdit}
            style={{ width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 15, fontWeight: 700 }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
