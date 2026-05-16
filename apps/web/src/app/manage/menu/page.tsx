'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, SEL, LBL } from '@/components/manage/DesignSystem'

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }

const CAT_COLOR_OPTIONS = [
  { name: 'violet',  hex: '#8B5CF6', light: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.25)',  text: '#A78BFA' },
  { name: 'slate',   hex: '#94A3B8', light: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)', text: '#CBD5E1' },
  { name: 'orange',  hex: '#F97316', light: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.25)',  text: '#FB923C' },
  { name: 'emerald', hex: '#10B981', light: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)',  text: '#34D399' },
  { name: 'rose',    hex: '#F43F5E', light: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.25)',   text: '#F87171' },
  { name: 'amber',   hex: '#F59E0B', light: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)',  text: '#FBBF24' },
  { name: 'blue',    hex: '#3B82F6', light: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)',  text: '#60A5FA' },
  { name: 'indigo',  hex: '#6366F1', light: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)',  text: '#818CF8' },
  { name: 'pink',    hex: '#EC4899', light: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.25)',  text: '#F472B6' },
  { name: 'cyan',    hex: '#06B6D4', light: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.25)',   text: '#22D3EE' },
]

function getCatColorObj(colorName?: string) {
  return CAT_COLOR_OPTIONS.find(c => c.name === colorName) ?? CAT_COLOR_OPTIONS[0]
}

const CAT_ICONS = [
  'restaurant_menu','local_cafe','cookie','sports_esports','confirmation_number',
  'inventory_2','music_note','auto_awesome','shopping_bag','local_fire_department',
  'wine_bar','icecream','salad','sports_bar','lunch_dining','fastfood','local_drink',
  'category','bolt','water_drop','eco','timer','local_pizza','soup_kitchen',
  'grain','casino','sports','celebration','emoji_food_beverage',
]

const BLANK_ITEM = {
  name: '', price: '0', category: '', isActive: true, isTop: false,
  trackStock: false, stockQuantity: '0', isTabletVisible: false, searchTags: [] as string[],
}
const BLANK_CAT = { name: '', icon: 'restaurant_menu', color: 'violet', isTabletVisible: true }

function MiniToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? '#8B5CF6' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  )
}

function SortableItem({ item, cats, onEdit, onDelete }: { item: any; cats: any[]; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : item.isActive ? 1 : 0.5,
    zIndex: isDragging ? 999 : 'auto',
  }

  const cat = cats.find((c: any) => c.id === item.category)
  const catName = cat?.name ?? item.category ?? null
  const catColorObj = getCatColorObj(cat?.color)
  const stock = parseNum(item.stockQuantity)
  const stockColor = stock === 0 ? '#F43F5E' : stock <= 5 ? '#F59E0B' : '#10B981'

  return (
    <div ref={setNodeRef} style={style}>
      <div className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Drag handle */}
        <span
          className="material-symbols-outlined"
          {...attributes}
          {...listeners}
          style={{ fontSize: 20, color: 'rgba(204,195,216,0.3)', cursor: 'grab', flexShrink: 0, touchAction: 'none', userSelect: 'none' }}
        >
          drag_indicator
        </span>

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
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 8px', borderRadius: 6, background: catColorObj.light, color: catColorObj.text, letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{cat?.icon}</span>
                {catName}
              </span>
            )}
            {item.trackStock && (
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 8px', borderRadius: 6, background: `${stockColor}15`, color: stockColor, letterSpacing: '0.04em' }}>
                {Math.floor(stock)} шт
              </span>
            )}
            {item.trackStock && Number(item.stockQuantity) === 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(244,63,94,0.15)', color: '#F43F5E', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em' }}>
                НЕТ В НАЛИЧИИ
              </span>
            )}
          </div>
        </div>

        <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{parseNum(item.price).toLocaleString('ru')} ₽</p>
        <button onClick={onEdit} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(139,92,246,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
        </button>
        <button onClick={onDelete} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
    </div>
  )
}

