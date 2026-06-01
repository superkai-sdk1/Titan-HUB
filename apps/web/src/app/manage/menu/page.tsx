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
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '@/lib/api'
import { PageHeader, Sheet, Toggle, ConfirmDialog, INP, SEL, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

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

/* ─── 20 CATEGORY PRESETS WITH UNIQUE SVG + COLOR ─────────────── */
type Preset = { id: string; gridLabel: string; defaultName: string; color: string; svg: (c: string, s: number) => React.ReactNode }

const CAT_PRESETS: Preset[] = [
  {
    id: 'cold_drinks', gridLabel: 'Холодные', defaultName: 'Холодные напитки', color: '#06B6D4',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4h6l-2 17H11L9 4z" />
        <line x1="15.5" y1="4" x2="15.5" y2="11" strokeWidth="2.5" />
        <path d="M11 11h2" />
        <path d="M10.5 15h3" />
      </svg>
    ),
  },
  {
    id: 'hot_drinks', gridLabel: 'Горячие', defaultName: 'Горячие напитки', color: '#F97316',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 11h10v7a2 2 0 01-2 2H9a2 2 0 01-2-2v-7z" />
        <path d="M17 14h1a1.5 1.5 0 000-3h-1" />
        <path d="M9.5 8.5c0-1.5 1.5-1.5 1.5-3" />
        <path d="M13 8.5c0-1.5 1.5-1.5 1.5-3" />
      </svg>
    ),
  },
  {
    id: 'snacks', gridLabel: 'Снэки', defaultName: 'Снэки', color: '#F59E0B',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="10" r="2.5" />
        <circle cx="15" cy="10" r="2.5" />
        <circle cx="12" cy="8" r="2.5" />
        <path d="M8 12l-1 9h10l-1-9" />
        <line x1="12" y1="12" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'tariffs', gridLabel: 'Тарифы', defaultName: 'Тарифы', color: '#8B5CF6',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="9" />
        <path d="M12 9v4h3.5" />
        <line x1="10" y1="4" x2="14" y2="4" strokeWidth="2.5" />
        <line x1="12" y1="2.5" x2="12" y2="5.5" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: 'food', gridLabel: 'Еда', defaultName: 'Еда', color: '#10B981',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="3" x2="8" y2="21" />
        <line x1="6" y1="3" x2="6" y2="9" />
        <line x1="10" y1="3" x2="10" y2="9" />
        <path d="M6 9a2 2 0 004 0" />
        <line x1="16" y1="3" x2="16" y2="21" />
        <path d="M16 3c2 0 3 3 3 6h-3" />
      </svg>
    ),
  },
  {
    id: 'hookah', gridLabel: 'Кальяны', defaultName: 'Кальяны', color: '#F43F5E',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="4.5" rx="3.5" ry="2.5" />
        <line x1="12" y1="7" x2="12" y2="11" />
        <ellipse cx="12" cy="13" rx="6" ry="2.5" />
        <line x1="12" y1="15.5" x2="12" y2="18.5" />
        <ellipse cx="12" cy="19.5" rx="5" ry="1.5" />
        <path d="M6.5 13c-2 1.5-4 5-4 7" />
        <circle cx="2.5" cy="20" r="1.5" fill={c} stroke="none" fillOpacity="0.5" />
        <circle cx="2.5" cy="20" r="1.5" />
      </svg>
    ),
  },
  {
    id: 'desserts', gridLabel: 'Десерты', defaultName: 'Десерты', color: '#EC4899',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 13h8v6a1 1 0 01-1 1H9a1 1 0 01-1-1v-6z" />
        <path d="M8 13c0-3 2-6 4-6s4 3 4 6" />
        <line x1="12" y1="7" x2="12" y2="4.5" />
        <circle cx="12" cy="4" r="1.5" fill={c} stroke="none" />
        <circle cx="12" cy="4" r="1.5" />
      </svg>
    ),
  },
  {
    id: 'cocktails', gridLabel: 'Коктейли', defaultName: 'Коктейли', color: '#6366F1',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4h14L12 14v7" />
        <line x1="9" y1="21" x2="15" y2="21" />
        <path d="M5 4l3.5 5h7L19 4" />
      </svg>
    ),
  },
  {
    id: 'beer', gridLabel: 'Пиво', defaultName: 'Пиво', color: '#D97706',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 9h8l-1 12H9L8 9z" />
        <path d="M7 9c0-2.5 1-4 5-4s5 1.5 5 4" />
        <path d="M7 9c-1.5 0-2.5.5-2.5 1.5S5.5 12 7 12" />
        <path d="M16 12h1.5a1.5 1.5 0 000-3H16" />
        <path d="M10 7c0-1 1.5-1 1.5-2.5" />
        <path d="M13.5 7c0-1 1.5-1 1.5-2.5" />
      </svg>
    ),
  },
  {
    id: 'lemonade', gridLabel: 'Лимонады', defaultName: 'Лимонады', color: '#65A30D',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="5.64" y1="5.64" x2="18.36" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="5.64" y2="18.36" />
      </svg>
    ),
  },
  {
    id: 'coffee', gridLabel: 'Кофе', defaultName: 'Кофе', color: '#C2410C',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 13h8v4a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4z" />
        <path d="M16 15.5h1a2 2 0 000-4h-1" />
        <line x1="5" y1="21" x2="19" y2="21" />
        <path d="M9.5 11c0-1.5 1.5-1.5 1.5-3" />
        <path d="M13 11c0-1.5 1.5-1.5 1.5-3" />
      </svg>
    ),
  },
  {
    id: 'tea', gridLabel: 'Чай', defaultName: 'Чай', color: '#0D9488',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 4h4a3 3 0 013 3v7a3 3 0 01-3 3H10a3 3 0 01-3-3V7a3 3 0 013-3z" />
        <path d="M17 9h1a2 2 0 010 4h-1" />
        <path d="M7 9H6a2 2 0 000 4h1" />
        <path d="M11 4V2.5" />
        <ellipse cx="12" cy="2.5" rx="1.5" ry="1" />
        <line x1="8" y1="20" x2="16" y2="20" />
        <line x1="6" y1="23" x2="18" y2="23" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'breakfast', gridLabel: 'Завтраки', defaultName: 'Завтраки', color: '#CA8A04',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="14" rx="8" ry="5.5" />
        <circle cx="12" cy="13" r="3" fill={c} fillOpacity="0.4" stroke="none" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
  },
  {
    id: 'pizza', gridLabel: 'Пицца', defaultName: 'Пицца', color: '#DC2626',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3L3 21h18L12 3z" />
        <circle cx="10" cy="14" r="1.5" fill={c} fillOpacity="0.5" stroke="none" />
        <circle cx="14.5" cy="15" r="1.5" fill={c} fillOpacity="0.5" stroke="none" />
        <circle cx="12" cy="10.5" r="1.5" fill={c} fillOpacity="0.5" stroke="none" />
        <path d="M5.5 15l13-4" strokeOpacity="0.4" />
      </svg>
    ),
  },
  {
    id: 'games', gridLabel: 'Настолки', defaultName: 'Настолки', color: '#2563EB',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" fill={c} stroke="none" />
        <circle cx="15.5" cy="8.5" r="1.5" fill={c} stroke="none" />
        <circle cx="8.5" cy="15.5" r="1.5" fill={c} stroke="none" />
        <circle cx="15.5" cy="15.5" r="1.5" fill={c} stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill={c} stroke="none" />
      </svg>
    ),
  },
  {
    id: 'vip', gridLabel: 'VIP', defaultName: 'VIP', color: '#7C3AED',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l2-9 5.5 5 0.5-8 5.5 8L20 5" />
        <rect x="4" y="17" width="16" height="3" rx="1" fill={c} fillOpacity="0.2" />
        <rect x="4" y="17" width="16" height="3" rx="1" />
      </svg>
    ),
  },
  {
    id: 'rental', gridLabel: 'Аренда', defaultName: 'Аренда', color: '#64748B',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="10" r="4.5" />
        <line x1="13" y1="10" x2="22" y2="10" />
        <line x1="19" y1="7.5" x2="19" y2="12.5" />
        <line x1="22" y1="7.5" x2="22" y2="12.5" />
        <path d="M13 14.5l-4.5 4.5" strokeWidth="2" />
        <circle cx="8.5" cy="10" r="2" />
      </svg>
    ),
  },
  {
    id: 'events', gridLabel: 'Мероприятия', defaultName: 'Мероприятия', color: '#A855F7',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="6" width="16" height="15" rx="2" />
        <path d="M16 3v6M8 3v6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <circle cx="9" cy="17" r="1.5" fill={c} stroke="none" />
        <circle cx="12" cy="17" r="1.5" fill={c} stroke="none" />
        <circle cx="15" cy="17" r="1.5" fill={c} stroke="none" />
      </svg>
    ),
  },
  {
    id: 'sweets', gridLabel: 'Сладости', defaultName: 'Сладости', color: '#C026D3',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8.5" r="5.5" />
        <path d="M8 6.5c1-1.5 5-1.5 6 0.5" />
        <line x1="12" y1="14" x2="10.5" y2="22" />
        <line x1="9" y1="20" x2="13" y2="20" />
      </svg>
    ),
  },
  {
    id: 'other', gridLabel: 'Прочее', defaultName: 'Прочее', color: '#475569',
    svg: (c, s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h9a0 0 0 010 0l7 7-7 7H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
        <circle cx="9" cy="12" r="2" fill={c} fillOpacity="0.4" stroke="none" />
        <circle cx="9" cy="12" r="2" />
      </svg>
    ),
  },
]

