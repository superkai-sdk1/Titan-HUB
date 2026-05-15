'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, SEL, LBL } from '@/components/manage/DesignSystem'

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }

const BLANK_ITEM = { name: '', price: '0', category: '', isActive: true, isTop: false, trackStock: false, stockQuantity: '0' }
const BLANK_CAT = { name: '', icon: '' }

const CAT_COLORS = ['#8B5CF6', '#4cd7f6', '#10B981', '#F59E0B', '#F43F5E', '#3B82F6', '#F97316']

function getCatColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return CAT_COLORS[Math.abs(hash) % CAT_COLORS.length]
}

function MiniToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? '#8B5CF6' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  )
}

export default function MenuPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'items' | 'cats'>('items')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK_ITEM)
  const [catForm, setCatForm] = useState<any>(BLANK_CAT)
  const [editingCat, setEditingCat] = useState<any>(null)
  const [showCatForm, setShowCatForm] = useState(false)

  const { data: catsData } = useQuery({ queryKey: ['menu', 'categories'], queryFn: () => api.get<any>('/menu/categories') })
  const { data: itemsData } = useQuery({ queryKey: ['menu', 'items', 'all'], queryFn: () => api.get<any>('/menu/items/all') })
  const cats: any[] = catsData?.categories ?? []
  const allItems: any[] = itemsData?.items ?? []
  const items = allItems.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()))

  const saveItem = useMutation({ mutationFn: (b: any) => editing ? api.patch(`/menu/items/${editing.id}`, b) : api.post('/menu/items', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'items'] }); setShowForm(false); setEditing(null); setForm(BLANK_ITEM) } })
  const delItem = useMutation({ mutationFn: (id: string) => api.delete(`/menu/items/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] }) })
  const saveCat = useMutation({ mutationFn: (b: any) => editingCat ? api.patch(`/menu/categories/${editingCat.id}`, b) : api.post('/menu/categories', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'categories'] }); setShowCatForm(false); setEditingCat(null); setCatForm(BLANK_CAT) } })
  const delCat = useMutation({ mutationFn: (id: string) => api.delete(`/menu/categories/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'categories'] }) })

  function openItem(item?: any) {
    setEditing(item ?? null)
    setForm(item ? { name: item.name, price: String(item.price), category: item.category ?? '', isActive: item.isActive, isTop: item.isTop, trackStock: item.trackStock, stockQuantity: String(item.stockQuantity ?? 0) } : BLANK_ITEM)
    setShowForm(true)
  }

  const itemCount = allItems.length
  const catCount = cats.length

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Меню"
        subtitle={`${itemCount} позиций · ${catCount} категорий`}
        action={{ label: 'Добавить', icon: 'add', onClick: () => activeTab === 'items' ? openItem() : (() => { setEditingCat(null); setCatForm(BLANK_CAT); setShowCatForm(true) })() }}
      />

      {/* Tabs + Search */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {activeTab === 'items' && (
            <div style={{ position: 'relative', padding: '12px 0 0' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-30%)', fontSize: 18, color: 'var(--on-surface-variant)', pointerEvents: 'none' }}>search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
            {([['items', `Товары (${itemCount})`, 'restaurant_menu'], ['cats', `Категории (${catCount})`, 'category']] as [string, string, string][]).map(([k, l, icon]) => (
              <button key={k} onClick={() => setActiveTab(k as any)} style={{ padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === k ? 700 : 400, color: activeTab === k ? '#8B5CF6' : 'var(--on-surface-variant)', borderBottom: activeTab === k ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>{l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {activeTab === 'items' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>restaurant_menu</span>
                <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>{search ? 'Ничего не найдено' : 'Позиций нет'}</p>
              </div>
            )}
            {items.map((item: any) => {
              const cat = cats.find(c => c.id === item.category)
              const catName = cat?.name ?? item.category ?? null
              const catColor = cat ? getCatColor(cat.name) : '#94A3B8'
              const stock = parseNum(item.stockQuantity)
              const stockColor = stock === 0 ? '#F43F5E' : stock <= 5 ? '#F59E0B' : '#10B981'
              return (
                <div key={item.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: item.isActive ? 1 : 0.5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      {item.isTop && (
                        <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#F59E0B', fontVariationSettings: "'FILL' 1" }}>star</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                      {catName && (
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 8px', borderRadius: 6, background: `${catColor}22`, color: catColor, letterSpacing: '0.04em' }}>
                          {cat?.icon} {catName}
                        </span>
                      )}
                      {item.trackStock && (
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 8px', borderRadius: 6, background: `${stockColor}15`, color: stockColor, letterSpacing: '0.04em' }}>
                          {Math.floor(stock)} шт
                        </span>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{parseNum(item.price).toLocaleString('ru')} ₽</p>
                  <button onClick={() => openItem(item)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(139,92,246,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span></button>
                  <button onClick={() => delItem.mutate(item.id)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171', flexShrink: 0 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span></button>
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'cats' && (
          <div>
            {cats.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>category</span>
                <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Категорий нет</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {cats.map((cat: any) => {
                const cnt = allItems.filter(i => i.category === cat.id).length
                const color = getCatColor(cat.name)
                return (
                  <div key={cat.id} className="glass-l2" style={{ borderRadius: 16, padding: 16, cursor: 'pointer', position: 'relative' }}
                    onClick={() => { setEditingCat(cat); setCatForm({ name: cat.name, icon: cat.icon ?? '' }); setShowCatForm(true) }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>{cat.icon || '📦'}</div>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{cat.name}</p>
                    <p style={{ fontSize: 12, color, margin: 0, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{cnt} позиций</p>
                    <button onClick={e => { e.stopPropagation(); delCat.mutate(cat.id) }} style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Item form sheet */}
      <Sheet open={showForm} onClose={() => { setShowForm(false); setEditing(null); setForm(BLANK_ITEM) }} title={editing ? 'Редактировать позицию' : 'Новая позиция'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} placeholder="Название блюда или услуги" /></div>
          <div><label style={LBL}>Цена (₽)</label><input type="number" value={form.price} onChange={e => setForm((p: any) => ({ ...p, price: e.target.value }))} style={INP} /></div>
          <div><label style={LBL}>Категория</label>
            <select value={form.category} onChange={e => setForm((p: any) => ({ ...p, category: e.target.value }))} style={SEL}>
              <option value="">Без категории</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([['isActive', 'Активна', 'Позиция отображается в меню'], ['isTop', 'Хит продаж', 'Выделяется звёздочкой'], ['trackStock', 'Учёт остатков', 'Следить за количеством']] as [string, string, string][]).map(([key, lbl, sub]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{lbl}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{sub}</p>
                </div>
                <MiniToggle value={form[key]} onChange={v => setForm((p: any) => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>
          {form.trackStock && <div><label style={LBL}>Количество на складе</label><input type="number" value={form.stockQuantity} onChange={e => setForm((p: any) => ({ ...p, stockQuantity: e.target.value }))} style={INP} /></div>}
          <button onClick={() => saveItem.mutate({ ...form, price: Number(form.price), stockQuantity: Number(form.stockQuantity) })} disabled={saveItem.isPending || !form.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: !form.name ? 0.6 : 1 }}>
            {saveItem.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </Sheet>

      {/* Category form sheet */}
      <Sheet open={showCatForm} onClose={() => { setShowCatForm(false); setEditingCat(null); setCatForm(BLANK_CAT) }} title={editingCat ? 'Редактировать категорию' : 'Новая категория'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={LBL}>Название *</label><input value={catForm.name} onChange={e => setCatForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} /></div>
          <div><label style={LBL}>Иконка (emoji)</label><input value={catForm.icon} onChange={e => setCatForm((p: any) => ({ ...p, icon: e.target.value }))} placeholder="🍕" style={{ ...INP, fontSize: 28, textAlign: 'center' }} /></div>
          <button onClick={() => saveCat.mutate(catForm)} disabled={saveCat.isPending || !catForm.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            {saveCat.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
