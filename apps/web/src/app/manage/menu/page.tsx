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
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '@/lib/api'
import { PageHeader, Sheet, Toggle, ConfirmDialog, INP, SEL, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { CAT_PRESETS, PALETTE, CategoryIcon as CatIconRenderer } from '@/components/CategoryIcon'

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }

/* ─── LEGACY COLOR MAP ─────────────────────────────────────────── */
const LEGACY: Record<string, string> = {
  violet: '#8B5CF6', slate: '#94A3B8', orange: '#F97316', emerald: '#10B981',
  rose: '#F43F5E', amber: '#F59E0B', blue: '#3B82F6', indigo: '#6366F1',
  pink: '#EC4899', cyan: '#06B6D4',
}
function resolveHex(v?: string) {
  if (!v) return '#8B5CF6'
  return LEGACY[v] || (v.startsWith('#') ? v : '#8B5CF6')
}
function getCatColorObj(colorInput?: string) {
  const hex = resolveHex(colorInput)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { hex, light: `rgba(${r},${g},${b},0.13)`, border: `rgba(${r},${g},${b},0.3)`, text: hex }
}

const BLANK_ITEM = {
  name: '', price: '0', costPrice: '0', category: '', isActive: true, isTop: false,
  trackStock: false, isService: false, stockQuantity: '0', isTabletVisible: false,
  searchTags: [] as string[], linkedSpaceId: '',
}
const BLANK_CAT = { name: '', icon: 'food', color: '#10B981', isTabletVisible: true }

/* ─── Item grid card body (shared by sortable card + drag overlay) ── */
function ItemCardBody({ item, cat, onEdit, onDelete, dragHandle }: { item: any; cat: any; onEdit?: () => void; onDelete?: () => void; dragHandle?: any }) {
  const catColor = resolveHex(cat?.color)
  const stock = parseNum(item.stockQuantity)
  const stockColor = stock === 0 ? '#F43F5E' : stock <= 5 ? '#F59E0B' : '#10B981'
  return (
    <div className="glass-l2" style={{ borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 7, height: '100%', minHeight: 128, boxSizing: 'border-box', borderLeft: `3px solid ${catColor}`, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {dragHandle && (
          <span {...dragHandle} aria-label="Перетащить" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none', padding: 2, margin: -2, flexShrink: 0 }}>
            <Icon name="drag_indicator" size={18} color="rgba(204,195,216,0.4)" />
          </span>
        )}
        {item.isTop && (
          <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="star" size={12} color="#F59E0B" />
          </div>
        )}
        <span style={{ flex: 1 }} />
        {onEdit && (
          <button onClick={onEdit} aria-label="Изменить" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(139,92,246,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
            <Icon name="edit" size={14} />
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} aria-label="Удалить" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171', flexShrink: 0 }}>
            <Icon name="delete" size={14} />
          </button>
        )}
      </div>
      <p style={{ fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {!item.isActive && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(148,163,184,0.18)', color: '#94A3B8', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em' }}>СКРЫТА</span>
        )}
        {item.trackStock && stock > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${stockColor}18`, color: stockColor, letterSpacing: '0.04em' }}>{Math.floor(stock)} шт</span>
        )}
        {item.trackStock && stock === 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(244,63,94,0.15)', color: '#F43F5E', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em' }}>НЕТ</span>
        )}
      </div>
      <span style={{ flex: 1 }} />
      <p style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0 }}>{parseNum(item.price).toLocaleString('ru')} ₽</p>
    </div>
  )
}

/* ─── Sortable item card (grid) ────────────────────────────────── */
function ItemCard({ item, cat, onEdit, onDelete, draggable }: { item: any; cat: any; onEdit: () => void; onDelete: () => void; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !draggable })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : item.isActive ? 1 : 0.6, zIndex: isDragging ? 999 : 'auto' }
  return (
    <div ref={setNodeRef} style={style}>
      <ItemCardBody item={item} cat={cat} onEdit={onEdit} onDelete={onDelete} dragHandle={draggable ? { ...attributes, ...listeners } : null} />
    </div>
  )
}

/* ─── Folder tile (root grid) ──────────────────────────────────── */
function FolderTile({ cat, count, onOpen, onEdit, uncat }: { cat: any; count: number; onOpen: () => void; onEdit?: () => void; uncat?: boolean }) {
  const color = uncat ? '#94A3B8' : resolveHex(cat.color)
  const obj = getCatColorObj(uncat ? '#94A3B8' : cat.color)
  return (
    <button onClick={onOpen} className="glass-l2" style={{ borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 11, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', minHeight: 124, textAlign: 'left', width: '100%' }}>
      <div style={{ width: 52, height: 52, borderRadius: 15, background: obj.light, border: `1px solid ${obj.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {uncat ? <Icon name="folder_open" size={28} color={color} /> : <CatIconRenderer icon={cat.icon} size={28} color={color} />}
      </div>
      <div style={{ width: '100%', minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--on-surface)' }}>{uncat ? 'Без категории' : cat.name}</p>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{count} {pluralItems(count)}</p>
      </div>
      {onEdit && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          aria-label="Изменить категорию"
          style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}
        >
          <Icon name="edit" size={14} />
        </span>
      )}
    </button>
  )
}

/* ─── Перетаскиваемая папка-категория (сортировка на корневом экране) ─── */
function SortableFolderTile({ cat, count, onOpen, onEdit }: { cat: any; count: number; onOpen: () => void; onEdit?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, touchAction: 'none', cursor: isDragging ? 'grabbing' : undefined }}
    >
      <FolderTile cat={cat} count={count} onOpen={onOpen} onEdit={onEdit} />
    </div>
  )
}

/* ─── Sidebar folder (droppable target inside a folder) ───────── */
function SidebarFolder({ cat, count, active, onOpen, uncat }: { cat?: any; count: number; active: boolean; onOpen: () => void; uncat?: boolean }) {
  const dropId = uncat ? 'drop-none' : `drop-${cat.id}`
  const { setNodeRef, isOver } = useDroppable({ id: dropId })
  const color = uncat ? '#94A3B8' : resolveHex(cat.color)
  return (
    <button
      ref={setNodeRef}
      onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 4px', borderRadius: 14, cursor: 'pointer', width: '100%', boxSizing: 'border-box', flexShrink: 0,
        border: isOver ? `2px solid ${color}` : active ? `1.5px solid ${color}66` : '1.5px solid transparent',
        background: isOver ? `${color}33` : active ? `${color}1f` : 'rgba(255,255,255,0.03)',
        transform: isOver ? 'scale(1.06)' : 'scale(1)', transition: 'all 0.15s',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (active || isOver) ? `${color}22` : 'rgba(255,255,255,0.04)' }}>
        {uncat ? <Icon name="folder_open" size={20} color={color} /> : <CatIconRenderer icon={cat.icon} size={20} color={color} />}
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: active ? color : 'var(--on-surface-variant)', lineHeight: 1.1, textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{uncat ? 'Без кат.' : cat.name}</span>
      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", opacity: 0.6 }}>{count}</span>
    </button>
  )
}