/* ─── ALL PRESET COLORS for color picker ─────────────────────── */
const PALETTE = CAT_PRESETS.map(p => p.color)

/* ─── Icon renderer: preset SVG or Icon component fallback ──── */
function CatIconRenderer({ icon, size = 20, color }: { icon?: string; size?: number; color?: string }) {
  const preset = CAT_PRESETS.find(p => p.id === icon)
  if (preset) return <>{preset.svg(color || preset.color, size)}</>
  return <Icon name={icon || 'category'} size={size} color={color} />
}

const BLANK_ITEM = {
  name: '', price: '0', costPrice: '0', category: '', isActive: true, isTop: false,
  trackStock: false, isService: false, stockQuantity: '0', isTabletVisible: false,
  searchTags: [] as string[], linkedSpaceId: '',
}
const BLANK_CAT = { name: '', icon: 'food', color: '#10B981', isTabletVisible: true }

function SortableItem({ item, cats, onEdit, onDelete, reorderEnabled }: { item: any; cats: any[]; onEdit: () => void; onDelete: () => void; reorderEnabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !reorderEnabled })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : item.isActive ? 1 : 0.5, zIndex: isDragging ? 999 : 'auto' }

  const cat = cats.find((c: any) => c.id === item.category)
  const catName = cat?.name ?? item.category ?? null
  const catColor = resolveHex(cat?.color)
  const catColorObj = getCatColorObj(cat?.color)
  const stock = parseNum(item.stockQuantity)
  const stockColor = stock === 0 ? '#F43F5E' : stock <= 5 ? '#F59E0B' : '#10B981'

  return (
    <div ref={setNodeRef} style={style}>
      <div className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {reorderEnabled && (
          <span
            {...attributes}
            {...listeners}
            aria-label="Перетащить для сортировки"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none', flexShrink: 0, padding: 4, margin: -4 }}
          >
            <Icon name="drag_indicator" size={20} color="rgba(204,195,216,0.3)" />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
            {item.isTop && (
              <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="star" size={12} color="#F59E0B" />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
            {catName && (
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 8px', borderRadius: 6, background: catColorObj.light, color: catColorObj.text, letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CatIconRenderer icon={cat?.icon} size={11} color={catColor} />
                {catName}
              </span>
            )}
            {item.trackStock && (
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 8px', borderRadius: 6, background: `${stockColor}15`, color: stockColor, letterSpacing: '0.04em' }}>
                {Math.floor(stock)} шт
              </span>
            )}
            {item.trackStock && Number(item.stockQuantity) === 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(244,63,94,0.15)', color: '#F43F5E', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em' }}>НЕТ В НАЛИЧИИ</span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{parseNum(item.price).toLocaleString('ru')} ₽</p>
        <button onClick={onEdit} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(139,92,246,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
          <Icon name="edit" size={16} />
        </button>
        <button onClick={onDelete} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171', flexShrink: 0 }}>
          <Icon name="delete" size={16} />
        </button>
      </div>
    </div>
  )
}

/* ─── Category filter chip (rail) ──────────────────────────────── */
function CatChip({ label, icon, color, count, active, onClick, dashed }: { label: string; icon?: React.ReactNode; color?: string; count?: number; active: boolean; onClick: () => void; dashed?: boolean }) {
  const c = color || '#8B5CF6'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
        padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
        border: dashed ? '1.5px dashed rgba(255,255,255,0.25)' : `1.5px solid ${active ? c : 'rgba(255,255,255,0.1)'}`,
        background: dashed ? 'transparent' : active ? `${c}22` : 'rgba(255,255,255,0.03)',
        color: dashed ? 'var(--on-surface-variant)' : active ? c : 'var(--on-surface-variant)',
        fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {icon}
      {label}
      {typeof count === 'number' && (
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", opacity: 0.7 }}>{count}</span>
      )}
    </button>
  )
}

export default function MenuPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
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
  const uncategorizedCount = allItems.filter((i: any) => !i.category || !catIds.has(i.category)).length
  const activeCatObj = activeCat !== 'all' && activeCat !== 'none' ? cats.find((c: any) => c.id === activeCat) : null

  const filteredItems = sortedItems.filter((i: any) => {
    // Позиции категории «Тарифы» управляются в разделе «Тарифы и аренда» — прячем.
    if (tariffCatIds.has(i.category)) return false
    if (search && !i.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (activeCat === 'all') return true
    if (activeCat === 'none') return !i.category || !catIds.has(i.category)
    return i.category === activeCat
  })

  // Перетаскивание сохраняет sortOrder только для ВИДИМОГО подмножества. При
  // активном фильтре/поиске это перемешало бы глобальный порядок скрытых позиций.
  // Поэтому reorder разрешён лишь когда виден полный список (все категории, без поиска).
  const reorderEnabled = activeCat === 'all' && !search

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'categories'] }); setConfirmDelCat(null); setActiveCat('all') },
    onError: () => { setConfirmDelCat(null); show('Не удалось удалить категорию', 'error') },
  })
  const reorderItems = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch('/menu/items/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] })
  })

  function handleItemDragEnd(event: DragEndEvent) {
    if (!reorderEnabled) return // защита: не перемешиваем глобальный порядок при фильтре
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
  function openItem(item?: any) {
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
    } : BLANK_ITEM)
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

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Меню"
        subtitle={`${allItems.length} позиций · ${cats.length} категорий`}
        action={{ label: 'Добавить', icon: 'add', onClick: () => openItem() }}
      />

      {/* Search + category rail */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
          </div>
          <div className="cat-rail" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
            <CatChip label="Все" count={allItems.length} active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
            {cats.map((c: any) => (
              <CatChip
                key={c.id}
                label={c.name}
                color={resolveHex(c.color)}
                count={allItems.filter((i: any) => i.category === c.id).length}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
                icon={<CatIconRenderer icon={c.icon} size={15} color={activeCat === c.id ? resolveHex(c.color) : 'currentColor'} />}
              />
            ))}
            {uncategorizedCount > 0 && (
              <CatChip label="Без категории" count={uncategorizedCount} active={activeCat === 'none'} onClick={() => setActiveCat('none')} />
            )}
            <CatChip label="Категория" active={false} dashed onClick={openNewCat} icon={<Icon name="add" size={15} />} />
          </div>
        </div>
      </div>

      {/* Active category toolbar — редактирование/удаление выбранной категории */}
      {activeCatObj && (
        <div style={{ background: 'rgba(21,18,27,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${resolveHex(activeCatObj.color)}1f`, border: `1px solid ${resolveHex(activeCatObj.color)}40` }}>
              <CatIconRenderer icon={activeCatObj.icon} size={17} color={resolveHex(activeCatObj.color)} />
            </div>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeCatObj.name}</span>
            <button onClick={() => openEditCat(activeCatObj)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="edit" size={14} /> Изменить
            </button>
            <button onClick={() => setConfirmDelCat(activeCatObj)} aria-label="Удалить категорию" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="delete" size={15} />
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 96px)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
          <SortableContext items={filteredItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <Icon name="restaurant_menu" size={48} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>{search ? 'Ничего не найдено' : activeCat === 'all' ? 'Позиций нет' : 'В этой категории нет позиций'}</p>
                </div>
              )}
              {!reorderEnabled && filteredItems.length > 0 && (
                <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="info" size={13} color="rgba(204,195,216,0.45)" />
                  Сбросьте фильтр и поиск, чтобы менять порядок позиций
                </p>
              )}
              {filteredItems.map((item: any) => (
                <SortableItem key={item.id} item={item} cats={cats} onEdit={() => openItem(item)} onDelete={() => setConfirmDelItem(item)} reorderEnabled={reorderEnabled} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

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
          {form.trackStock && <div><label style={LBL}>Количество на складе</label><input type="number" value={form.stockQuantity} onChange={e => setForm((p: any) => ({ ...p, stockQuantity: e.target.value }))} style={INP} /></div>}
          <button onClick={() => saveItem.mutate({ ...form, price: Number(form.price), costPrice: Number(form.costPrice), stockQuantity: Number(form.stockQuantity), isTabletVisible: form.isTabletVisible, searchTags: form.searchTags, linkedSpaceId: form.linkedSpaceId || undefined })} disabled={saveItem.isPending || !form.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: !form.name ? 0.6 : 1 }}>
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
