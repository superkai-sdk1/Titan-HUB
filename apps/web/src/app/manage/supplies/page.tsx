'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

const UNITS = ['кг', 'г', 'л', 'мл', 'шт']

interface SupplyItem {
  name: string
  quantity: number
  unit: string
  costPerUnit: number
}

interface Supply {
  id: string
  date: string
  supplier?: string
  items: SupplyItem[]
}

interface DraftItem extends SupplyItem {
  _key: number
  itemId?: string      // привязка к inventory item для индикатора цены
  lastPrice?: number   // последняя цена из базы
}

function emptyItem(): DraftItem {
  return { _key: Date.now() + Math.random(), name: '', quantity: 1, unit: 'шт', costPerUnit: 0 }
}

function PriceDiff({ current, last }: { current: number; last: number | undefined }) {
  if (!last || !current || last === current) return null
  const diff = current - last
  const isUp = diff > 0
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
      padding: '2px 6px', borderRadius: 6, letterSpacing: '0.04em', marginLeft: 4,
      background: isUp ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)',
      color: isUp ? '#F43F5E' : '#10B981',
    }}>
      {isUp ? '↑' : '↓'} {Math.abs(diff).toLocaleString('ru')} ₽
    </span>
  )
}

export default function SuppliesPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])

  const { data } = useQuery({
    queryKey: ['supplies'],
    queryFn: () => api.get<{ supplies: Supply[] }>('/supplies'),
  })

  // Inventory items for the optional item picker
  const { data: inventoryData } = useQuery({
    queryKey: ['menu', 'items', 'all'],
    queryFn: () => api.get<{ items: { id: string; name: string; stockQuantity: number }[] }>('/menu/items/all'),
    enabled: showModal,
  })
  const inventoryItems = inventoryData?.items ?? []

  // Fetch last prices for items linked to inventory
  async function fetchLastPrice(itemId: string): Promise<number | null> {
    try {
      const res = await api.get<{ lastPrice: number | null }>(`/supplies/items/${itemId}/last-price`)
      return res.lastPrice
    } catch { return null }
  }

  async function handleInventorySelect(key: number, itemId: string) {
    const invItem = inventoryItems.find(i => i.id === itemId)
    if (!invItem) return
    const lastPrice = itemId ? await fetchLastPrice(itemId) : undefined
    setItems(prev => prev.map(i => i._key === key
      ? { ...i, itemId, name: invItem.name, lastPrice: lastPrice ?? undefined }
      : i
    ))
  }

  const create = useMutation({
    mutationFn: (body: { supplier: string; items: { itemId?: string; name: string; unit: string; quantity: number; costPerUnit: number }[] }) =>
      api.post('/supplies', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplies'] })
      setShowModal(false)
      setSupplier('')
      setItems([emptyItem()])
    },
  })

  const supplies = [...(data?.supplies ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  const totalCost = items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)

  function updateItem(key: number, field: keyof SupplyItem, value: string | number) {
    setItems(prev => prev.map(i => (i._key === key ? { ...i, [field]: value } : i)))
  }

  function handleSubmit() {
    create.mutate({
      supplier,
      items: items.map(({ itemId, name, quantity, unit, costPerUnit }) => ({ itemId, name, quantity, unit, costPerUnit })),
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Закупки</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
            {supplies.length} {supplies.length === 1 ? 'закупка' : supplies.length >= 2 && supplies.length <= 4 ? 'закупки' : 'закупок'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary, #a78bfa) 100%)',
            color: '#fff', flexShrink: 0,
          }}
        >
          <Icon name="add" size={18} />
          Добавить
        </button>
      </div>

      {/* List */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {supplies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--on-surface-variant)' }}>
            <Icon name="inventory_2" size={56} style={{ display: 'block', marginBottom: 12, opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 15 }}>Закупок нет</p>
          </div>
        ) : (
          supplies.map(supply => {
            const total = supply.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)
            const isOpen = expanded === supply.id
            return (
              <div key={supply.id} className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : supply.id)}
                  style={{
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>
                        {format(new Date(supply.date), 'd MMM yyyy', { locale: ru })}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.08)', color: 'var(--on-surface-variant)',
                      }}>
                        {supply.items.length} поз.
                      </span>
                    </div>
                    {supply.supplier && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--on-surface-variant)' }}>{supply.supplier}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>
                      {total.toLocaleString('ru')} ₽
                    </p>
                  </div>
                  <Icon name="expand_more" size={20} color="var(--on-surface-variant)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px 16px' }}>
                    {supply.items.map((item, idx) => {
                      const itemTotal = item.quantity * item.costPerUnit
                      return (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: idx < supply.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--on-surface)' }}>{item.name}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--on-surface-variant)' }}>
                              {item.quantity} {item.unit} × {item.costPerUnit.toLocaleString('ru')} ₽
                            </p>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', flexShrink: 0 }}>
                            {itemTotal.toLocaleString('ru')} ₽
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          zIndex: 50, display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            width: '100%', maxHeight: '90vh', overflowY: 'auto',
            background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Новая закупка</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <Icon name="close" size={22} color="var(--on-surface-variant)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LBL}>Поставщик</label>
                <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Название поставщика" style={INP} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label style={{ ...LBL, margin: 0 }}>Позиции</label>
                  <button
                    onClick={() => setItems(prev => [...prev, emptyItem()])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, background: 'none',
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
                      padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--on-surface)',
                    }}
                  >
                    <Icon name="add" size={14} />
                    Добавить
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {items.map((item, idx) => (
                    <div key={item._key} className="glass-l1" style={{ borderRadius: 12, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>
                          Позиция {idx + 1}
                        </span>
                        {items.length > 1 && (
                          <button
                            onClick={() => setItems(prev => prev.filter(i => i._key !== item._key))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                          >
                            <Icon name="delete" size={18} color="#f87171" />
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Optional: link to inventory item for price history */}
                        {inventoryItems.length > 0 && (
                          <div>
                            <label style={LBL}>Из инвентаря (опционально)</label>
                            <select
                              value={item.itemId ?? ''}
                              onChange={e => handleInventorySelect(item._key, e.target.value)}
                              style={SEL}
                            >
                              <option value="">— ввести вручную —</option>
                              {inventoryItems.map(inv => (
                                <option key={inv.id} value={inv.id}>{inv.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <input
                          placeholder="Название *"
                          value={item.name}
                          onChange={e => updateItem(item._key, 'name', e.target.value)}
                          style={INP}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={LBL}>Кол-во</label>
                            <input
                              type="number"
                              min={0}
                              value={item.quantity}
                              onChange={e => updateItem(item._key, 'quantity', parseFloat(e.target.value) || 0)}
                              style={INP}
                            />
                          </div>
                          <div>
                            <label style={LBL}>Ед.</label>
                            <select
                              value={item.unit}
                              onChange={e => updateItem(item._key, 'unit', e.target.value)}
                              style={SEL}
                            >
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center' }}>
                              Цена/ед.
                              <PriceDiff current={item.costPerUnit} last={item.lastPrice} />
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={item.costPerUnit}
                              onChange={e => updateItem(item._key, 'costPerUnit', parseFloat(e.target.value) || 0)}
                              style={INP}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Итого</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--on-surface)' }}>
                  {totalCost.toLocaleString('ru')} ₽
                </span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={create.isPending || items.some(i => !i.name.trim())}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontSize: 15, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary, #a78bfa) 100%)',
                  opacity: create.isPending || items.some(i => !i.name.trim()) ? 0.5 : 1,
                  boxSizing: 'border-box',
                }}
              >
                {create.isPending ? 'Сохранение...' : 'Сохранить закупку'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
