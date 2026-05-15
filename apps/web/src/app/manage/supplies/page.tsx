'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

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
}

function emptyItem(): DraftItem {
  return { _key: Date.now() + Math.random(), name: '', quantity: 1, unit: 'шт', costPerUnit: 0 }
}

export default function SuppliesPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])

  const { data } = useQuery({
    queryKey: ['supplies'],
    queryFn: () => api.get<{ supplies: Supply[] }>('/supplies'),
  })

  const create = useMutation({
    mutationFn: (body: { date: string; supplier: string; items: SupplyItem[] }) =>
      api.post('/supplies', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplies'] })
      setShowModal(false)
      setDate(new Date().toISOString().split('T')[0])
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
      date,
      supplier,
      items: items.map(({ name, quantity, unit, costPerUnit }) => ({ name, quantity, unit, costPerUnit })),
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
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Добавить
        </button>
      </div>

      {/* List */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {supplies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, display: 'block', marginBottom: 12, opacity: 0.4 }}>inventory_2</span>
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
                  <span className="material-symbols-outlined" style={{
                    fontSize: 20, color: 'var(--on-surface-variant)',
                    transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
                  }}>expand_more</span>
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
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)' }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LBL}>Дата</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INP} />
              </div>
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
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
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
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f87171' }}>delete</span>
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                            <label style={LBL}>Цена/ед.</label>
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
