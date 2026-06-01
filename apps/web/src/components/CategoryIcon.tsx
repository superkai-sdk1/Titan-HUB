import React from 'react'
import { Icon } from '@/components/Icon'

/* ─── 20 CATEGORY PRESETS WITH UNIQUE SVG + COLOR ─────────────── */
// Источник правды для иконок категорий меню. Используется и в управлении меню
// (выбор пресета), и на планшете/в кассе (отображение иконки категории), чтобы
// нигде не было «квадратиков» вместо иконок.
export type Preset = { id: string; gridLabel: string; defaultName: string; color: string; svg: (c: string, s: number) => React.ReactNode }

export const CAT_PRESETS: Preset[] = [
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
export const PALETTE = CAT_PRESETS.map(p => p.color)

/* ─── Icon renderer: preset SVG or Icon component fallback ──── */
export function CategoryIcon({ icon, size = 20, color }: { icon?: string; size?: number; color?: string }) {
  const preset = CAT_PRESETS.find(p => p.id === icon)
  if (preset) return <>{preset.svg(color || preset.color, size)}</>
  return <Icon name={icon || 'category'} size={size} color={color} />
}
