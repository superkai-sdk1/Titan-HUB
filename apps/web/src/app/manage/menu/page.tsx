'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }

const BLANK_ITEM = { name: '', price: '0', category: '', isActive: true, isTop: false, trackStock: false, stockQuantity: '0' }
const BLANK_CAT = { name: '', icon: '' }

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

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Меню</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{allItems.length} позиций · {cats.length} категорий</p>
          </div>
          <button onClick={() => activeTab === 'items' ? openItem() : (() => { setEditingCat(null); setCatForm(BLANK_CAT); setShowCatForm(true) })()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>Добавить
          </button>
        </div>
        {activeTab === 'items' && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--on-surface-variant)', pointerEvents: 'none' }}>search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" style={{ ...INP, paddingLeft: 42 }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 2 }}>
          {[['items', 'Товары'], ['cats', 'Категории']].map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k as any)} style={{ padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === k ? 600 : 400, color: activeTab === k ? '#8B5CF6' : 'var(--on-surface-variant)', borderBottom: activeTab === k ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 32px 80px', flex: 1 }}>
        {activeTab === 'items' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item: any) => {
              const catName = cats.find(c => c.id === item.category)?.name ?? item.category ?? '—'
              const stock = parseNum(item.stockQuantity)
              return (
                <div key={item.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: item.isActive ? 1 : 0.5 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8B5CF6' }}>restaurant_menu</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      {item.isTop && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#F59E0B', fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>star</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{catName}</span>
                      {item.trackStock && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '1px 6px', borderRadius: 4, background: stock === 0 ? 'rgba(244,63,94,0.15)' : stock <= 5 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: stock === 0 ? '#F43F5E' : stock <= 5 ? '#F59E0B' : '#10B981' }}>×{Math.floor(stock)}</span>}
                    </div>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{parseNum(item.price).toLocaleString('ru')} ₽</p>
                  <button onClick={() => openItem(item)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span></button>
                  <button onClick={() => delItem.mutate(item.id)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171', flexShrink: 0 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span></button>
                </div>
              )
            })}
          </div>
        )}
        {activeTab === 'cats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cats.map((cat: any) => {
              const cnt = allItems.filter(i => i.category === cat.id).length
              return (
                <div key={cat.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{cat.icon || '📦'}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{cat.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{cnt} позиций</p>
                  </div>
                  <button onClick={() => { setEditingCat(cat); setCatForm({ name: cat.name, icon: cat.icon ?? '' }); setShowCatForm(true) }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span></button>
                  <button onClick={() => delCat.mutate(cat.id)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span></button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Item form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{editing ? 'Редактировать' : 'Новая позиция'}</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Цена (₽)</label><input type="number" value={form.price} onChange={e => setForm((p: any) => ({ ...p, price: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Категория</label>
                <select value={form.category} onChange={e => setForm((p: any) => ({ ...p, category: e.target.value }))} style={SEL}>
                  <option value="">Без категории</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              {([['isActive', 'Активна'], ['isTop', 'Хит (топ)'], ['trackStock', 'Учёт склада']] as [string, string][]).map(([key, lbl]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div onClick={() => setForm((p: any) => ({ ...p, [key]: !p[key] }))} style={{ width: 44, height: 24, borderRadius: 12, background: form[key] ? '#8B5CF6' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: form[key] ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>{lbl}</span>
                </label>
              ))}
              {form.trackStock && <div><label style={LBL}>Количество</label><input type="number" value={form.stockQuantity} onChange={e => setForm((p: any) => ({ ...p, stockQuantity: e.target.value }))} style={INP} /></div>}
              <button onClick={() => saveItem.mutate({ ...form, price: Number(form.price), stockQuantity: Number(form.stockQuantity) })} disabled={saveItem.isPending || !form.name} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8, opacity: !form.name ? 0.6 : 1 }}>
                {saveItem.isPending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category form */}
      {showCatForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowCatForm(false) }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{editingCat ? 'Редактировать категорию' : 'Новая категория'}</h2>
              <button onClick={() => setShowCatForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LBL}>Название *</label><input value={catForm.name} onChange={e => setCatForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Иконка (emoji)</label><input value={catForm.icon} onChange={e => setCatForm((p: any) => ({ ...p, icon: e.target.value }))} placeholder="🍕" style={{ ...INP, fontSize: 24, textAlign: 'center' }} /></div>
              <button onClick={() => saveCat.mutate(catForm)} disabled={saveCat.isPending || !catForm.name} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
                {saveCat.isPending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