function pluralItems(n: number) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return 'позиций'
  if (b > 1 && b < 5) return 'позиции'
  if (b === 1) return 'позиция'
  return 'позиций'
}

export default function MenuPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  // openCat: null = корень (сетка папок), 'none' = папка «Без категории», иначе id категории.
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK_ITEM)
  const [tagInput, setTagInput] = useState('')
  const [catForm, setCatForm] = useState<any>(BLANK_CAT)
  const [editingCat, setEditingCat] = useState<any>(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [sortedItems, setSortedItems] = useState<any[]>([])
  const [confirmDelItem, setConfirmDelItem] = useState<any>(null)
  const [confirmDelCat, setConfirmDelCat] = useState<any>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } })
  )

  const { show } = useToast()
  const { data: catsData } = useQuery({ queryKey: ['menu', 'categories'], queryFn: () => api.get<any>('/menu/categories') })
  const { data: itemsData } = useQuery({ queryKey: ['menu', 'items', 'all'], queryFn: () => api.get<any>('/menu/items/all') })
  const { data: spacesData } = useQuery({ queryKey: ['spaces'], queryFn: () => api.get<any>('/spaces') })
  // Категория «Тарифы» управляется в отдельном разделе «Тарифы и аренда» —
  // прячем её (и её позиции) из меню, чтобы тарифы не редактировались здесь.
  const allCats: any[] = catsData?.categories ?? []
  const tariffCatIds = new Set(allCats.filter((c: any) => String(c.name ?? '').toLowerCase().includes('тариф')).map((c: any) => c.id))
  const cats: any[] = allCats.filter((c: any) => !tariffCatIds.has(c.id))
  const allItems: any[] = (itemsData?.items ?? []).filter((i: any) => !tariffCatIds.has(i.category))
  const spaces: any[] = spacesData?.spaces ?? []

  // Синхронизируем локальный порядок с сервером. Ключимся на itemsData (стабильная
  // ссылка), а не на allItems (новый массив каждый рендер). Пустой items → список
  // очищается (важно при удалении последней позиции).
  useEffect(() => { if (itemsData?.items) setSortedItems([...itemsData.items]) }, [itemsData])

  const catIds = new Set(cats.map((c: any) => c.id))
  const visibleItemsAll = sortedItems.filter((i: any) => !tariffCatIds.has(i.category))
  const uncategorizedCount = visibleItemsAll.filter((i: any) => !i.category || !catIds.has(i.category)).length
  const countForCat = (catId: string) => catId === 'none'
    ? uncategorizedCount
    : visibleItemsAll.filter((i: any) => i.category === catId).length

  const isSearching = !!search.trim()
  const openCatObj = openCat && openCat !== 'none' ? cats.find((c: any) => c.id === openCat) : null

  // Позиции, видимые в текущем виде: поиск → плоский список совпадений по всем
  // категориям; иначе — содержимое открытой папки.
  const inFolderItems = (catId: string) => visibleItemsAll.filter((i: any) =>
    catId === 'none' ? (!i.category || !catIds.has(i.category)) : i.category === catId)
  const visibleItems = isSearching
    ? visibleItemsAll.filter((i: any) => i.name?.toLowerCase().includes(search.toLowerCase()))
    : openCat !== null ? inFolderItems(openCat) : []

  // DnD активен только внутри папки (без поиска): там reorder и перенос корректны.
  const dragEnabled = !isSearching && openCat !== null

  const saveItem = useMutation({
    mutationFn: (b: any) => editing ? api.patch(`/menu/items/${editing.id}`, b) : api.post('/menu/items', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'items'] }); setShowForm(false); setEditing(null); setForm(BLANK_ITEM) },
    onError: () => show('Не удалось сохранить товар', 'error'),
  })
  const delItem = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/items/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'items'] }); setConfirmDelItem(null) },
    onError: () => { setConfirmDelItem(null); show('Не удалось удалить товар', 'error') },
  })
  const saveCat = useMutation({
    mutationFn: (b: any) => editingCat ? api.patch(`/menu/categories/${editingCat.id}`, b) : api.post('/menu/categories', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'categories'] }); setShowCatForm(false); setEditingCat(null); setCatForm(BLANK_CAT) },
    onError: () => show('Не удалось сохранить категорию', 'error'),
  })
  const delCat = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'categories'] }); setConfirmDelCat(null); setOpenCat(null) },
    onError: () => { setConfirmDelCat(null); show('Не удалось удалить категорию', 'error') },
  })
  const reorderItems = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch('/menu/items/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] })
  })
  // Сортировка категорий перетаскиванием (порядок наследуется в меню POS).
  const reorderCats = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch('/menu/categories/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'categories'] }),
    onError: () => { show('Не удалось изменить порядок', 'error'); qc.invalidateQueries({ queryKey: ['menu', 'categories'] }) },
  })
  // Перенос позиции в другую категорию (drag на папку в боковой панели). category=null → «Без категории».
  const moveItem = useMutation({
    mutationFn: ({ id, category }: { id: string; category: string | null }) => api.patch(`/menu/items/${id}`, { category }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] }),
    onError: () => { show('Не удалось переместить позицию', 'error'); qc.invalidateQueries({ queryKey: ['menu', 'items'] }) },
  })

  function handleDragStart(event: DragStartEvent) { setDragId(String(event.active.id)) }

  function handleDragEnd(event: DragEndEvent) {
    setDragId(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    // Перетаскивание КАТЕГОРИИ (корневой экран папок) → смена порядка категорий.
    if (catIds.has(activeId)) {
      if (activeId === overId || !catIds.has(overId)) return
      const order = cats.map((c: any) => c.id)
      const oldI = order.indexOf(activeId), newI = order.indexOf(overId)
      if (oldI < 0 || newI < 0) return
      const newCats = arrayMove(cats, oldI, newI)
      const tariffCats = allCats.filter((c: any) => tariffCatIds.has(c.id))
      const allOrdered = [...newCats, ...tariffCats]
      // Оптимистично переписываем кэш категорий новым порядком (мгновенный UI).
      qc.setQueryData(['menu', 'categories'], { categories: allOrdered.map((c: any, idx: number) => ({ ...c, sortOrder: idx })) })
      reorderCats.mutate(allOrdered.map((c: any, idx: number) => ({ id: c.id, sortOrder: idx })))
      return
    }

    // Брошено на папку в боковой панели → перенос в другую категорию.
    if (overId.startsWith('drop-')) {
      const target = overId === 'drop-none' ? null : overId.slice('drop-'.length)
      const item = sortedItems.find((i: any) => i.id === activeId)
      if (!item) return
      const current = item.category ?? null
      if (current === target) return
      setSortedItems(prev => prev.map((i: any) => i.id === activeId ? { ...i, category: target } : i))
      moveItem.mutate({ id: activeId, category: target })
      return
    }

    // Иначе — сортировка внутри текущей папки. Перетасовываем только подмножество
    // папки, но переписываем sortOrder для ВСЕГО списка, сохраняя позиции прочих.
    if (!dragEnabled || activeId === overId) return
    const subsetIds = new Set(visibleItems.map((i: any) => i.id))
    setSortedItems(prev => {
      const subset = prev.filter((i: any) => subsetIds.has(i.id))
      const oldIndex = subset.findIndex((i: any) => i.id === activeId)
      const newIndex = subset.findIndex((i: any) => i.id === overId)
      if (oldIndex < 0 || newIndex < 0) return prev
      const newSubset = arrayMove(subset, oldIndex, newIndex)
      const positions: number[] = []
      prev.forEach((i: any, idx: number) => { if (subsetIds.has(i.id)) positions.push(idx) })
      const next = [...prev]
      positions.forEach((pos, k) => { next[pos] = newSubset[k] })
      reorderItems.mutate(next.map((it: any, idx: number) => ({ id: it.id, sortOrder: idx })))
      return next
    })
  }
  function openItem(item?: any, presetCat?: string | null) {
    setEditing(item ?? null)
    setForm(item ? {
      name: item.name, price: String(item.price), costPrice: String(item.costPrice ?? 0),
      category: item.category ?? '',
      isActive: item.isActive, isTop: item.isTop, trackStock: item.trackStock,
      isService: item.isService ?? false,
      stockQuantity: String(item.stockQuantity ?? 0),
      isTabletVisible: item.isTabletVisible ?? false,
      searchTags: item.searchTags ?? [],
      linkedSpaceId: item.linkedSpaceId ?? '',
    } : { ...BLANK_ITEM, category: presetCat && presetCat !== 'none' ? presetCat : '' })
    setTagInput('')
    setShowForm(true)
  }

  function openNewCat() { setEditingCat(null); setCatForm(BLANK_CAT); setShowCatForm(true) }
  function openEditCat(cat: any) {
    setEditingCat(cat)
    setCatForm({ name: cat.name, icon: cat.icon ?? 'food', color: resolveHex(cat.color), isTabletVisible: cat.isTabletVisible ?? true })
    setShowCatForm(true)
  }

  const previewColorObj = getCatColorObj(catForm.color)

  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(122px, 1fr))', gap: 10 }
  const folderValid = openCat !== null && (openCat === 'none' || !!openCatObj)
  const dragItem = dragId ? sortedItems.find((i: any) => i.id === dragId) : null

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Меню"
        subtitle={`${allItems.length} ${pluralItems(allItems.length)} · ${cats.length} категорий`}
        action={{ label: 'Добавить', icon: 'add', onClick: () => openItem(undefined, openCat) }}
      />

      {/* Search */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
          <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по всем позициям…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {isSearching ? (
          /* ── Поиск: плоская сетка совпадений ── */
          <div style={{ padding: '16px 16px var(--bottom-nav-clear, 96px)', flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            {visibleItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Icon name="search_off" size={48} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
                <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Ничего не найдено</p>
              </div>
            ) : (
              <div style={gridStyle}>
                {visibleItems.map((item: any) => (
                  <ItemCard key={item.id} item={item} cat={cats.find((c: any) => c.id === item.category)} onEdit={() => openItem(item)} onDelete={() => setConfirmDelItem(item)} draggable={false} />
                ))}
              </div>
            )}
          </div>
        ) : !folderValid ? (
          /* ── Корень: сетка папок ── */
          <div style={{ padding: '16px 16px var(--bottom-nav-clear, 96px)', flex: 1, maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            {cats.length > 1 && (
              <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="drag_indicator" size={13} color="rgba(204,195,216,0.45)" />
                Перетаскивайте категории, чтобы изменить порядок — он применится и в меню кассы
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              <SortableContext items={cats.map((c: any) => c.id)} strategy={rectSortingStrategy}>
                {cats.map((c: any) => (
                  <SortableFolderTile key={c.id} cat={c} count={countForCat(c.id)} onOpen={() => setOpenCat(c.id)} onEdit={() => openEditCat(c)} />
                ))}
              </SortableContext>
              {uncategorizedCount > 0 && (
                <FolderTile cat={{}} uncat count={uncategorizedCount} onOpen={() => setOpenCat('none')} />
              )}
              <button
                onClick={openNewCat}
                style={{ borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', border: '1.5px dashed rgba(255,255,255,0.2)', background: 'transparent', minHeight: 124, color: 'var(--on-surface-variant)' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="add" size={24} color="#a78bfa" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Новая категория</span>
              </button>
            </div>
            {cats.length === 0 && uncategorizedCount === 0 && (
              <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', marginTop: 24 }}>Создайте первую категорию, чтобы начать наполнять меню</p>
            )}
          </div>
        ) : (
          /* ── Папка: боковой список папок + сетка позиций ── */
          <div style={{ padding: '12px 16px var(--bottom-nav-clear, 96px)', flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* Боковая панель папок (drop-таргеты для переноса позиций) */}
            <aside className="cat-rail" style={{ width: 76, flexShrink: 0, position: 'sticky', top: 12, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100dvh - 130px)', overflowY: 'auto' }}>
              <button
                onClick={() => setOpenCat(null)}
                aria-label="Ко всем папкам"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 4px', borderRadius: 14, cursor: 'pointer', width: '100%', boxSizing: 'border-box', border: '1.5px solid transparent', background: 'rgba(255,255,255,0.03)', color: 'var(--on-surface-variant)' }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)' }}>
                  <Icon name="grid_view" size={20} color="var(--on-surface-variant)" />
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.1 }}>Папки</span>
              </button>
              {cats.map((c: any) => (
                <SidebarFolder key={c.id} cat={c} count={countForCat(c.id)} active={openCat === c.id} onOpen={() => setOpenCat(c.id)} />
              ))}
              {(uncategorizedCount > 0 || openCat === 'none') && (
                <SidebarFolder uncat count={uncategorizedCount} active={openCat === 'none'} onOpen={() => setOpenCat('none')} />
              )}
            </aside>

            {/* Содержимое папки */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${openCatObj ? resolveHex(openCatObj.color) : '#94A3B8'}1f`, border: `1px solid ${openCatObj ? resolveHex(openCatObj.color) : '#94A3B8'}40` }}>
                  {openCatObj ? <CatIconRenderer icon={openCatObj.icon} size={19} color={resolveHex(openCatObj.color)} /> : <Icon name="folder_open" size={19} color="#94A3B8" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{openCatObj?.name ?? 'Без категории'}</p>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>{visibleItems.length} {pluralItems(visibleItems.length)}</p>
                </div>
                {openCatObj && (
                  <>
                    <button onClick={() => openEditCat(openCatObj)} aria-label="Изменить категорию" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button onClick={() => setConfirmDelCat(openCatObj)} aria-label="Удалить категорию" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="delete" size={15} />
                    </button>
                  </>
                )}
              </div>

              {visibleItems.length > 1 && (
                <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="drag_indicator" size={13} color="rgba(204,195,216,0.45)" />
                  Тащите за уголок — сортировка внутри папки или перенос на папку слева
                </p>
              )}

              {visibleItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0' }}>
                  <Icon name="restaurant_menu" size={44} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: '0 0 14px' }}>В этой папке нет позиций</p>
                  <button onClick={() => openItem(undefined, openCat)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <Icon name="add" size={16} /> Добавить позицию
                  </button>
                </div>
              ) : (
                <SortableContext items={visibleItems.map((i: any) => i.id)} strategy={rectSortingStrategy}>
                  <div style={gridStyle}>
                    {visibleItems.map((item: any) => (
                      <ItemCard key={item.id} item={item} cat={cats.find((c: any) => c.id === item.category)} onEdit={() => openItem(item)} onDelete={() => setConfirmDelItem(item)} draggable />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          </div>
        )}

        <DragOverlay>
          {dragItem ? (
            <div style={{ width: 150 }}>
              <ItemCardBody item={dragItem} cat={cats.find((c: any) => c.id === dragItem.category)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Item form sheet ─────────────────────────────────────── */}
      <Sheet open={showForm} onClose={() => { setShowForm(false); setEditing(null); setForm(BLANK_ITEM) }} title={editing ? 'Редактировать позицию' : 'Новая позиция'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} placeholder="Название блюда или услуги" /></div>
          <div><label style={LBL}>Цена (₽)</label><input type="number" value={form.price} onChange={e => setForm((p: any) => ({ ...p, price: e.target.value }))} style={INP} /></div>
          <div><label style={LBL}>Себестоимость (₽)</label><input type="number" value={form.costPrice} onChange={e => setForm((p: any) => ({ ...p, costPrice: e.target.value }))} style={INP} placeholder="Для расчёта маржи" /></div>
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
            <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const t = tagInput.trim().replace(/,$/, ''); if (t && !(form.searchTags as string[]).includes(t)) setForm((p: any) => ({ ...p, searchTags: [...p.searchTags, t] })); setTagInput('') } }} placeholder="Введите тег и нажмите Enter" style={INP} />
          </div>
          <div>
            <label style={LBL}>Категория</label>
            <select value={form.category} onChange={e => setForm((p: any) => ({ ...p, category: e.target.value }))} style={SEL}>
              <option value="">Без категории</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Привязка к пространству</label>
            <select value={form.linkedSpaceId} onChange={e => setForm((p: any) => ({ ...p, linkedSpaceId: e.target.value }))} style={SEL}>
              <option value="">Не привязано</option>
              {spaces.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              ['isActive', 'Активна', 'Позиция отображается в меню'],
              ['isTop', 'Хит продаж', 'Выделяется звёздочкой'],
              ['isService', 'Услуга', 'Услуга, а не товар (без физического остатка)'],
              ['trackStock', 'Учёт остатков', 'Следить за количеством'],
              ['isTabletVisible', 'Видно на планшете', 'Показывать гостям в меню планшета'],
            ] as [string, string, string][]).map(([key, lbl, sub]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{lbl}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{sub}</p>
                </div>
                <Toggle size="sm" value={form[key]} onChange={v => setForm((p: any) => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>
          {form.trackStock && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Icon name="info" size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', lineHeight: 1.45 }}>
                Остаток меняется только через <b style={{ color: 'var(--on-surface)' }}>Закупки</b>, <b style={{ color: 'var(--on-surface)' }}>Ревизии</b> и <b style={{ color: 'var(--on-surface)' }}>Списания</b> — здесь его задать нельзя.
              </span>
            </div>
          )}
          <button onClick={() => saveItem.mutate({ ...form, price: Number(form.price), costPrice: Number(form.costPrice), stockQuantity: Number(form.stockQuantity) || 0, isTabletVisible: form.isTabletVisible, searchTags: form.searchTags, linkedSpaceId: form.linkedSpaceId || undefined })} disabled={saveItem.isPending || !form.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: !form.name ? 0.6 : 1 }}>
            {saveItem.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </Sheet>

      {/* ── Category form sheet ──────────────────────────────────── */}
      <Sheet open={showCatForm} onClose={() => { setShowCatForm(false); setEditingCat(null); setCatForm(BLANK_CAT) }} title={editingCat ? 'Редактировать категорию' : 'Новая категория'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Live preview + name input */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 14 }}>
            {/* Big preview tile */}
            <div style={{
              width: 72, flexShrink: 0,
              borderRadius: 18,
              background: previewColorObj.light,
              border: `2px solid ${previewColorObj.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 24px ${previewColorObj.hex}25`,
              transition: 'all 0.25s',
            }}>
              <CatIconRenderer icon={catForm.icon} size={34} color={previewColorObj.hex} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
              <label style={LBL}>Название категории *</label>
              <input
                value={catForm.name}
                onChange={e => setCatForm((p: any) => ({ ...p, name: e.target.value }))}
                style={{ ...INP, margin: 0 }}
                placeholder="Например: Горячие напитки"
                autoFocus
              />
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

          {/* Preset grid — 4 columns */}
          <div>
            <p style={{ ...LBL, marginBottom: 12 }}>Иконка и цвет</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {CAT_PRESETS.map(preset => {
                const isSelected = catForm.icon === preset.id
                const r = parseInt(preset.color.slice(1, 3), 16)
                const g = parseInt(preset.color.slice(3, 5), 16)
                const b = parseInt(preset.color.slice(5, 7), 16)
                return (
                  <button
                    key={preset.id}
                    onClick={() => setCatForm((p: any) => ({
                      ...p,
                      icon: preset.id,
                      color: preset.color,
                      name: p.name || preset.defaultName,
                    }))}
                    style={{
                      padding: '12px 6px 10px',
                      borderRadius: 14,
                      border: isSelected
                        ? `2px solid ${preset.color}`
                        : `2px solid rgba(${r},${g},${b},0.15)`,
                      background: isSelected
                        ? `rgba(${r},${g},${b},0.2)`
                        : `rgba(${r},${g},${b},0.06)`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 7,
                      transition: 'all 0.15s',
                      boxShadow: isSelected ? `0 0 16px rgba(${r},${g},${b},0.4)` : 'none',
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 5, right: 5,
                        width: 14, height: 14, borderRadius: '50%',
                        background: preset.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                          <path d="M1.5 4.5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                    {preset.svg(isSelected ? preset.color : `rgba(${r},${g},${b},0.7)`, 28)}
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: isSelected ? preset.color : `rgba(${r},${g},${b},0.8)`,
                      lineHeight: 1.2, textAlign: 'center',
                      maxWidth: '100%', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {preset.gridLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color override — 2 rows of 10 */}
          <div>
            <p style={{ ...LBL, marginBottom: 10 }}>Цвет акцента</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 8 }}>
              {PALETTE.map((hex, i) => {
                const isActive = catForm.color === hex
                return (
                  <button
                    key={hex}
                    onClick={() => setCatForm((p: any) => ({ ...p, color: hex }))}
                    title={CAT_PRESETS[i]?.gridLabel}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: '50%',
                      border: 'none', cursor: 'pointer',
                      background: hex,
                      outline: isActive ? `3px solid #fff` : '2px solid transparent',
                      outlineOffset: isActive ? 2 : 0,
                      transition: 'all 0.15s',
                      transform: isActive ? 'scale(1.25)' : 'scale(1)',
                      boxShadow: isActive ? `0 0 12px ${hex}90` : 'none',
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Tablet toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '13px 16px', borderRadius: 14,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Видно на планшете</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Показывать категорию гостям</p>
            </div>
            <Toggle size="sm" value={catForm.isTabletVisible ?? true} onChange={v => setCatForm((p: any) => ({ ...p, isTabletVisible: v }))} />
          </div>

          <button
            onClick={() => saveCat.mutate(catForm)}
            disabled={saveCat.isPending || !catForm.name}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              opacity: !catForm.name ? 0.5 : 1, letterSpacing: '0.02em',
            }}
          >
            {saveCat.isPending ? 'Сохраняем…' : editingCat ? 'Сохранить изменения' : 'Создать категорию'}
          </button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelItem}
        onClose={() => setConfirmDelItem(null)}
        onConfirm={() => confirmDelItem && delItem.mutate(confirmDelItem.id)}
        title="Удалить позицию?"
        message={confirmDelItem ? `«${confirmDelItem.name}» будет удалена из меню. История продаж сохранится.` : undefined}
        confirmLabel="Удалить"
        danger
        loading={delItem.isPending}
      />

      <ConfirmDialog
        open={!!confirmDelCat}
        onClose={() => setConfirmDelCat(null)}
        onConfirm={() => confirmDelCat && delCat.mutate(confirmDelCat.id)}
        title="Удалить категорию?"
        message={confirmDelCat ? `Категория «${confirmDelCat.name}» будет удалена. Позиции из неё не удалятся, но останутся без категории.` : undefined}
        confirmLabel="Удалить"
        danger
        loading={delCat.isPending}
      />

      <style>{`
        .cat-rail { scrollbar-width: none; -ms-overflow-style: none; }
        .cat-rail::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
