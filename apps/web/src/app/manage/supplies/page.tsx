'use client'
import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, Button, IconButton, INP, SEL, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

const UNITS = ['кг', 'г', 'л', 'мл', 'шт']

interface SupplyItem { name: string; quantity: number; unit: string; costPerUnit: number }
interface Supply { id: string; date: string; supplier?: string; items: SupplyItem[] }
interface DraftItem extends SupplyItem { _key: number; itemId?: string; lastPrice?: number }

function emptyItem(): DraftItem {
  return { _key: Date.now() + Math.random(), name: '', quantity: 1, unit: 'шт', costPerUnit: 0 }
}

function PriceDiff({ current, last }: { current: number; last: number | undefined }) {
  if (!last || !current || last === current) return null
  const diff = current - last
  const isUp = diff > 0
  return (
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 6px', borderRadius: 6, letterSpacing: '0.04em', marginLeft: 4, background: isUp ? 'rgba(251,113,133,0.15)' : 'rgba(16,185,129,0.15)', color: isUp ? 'var(--danger)' : 'var(--success)' }}>
      {isUp ? '↑' : '↓'} {formatMoney(Math.abs(diff))}
    </span>
  )
}

export default function SuppliesPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])

  const { data, isLoading } = useQuery({
    queryKey: ['supplies'],
    queryFn: () => api.get<{ supplies: Supply[] }>('/supplies'),
  })

  const { data: inventoryData } = useQuery({
    queryKey: ['menu', 'items', 'all'],
    queryFn: () => api.get<{ items: { id: string; name: string; stockQuantity: number }[] }>('/menu/items/all'),
    enabled: showModal,
  })
  const inventoryItems = inventoryData?.items ?? []

  async function fetchLastPrice(itemId: string): Promise<number | null> {
    try { const res = await api.get<{ lastPrice: number | null }>(`/supplies/items/${itemId}/last-price`); return res.lastPrice } catch { return null }
  }

  async function handleInventorySelect(key: number, itemId: string) {
    const invItem = inventoryItems.find(i => i.id === itemId)
    if (!invItem) return
    const lastPrice = itemId ? await fetchLastPrice(itemId) : undefined
    setItems(prev => prev.map(i => i._key === key ? { ...i, itemId, name: invItem.name, lastPrice: lastPrice ?? undefined } : i))
  }

  // Идемпотентный ключ: защита от двойного клика (двойной приход + COGS).
  const idemRef = useRef(crypto.randomUUID())
  const create = useMutation({
    mutationFn: (body: { supplier: string; items: { itemId?: string; name: string; unit: string; quantity: number; costPerUnit: number }[] }) =>
      api.post('/supplies', { ...body, idempotencyKey: idemRef.current }),
    onSuccess: () => { idemRef.current = crypto.randomUUID(); qc.invalidateQueries({ queryKey: ['supplies'] }); setShowModal(false); setSupplier(''); setItems([emptyItem()]) },
    onError: () => show('Не удалось сохранить закупку', 'error'),
  })

  const supplies = [...(data?.supplies ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const totalCost = items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)

  function updateItem(key: number, field: keyof SupplyItem, value: string | number) {
    setItems(prev => prev.map(i => (i._key === key ? { ...i, [field]: value } : i)))
  }

  function handleSubmit() {
    create.mutate({ supplier, items: items.map(({ itemId, name, quantity, unit, costPerUnit }) => ({ itemId, name, quantity, unit, costPerUnit })) })
  }

  const pluralSupplyWord = supplies.length === 1 ? 'закупка' : supplies.length >= 2 && supplies.length <= 4 ? 'закупки' : 'закупок'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Закупки"
        subtitle={`${supplies.length} ${pluralSupplyWord}`}
        action={{ label: 'Добавить', icon: 'add', onClick: () => setShowModal(true) }}
      />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : supplies.length === 0 ? (
          <StateView state="empty" icon="inventory_2" title="Закупок нет" />
        ) : (
          supplies.map(supply => {
            const total = supply.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)
            const isOpen = expanded === supply.id
            return (
              <div key={supply.id} className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
                <button onClick={() => setExpanded(isOpen ? null : supply.id)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{format(new Date(supply.date), 'd MMM yyyy', { locale: ru })}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: 'var(--on-surface-variant)' }}>{supply.items.length} поз.</span>
                    </div>
                    {supply.supplier && <p style={{ margin: 0, fontSize: 12, color: 'var(--on-surface-variant)' }}>{supply.supplier}</p>}
                  </div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</p>
                  <Icon name="expand_more" size={20} color="var(--on-surface-variant)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px 16px' }}>
                    {supply.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < supply.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--on-surface)' }}>{item.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--on-surface-variant)' }}>{item.quantity} {item.unit} × {formatMoney(item.costPerUnit)}</p>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.quantity * item.costPerUnit)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <Sheet open={showModal} onClose={() => setShowModal(false)} title="Новая закупка" desktopSize="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Поставщик</label><input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Название поставщика" style={INP} /></div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ ...LBL, margin: 0 }}>Позиции</label>
              <button onClick={() => setItems(prev => [...prev, emptyItem()])} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--on-surface)' }}>
                <Icon name="add" size={14} />Добавить
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((item, idx) => (
                <div key={item._key} className="glass-l1" style={{ borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>Позиция {idx + 1}</span>
                    {items.length > 1 && (
                      <IconButton icon="delete" ariaLabel="Удалить позицию" variant="danger" size={32} onClick={() => setItems(prev => prev.filter(i => i._key !== item._key))} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {inventoryItems.length > 0 && (
                      <div>
                        <label style={LBL}>Из инвентаря (опционально)</label>
                        <select value={item.itemId ?? ''} onChange={e => handleInventorySelect(item._key, e.target.value)} style={SEL}>
                          <option value="">— ввести вручную —</option>
                          {inventoryItems.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                        </select>
                      </div>
                    )}
                    <input placeholder="Название *" value={item.name} onChange={e => updateItem(item._key, 'name', e.target.value)} style={INP} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div><label style={LBL}>Кол-во</label><input type="number" min={0} inputMode="decimal" value={item.quantity} onChange={e => updateItem(item._key, 'quantity', parseFloat(e.target.value) || 0)} style={INP} /></div>
                      <div><label style={LBL}>Ед.</label><select value={item.unit} onChange={e => updateItem(item._key, 'unit', e.target.value)} style={SEL}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                      <div><label style={{ ...LBL, display: 'flex', alignItems: 'center' }}>Цена/ед.<PriceDiff current={item.costPerUnit} last={item.lastPrice} /></label><input type="number" min={0} inputMode="decimal" value={item.costPerUnit} onChange={e => updateItem(item._key, 'costPerUnit', parseFloat(e.target.value) || 0)} style={INP} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Итого</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalCost)}</span>
          </div>

          <Button fullWidth size="lg" loading={create.isPending} disabled={items.some(i => !i.name.trim())} onClick={handleSubmit}>Сохранить закупку</Button>
        </div>
      </Sheet>
    </div>
  )
}