function SortableCatCard({ cat, itemCount, onEdit, onDelete }: { cat: any; itemCount: number; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
  }
  const colorObj = getCatColorObj(cat.color)

  return (
    <div ref={setNodeRef} style={style}>
      <div className="glass-l2" style={{ borderRadius: 16, padding: 16, cursor: 'pointer', position: 'relative' }} onClick={onEdit}>
        {/* Drag handle */}
        <span
          className="material-symbols-outlined"
          {...attributes}
          {...listeners}
          style={{ position: 'absolute', top: 10, left: 10, fontSize: 18, color: 'rgba(204,195,216,0.3)', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        >
          drag_indicator
        </span>
        <div style={{
          width: 48, height: 48, borderRadius: 14, marginBottom: 10, marginTop: 4,
          background: colorObj.light, border: `1px solid ${colorObj.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: colorObj.hex, fontVariationSettings: "'FILL' 1" }}>
            {cat.icon || 'category'}
          </span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{cat.name}</p>
        <p style={{ fontSize: 12, color: colorObj.text, margin: 0, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{itemCount} позиций</p>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      </div>
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
  const [tagInput, setTagInput] = useState('')
  const [catForm, setCatForm] = useState<any>(BLANK_CAT)
  const [editingCat, setEditingCat] = useState<any>(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [sortedItems, setSortedItems] = useState<any[]>([])
  const [sortedCats, setSortedCats] = useState<any[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } })
  )

  const { data: catsData } = useQuery({ queryKey: ['menu', 'categories'], queryFn: () => api.get<any>('/menu/categories') })
  const { data: itemsData } = useQuery({ queryKey: ['menu', 'items', 'all'], queryFn: () => api.get<any>('/menu/items/all') })
  const cats: any[] = catsData?.categories ?? []
  const allItems: any[] = itemsData?.items ?? []

  useEffect(() => {
    if (allItems.length) setSortedItems([...allItems])
  }, [allItems])

  useEffect(() => {
    if (cats.length) setSortedCats([...cats])
  }, [cats])

  const filteredItems = sortedItems.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()))

  const saveItem = useMutation({
    mutationFn: (b: any) => editing ? api.patch(`/menu/items/${editing.id}`, b) : api.post('/menu/items', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'items'] }); setShowForm(false); setEditing(null); setForm(BLANK_ITEM) }
  })
  const delItem = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] })
  })
  const saveCat = useMutation({
    mutationFn: (b: any) => editingCat ? api.patch(`/menu/categories/${editingCat.id}`, b) : api.post('/menu/categories', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'categories'] }); setShowCatForm(false); setEditingCat(null); setCatForm(BLANK_CAT) }
  })
  const delCat = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'categories'] })
  })

  const reorderItems = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch('/menu/items/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] })
  })

  const reorderCats = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch('/menu/categories/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'categories'] })
  })

  function handleItemDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSortedItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id)
      const newIndex = prev.findIndex(i => i.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      reorderItems.mutate(next.map((item, idx) => ({ id: item.id, sortOrder: idx })))
      return next
    })
  }

  function handleCatDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSortedCats(prev => {
      const oldIndex = prev.findIndex(c => c.id === active.id)
      const newIndex = prev.findIndex(c => c.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      reorderCats.mutate(next.map((cat, idx) => ({ id: cat.id, sortOrder: idx })))
      return next
    })
  }

  function openItem(item?: any) {
    setEditing(item ?? null)
    setForm(item ? {
      name: item.name, price: String(item.price), category: item.category ?? '',
      isActive: item.isActive, isTop: item.isTop, trackStock: item.trackStock,
      stockQuantity: String(item.stockQuantity ?? 0),
      isTabletVisible: item.isTabletVisible ?? false,
      searchTags: item.searchTags ?? [],
    } : BLANK_ITEM)
    setTagInput('')
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
            <SortableContext items={filteredItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredItems.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>restaurant_menu</span>
                    <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>{search ? 'Ничего не найдено' : 'Позиций нет'}</p>
                  </div>
                )}
                {filteredItems.map((item: any) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    cats={cats}
                    onEdit={() => openItem(item)}
                    onDelete={() => delItem.mutate(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {activeTab === 'cats' && (
          <div>
            {sortedCats.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>category</span>
                <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Категорий нет</p>
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
              <SortableContext items={sortedCats.map(c => c.id)} strategy={rectSortingStrategy}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {sortedCats.map((cat: any) => {
                    const cnt = allItems.filter(i => i.category === cat.id).length
                    return (
                      <SortableCatCard
                        key={cat.id}
                        cat={cat}
                        itemCount={cnt}
                        onEdit={() => { setEditingCat(cat); setCatForm({ name: cat.name, icon: cat.icon ?? 'restaurant_menu', color: cat.color ?? 'violet', isTabletVisible: cat.isTabletVisible ?? true }); setShowCatForm(true) }}
                        onDelete={() => delCat.mutate(cat.id)}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* Item form sheet */}
      <Sheet open={showForm} onClose={() => { setShowForm(false); setEditing(null); setForm(BLANK_ITEM) }} title={editing ? 'Редактировать позицию' : 'Новая позиция'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} placeholder="Название блюда или услуги" /></div>
          <div><label style={LBL}>Цена (₽)</label><input type="number" value={form.price} onChange={e => setForm((p: any) => ({ ...p, price: e.target.value }))} style={INP} /></div>

          {/* Search tags */}
          <div>
            <label style={LBL}>Теги поиска</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(form.searchTags as string[]).map((tag: string, i: number) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--on-surface)' }}>
                  {tag}
                  <button onClick={() => setForm((p: any) => ({ ...p, searchTags: p.searchTags.filter((_: string, j: number) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', padding: 0, fontSize: 14, lineHeight: 1, display: 'flex' }}>×</button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  const t = tagInput.trim().replace(/,$/, '')
                  if (t && !(form.searchTags as string[]).includes(t)) {
                    setForm((p: any) => ({ ...p, searchTags: [...p.searchTags, t] }))
                  }
                  setTagInput('')
                }
              }}
              placeholder="Введите тег и нажмите Enter"
              style={INP}
            />
          </div>

          <div><label style={LBL}>Категория</label>
            <select value={form.category} onChange={e => setForm((p: any) => ({ ...p, category: e.target.value }))} style={SEL}>
              <option value="">Без категории</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              ['isActive', 'Активна', 'Позиция отображается в меню'],
              ['isTop', 'Хит продаж', 'Выделяется звёздочкой'],
              ['trackStock', 'Учёт остатков', 'Следить за количеством'],
              ['isTabletVisible', 'Видно на планшете', 'Показывать гостям в меню планшета'],
            ] as [string, string, string][]).map(([key, lbl, sub]) => (
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
          <button onClick={() => saveItem.mutate({ ...form, price: Number(form.price), stockQuantity: Number(form.stockQuantity), isTabletVisible: form.isTabletVisible, searchTags: form.searchTags })} disabled={saveItem.isPending || !form.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: !form.name ? 0.6 : 1 }}>
            {saveItem.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </Sheet>

      {/* Category form sheet */}
      <Sheet open={showCatForm} onClose={() => { setShowCatForm(false); setEditingCat(null); setCatForm(BLANK_CAT) }} title={editingCat ? 'Редактировать категорию' : 'Новая категория'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div>
            <label style={LBL}>Название *</label>
            <input value={catForm.name} onChange={e => setCatForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} />
          </div>

          {/* Icon picker */}
          <div>
            <label style={LBL}>Иконка</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {CAT_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setCatForm((p: any) => ({ ...p, icon }))}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: catForm.icon === icon ? '#8B5CF6' : 'rgba(255,255,255,0.05)',
                    color: catForm.icon === icon ? '#fff' : 'rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  title={icon}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label style={LBL}>Цвет</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {CAT_COLOR_OPTIONS.map(c => (
                <button
                  key={c.name}
                  onClick={() => setCatForm((p: any) => ({ ...p, color: c.name }))}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: c.hex,
                    outline: catForm.color === c.name ? `3px solid #fff` : '3px solid transparent',
                    outlineOffset: 2,
                    transition: 'outline 0.15s',
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* isTabletVisible toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Видно на планшете</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Показывать категорию в меню планшета</p>
            </div>
            <MiniToggle value={catForm.isTabletVisible ?? true} onChange={v => setCatForm((p: any) => ({ ...p, isTabletVisible: v }))} />
          </div>

          <button onClick={() => saveCat.mutate(catForm)} disabled={saveCat.isPending || !catForm.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            {saveCat.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
