'use client'
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/Icon'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PullToRefreshContainer } from '@/components/PullToRefreshContainer'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useCountUp } from '@/hooks/useCountUp'
import { StateView } from '@/components/StateView'
import { Chip } from '@/components/manage/DesignSystem'
import { ExpensesTab } from './ExpensesTab'

// ─── Constants ────────────────────────────────────────────────────────────────
type MainTab = 'overview' | 'finance' | 'expenses' | 'games' | 'bar' | 'players' | 'staff'
type ReportRange = '7d' | '30d' | 'month' | 'custom'

const PAY_COLORS: Record<string, string> = {
  cash: '#10B981', card: '#3B82F6', transfer: '#8B5CF6',
  bonus: '#F59E0B', deposit: '#06B6D4', certificate: '#14B8A6', debt: '#F43F5E',
}
const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32', silver: '#94A3B8', gold: '#F59E0B',
  platinum: '#E2E8F0', null: 'rgba(204,195,216,0.4)',
}
const TIER_LABELS: Record<string, string> = {
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина', null: 'Без уровня',
}
const ABC_COLORS: Record<string, string> = { A: '#8B5CF6', B: '#3B82F6', C: '#94A3B8' }
// Полные подписи методов оплаты (для чеков) — по ТЗ.
const PAY_LABELS_FULL: Record<string, string> = {
  cash: 'Наличные', card: 'Перевод', transfer: 'СБП', bonus: 'Бонусы',
  deposit: 'Депозит', debt: 'Долг', split: 'Раздельная', certificate: 'Сертификат',
}
function payLabel(m: string) { return PAY_LABELS_FULL[m] ?? m }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }
function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }

// Телеметрия аналитики (fire-and-forget): какие разделы/метрики реально смотрят.
function track(event: string, props?: Record<string, unknown>) {
  api.post('/analytics/track', { event, props: props ?? {} }).catch(() => { /* не критично */ })
}

// Экспорт в CSV (разделитель «;» + BOM — корректно открывается в Excel с кириллицей).
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [headers, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Предыдущий равный период (для сравнения) — сдвиг на длину периода в днях назад.
function prevPeriodRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00+03:00`).getTime()
  const t = new Date(`${to}T00:00:00+03:00`).getTime()
  const days = Math.max(1, Math.round((t - f) / 86400000) + 1)
  const shift = (d: string) => new Date(new Date(`${d}T00:00:00+03:00`).getTime() - days * 86400000 + 3 * 3600000).toISOString().split('T')[0]
  return { from: shift(from), to: shift(to) }
}
function pctDelta(cur: number, prev: number): number { return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0) }

// Скелетоны загрузки (вместо спиннера) — карточки-плейсхолдеры.
function Skeleton({ h = 88, style }: { h?: number; style?: React.CSSProperties }) {
  return <div className="ti-skeleton" style={{ borderRadius: 16, height: h, ...style }} />
}
function SkeletonCards({ n = 4 }: { n?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>{Array.from({ length: n }).map((_, i) => <Skeleton key={i} h={92} />)}</div>
}

// Кнопка экспорта CSV (компактная, для шапок секций).
function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Экспорт в CSV" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
      <Icon name="upload_file" size={14} /> CSV
    </button>
  )
}
function getRange(range: ReportRange, from: string, to: string): [string, string] {
  const now = new Date()
  if (range === '7d') return [format(subDays(now, 6), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')]
  if (range === '30d') return [format(subDays(now, 29), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')]
  if (range === 'month') return [format(startOfMonth(now), 'yyyy-MM-dd'), format(endOfMonth(now), 'yyyy-MM-dd')]
  return [from, to]
}

// ─── Глобальный фильтр периода ────────────────────────────────────────────────
// Единый селектор периода. Даты — по БИЗНЕС-ДНЯМ МСК (09:00→06:00): «Сегодня» — это
// текущий бизнес-день, а не календарные сутки. from/to (YYYY-MM-DD) шлём в
// /analytics/overview, где они разворачиваются в окно [from 09:00, to+1 09:00).
type PeriodPreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'
const PERIOD_OPTS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: '7d', label: '7 дней' },
  { key: '30d', label: '30 дней' },
  { key: 'month', label: 'Этот месяц' },
  { key: 'custom', label: 'Период' },
]
const MSK_OFFSET = 3 * 3600 * 1000
function mskBizDay(daysAgo = 0): string {
  return new Date(Date.now() + MSK_OFFSET - 9 * 3600000 - daysAgo * 86400000).toISOString().split('T')[0]
}
function periodRange(preset: PeriodPreset, cf: string, ct: string): { from: string; to: string } {
  switch (preset) {
    case 'today': return { from: mskBizDay(0), to: mskBizDay(0) }
    case 'yesterday': return { from: mskBizDay(1), to: mskBizDay(1) }
    case '7d': return { from: mskBizDay(6), to: mskBizDay(0) }
    case '30d': return { from: mskBizDay(29), to: mskBizDay(0) }
    case 'month': { const m = new Date(Date.now() + MSK_OFFSET).toISOString().slice(0, 7); return { from: `${m}-01`, to: mskBizDay(0) } }
    case 'custom': return { from: cf || mskBizDay(6), to: ct || mskBizDay(0) }
  }
}
function periodLabel(preset: PeriodPreset, from: string, to: string): string {
  if (preset === 'custom' || preset === 'month') return from === to ? from : `${from} — ${to}`
  return PERIOD_OPTS.find(o => o.key === preset)?.label ?? ''
}

function usePeriod() {
  const [preset, setPreset] = useState<PeriodPreset>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  // Гидратация из localStorage (персист выбора между заходами).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('analytics:period')
      if (raw) {
        const p = JSON.parse(raw)
        if (p.preset) setPreset(p.preset)
        if (p.customFrom) setCustomFrom(p.customFrom)
        if (p.customTo) setCustomTo(p.customTo)
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('analytics:period', JSON.stringify({ preset, customFrom, customTo })) } catch { /* ignore */ }
  }, [preset, customFrom, customTo])
  const { from, to } = periodRange(preset, customFrom, customTo)
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, from, to, label: periodLabel(preset, from, to) }
}

function PeriodSelector({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {PERIOD_OPTS.map(o => (
          <Chip key={o.key} active={p.preset === o.key} onClick={() => p.setPreset(o.key)} size="sm">{o.label}</Chip>
        ))}
      </div>
      {p.preset === 'custom' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={p.customFrom} onChange={e => p.setCustomFrom(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 12 }} />
          <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>—</span>
          <input type="date" value={p.customTo} onChange={e => p.setCustomTo(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 12 }} />
        </div>
      )}
    </div>
  )
}

// Время чека в МСК (UTC+3) → HH:MM, независимо от часового пояса устройства.
function fmtMsk(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(iso))
  } catch { return '—' }
}
function fmtMskDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(iso))
  } catch { return '—' }
}
// Сдвиг бизнес-дня (YYYY-MM-DD) на N дней.
function shiftBizDay(day: string, deltaDays: number): string {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return format(d, 'yyyy-MM-dd')
}
function bizDayLabel(day: string): string {
  try { return format(new Date(`${day}T12:00:00`), 'd MMMM yyyy', { locale: ru }) } catch { return day }
}

const INP: React.CSSProperties = { padding: '9px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 12px', display: 'block' }

// ─── Shared components ────────────────────────────────────────────────────────
function KpiCard({ label, value, rawValue, suffix = ' ₽', sub, delta, icon, iconColor, iconBg, onClick }: {
  label: string; value?: string; rawValue?: number; suffix?: string; sub: string; delta?: number
  icon: string; iconColor: string; iconBg: string; onClick?: () => void
}) {
  const animated = useCountUp(rawValue ?? 0, 700)
  const displayValue = rawValue !== undefined
    ? `${animated.toLocaleString('ru', { maximumFractionDigits: 0 })}${suffix}`
    : (value ?? '')
  const clickable = !!onClick
  return (
    <div
      className="glass-l2 ti-slide-up"
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      style={{ borderRadius: 16, padding: 18, cursor: clickable ? 'pointer' : 'default', position: 'relative', overflow: 'hidden', transition: 'transform 0.15s, border-color 0.15s' }}
      onMouseEnter={clickable ? e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' } : undefined}
      onMouseLeave={clickable ? e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${iconColor}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={iconColor} />
        </div>
        {delta !== undefined ? <DeltaBadge delta={delta} /> : clickable ? <Icon name="chevron_right" size={16} color="rgba(204,195,216,0.55)" /> : null}
      </div>
      <p style={{ fontSize: 25, fontWeight: 800, margin: '0 0 4px', color: 'var(--on-surface)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>{displayValue}</p>
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px', color: 'var(--on-surface-variant)' }}>{label}</p>
      <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.6)', margin: 0 }}>{sub}</p>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (!delta) return <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(204,195,216,0.1)', borderRadius: 6, padding: '2px 7px' }}><span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(204,195,216,0.45)' }}>0%</span></div>
  const up = delta > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: up ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', borderRadius: 6, padding: '2px 7px' }}>
      <Icon name={up ? 'trending_up' : 'trending_down'} size={11} color={up ? '#10B981' : '#F43F5E'} />
      <span style={{ fontSize: 10, fontWeight: 700, color: up ? '#10B981' : '#F43F5E' }}>{up ? '+' : ''}{delta}%</span>
    </div>
  )
}

function MiniBarChart({ data, color = '#8B5CF6', height = 60 }: { data: { date: string; revenue: string | number }[]; color?: string; height?: number }) {
  if (!data.length) return null
  const values = data.map(d => parseNum(d.revenue))
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.map((d, i) => (
        <div key={d.date} title={`${d.date}: ${fmt(values[i])} ₽`}
          style={{ flex: 1, minWidth: 4, height: `${Math.max((values[i] / max) * 100, 4)}%`, background: color, borderRadius: '3px 3px 0 0', opacity: 0.6 + (i / data.length) * 0.4, cursor: 'default' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = String(0.6 + (i / data.length) * 0.4) }}
        />
      ))}
    </div>
  )
}

function PayBreakdown({ data }: { data: { method: string; total: string | number }[] }) {
  const total = data.reduce((s, p) => s + parseNum(p.total), 0)
  if (!data.length) return <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет данных</p>
  return (
    <>
      <div style={{ height: 18, borderRadius: 9999, display: 'flex', overflow: 'hidden', marginBottom: 14, gap: 2 }}>
        {data.map(p => {
          const pct = total > 0 ? (parseNum(p.total) / total) * 100 : 0
          return <div key={p.method} style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, background: PAY_COLORS[p.method] ?? '#8B5CF6' }} title={`${payLabel(p.method)}: ${pct.toFixed(1)}%`} />
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(p => {
          const pct = total > 0 ? ((parseNum(p.total) / total) * 100).toFixed(0) : '0'
          return (
            <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_COLORS[p.method] ?? '#8B5CF6', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--on-surface-variant)' }}>{payLabel(p.method)}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(parseNum(p.total))} ₽</span>
              <span style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', width: 30, textAlign: 'right' }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Net/Gross breakdown shared bits ──────────────────────────────────────────
type NetBreak = {
  gross: number | string; checks: number; avgCheck: number | string
  eventRevenue?: number | string; eventChecks?: number; eventCosts?: number | string; clubChecks?: number
  refunds: number | string; commission: number | string; cogs: number | string
  opex: number | string; salary: number | string; expenses: number | string; net: number | string
}

// Раскладка валовая → чистая (общая для модалок и списка чеков).
function NetBreakdownRows({ b }: { b: NetBreak }) {
  const rows: [string, number, 'plus' | 'minus' | 'net'][] = [
    ['Валовая выручка', parseNum(b.gross), 'plus'],
    ['Возвраты', parseNum(b.refunds), 'minus'],
    ['Эквайринг', parseNum(b.commission), 'minus'],
    ['Себестоимость', parseNum(b.cogs), 'minus'],
    ['Расходы', parseNum(b.opex), 'minus'],
    ['ЗП', parseNum(b.salary), 'minus'],
    ['Чистая прибыль', parseNum(b.net), 'net'],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {rows.map(([label, val, kind]) => {
        const highlight = kind === 'net'
        const sign = kind === 'minus' && val !== 0 ? '− ' : ''
        const color = highlight ? (val >= 0 ? '#10B981' : '#F43F5E') : kind === 'minus' ? '#F43F5E' : 'var(--on-surface)'
        return (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: highlight ? '12px 12px' : '9px 12px', borderRadius: highlight ? 10 : 0, background: highlight ? 'rgba(16,185,129,0.06)' : 'transparent', borderTop: highlight ? '1px solid rgba(255,255,255,0.08)' : 'none', marginTop: highlight ? 6 : 0 }}>
            <span style={{ fontSize: highlight ? 13 : 12, fontWeight: highlight ? 700 : 400, color: highlight ? 'var(--on-surface)' : 'var(--on-surface-variant)' }}>{label}</span>
            <span style={{ fontSize: highlight ? 16 : 13, fontWeight: highlight ? 800 : 600, fontStyle: highlight ? 'italic' : 'normal', color }}>{sign}{fmt(Math.abs(val))} ₽</span>
          </div>
        )
      })}
    </div>
  )
}

// Базовая шторка (как в shifts/pos): затемнение + glass снизу.
function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  // Рендерим через портал в document.body: контент дашборда обёрнут в
  // PullToRefreshContainer с transform на враппере, а любой transform создаёт
  // содержащий блок для position:fixed — без портала шторка позиционировалась бы
  // относительно длинного контента и «уезжала» в самый низ страницы (приходилось
  // скроллить). Портал выносит её к body → fixed снова относительно вьюпорта.
  const sheet = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-l1 ti-slide-up" style={{ width: '100%', maxWidth: 480, maxHeight: '88dvh', overflowY: 'auto', borderRadius: '24px 24px 0 0', padding: '22px 22px calc(24px + var(--bottom-nav-clear, 96px))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
  if (typeof document === 'undefined') return null
  return createPortal(sheet, document.body)
}

// Модалка детализации KPI: показывает раскладку gross→net.
function KpiBreakdownModal({ title, subtitle, b, onClose }: { title: string; subtitle?: string; b: NetBreak; onClose: () => void }) {
  useEffect(() => { track('drilldown', { title }) }, [title])
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: '#8B5CF6', lineHeight: 1 }}>{b.checks}</p>
          <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Чеков</p>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: '#4cd7f6', lineHeight: 1 }}>{fmt(parseNum(b.avgCheck))} ₽</p>
          <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Средний чек</p>
        </div>
      </div>
      <NetBreakdownRows b={b} />
    </Sheet>
  )
}

// Простая модалка-детализация для карточек без отдельной раскладки gross→net:
// показывает крупное значение + произвольный список «строк за цифрой».
function MetricDetailModal({ title, subtitle, value, valueColor = '#8B5CF6', rows, onClose }: {
  title: string; subtitle?: string; value: string; valueColor?: string
  rows: { label: string; value: string; color?: string }[]; onClose: () => void
}) {
  useEffect(() => { track('drilldown', { title }) }, [title])
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', marginBottom: 16 }}>
        <p style={{ fontSize: 28, fontWeight: 900, margin: 0, color: valueColor, lineHeight: 1 }}>{value}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.color ?? 'var(--on-surface)' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// Детализация позиции товара: выручка, кол-во, средняя цена, доля и ABC-класс.
function ItemDetailModal({ item, totalRev, onClose }: { item: any; totalRev: number; onClose: () => void }) {
  const rev = parseNum(item.totalRev)
  const qty = parseNum(item.totalQty)
  const avg = qty > 0 ? rev / qty : 0
  const share = item.share != null ? parseNum(item.share) : (totalRev > 0 ? (rev / totalRev) * 100 : 0)
  const abc = item.abc ?? 'C'
  return (
    <Sheet title={item.name ?? 'Позиция'} subtitle={item.category ?? undefined} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Выручка', value: `${fmt(rev)} ₽`, color: '#4cd7f6' },
          { label: 'Продано', value: `${fmt(qty)} шт`, color: '#A78BFA' },
          { label: 'Средняя цена', value: `${fmt(avg)} ₽`, color: '#10B981' },
          { label: 'Доля выручки', value: `${share.toFixed(1)}%`, color: ABC_COLORS[abc] ?? '#94A3B8' },
        ].map(m => (
          <div key={m.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
            <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: m.color, lineHeight: 1 }}>{m.value}</p>
            <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{m.label}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: `${ABC_COLORS[abc] ?? '#94A3B8'}14` }}>
        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>ABC-класс</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: ABC_COLORS[abc] ?? '#94A3B8' }}>Класс {abc}</span>
      </div>
    </Sheet>
  )
}

// Детализация игрока: суммарная трата, визиты, уровень, средний чек.
function PlayerDetailModal({ player, onClose }: { player: any; onClose: () => void }) {
  const pid: string | undefined = player?.playerId ?? player?.id
  const { data } = useQuery({
    queryKey: ['analytics', 'player', pid],
    queryFn: () => api.get<any>(`/analytics/players/${pid}`),
    enabled: !!pid,
  })
  const [openCheckId, setOpenCheckId] = useState<string | null>(null)

  const prof = data?.profile
  const at = data?.allTime ?? {}
  const l30 = data?.last30 ?? {}
  const recent: any[] = data?.recentChecks ?? []
  const tier = prof?.clientTier ?? player?.clientTier ?? 'null'
  const nickname = prof?.nickname ?? player?.nickname ?? 'Гость'

  const spend = parseNum(at.spend ?? player?.total)
  const visitDays = at.visitDays ?? player?.visits ?? 0
  const avg = parseNum(at.avgCheck) || (visitDays > 0 ? spend / visitDays : 0)
  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

  const kpis = [
    { label: 'Потрачено всего', value: `${fmt(spend)} ₽`, color: '#4cd7f6' },
    { label: 'Визитов (дней)', value: String(visitDays), color: '#A78BFA' },
    { label: 'Средний чек', value: `${fmt(avg)} ₽`, color: '#10B981' },
    { label: 'Частота', value: `${at.visitsPerMonth ?? 0}/мес`, color: '#F59E0B' },
  ]
  const rows: [string, string][] = [
    ['За 30 дней', `${fmt(parseNum(l30.spend))} ₽ · ${l30.checksCount ?? 0} чек.`],
    ['Последний визит', `${fmtDate(at.lastVisit)}${at.daysSinceLast != null ? ` · ${at.daysSinceLast} дн. назад` : ''}`],
    ['Первый визит', fmtDate(at.firstVisit)],
    ...(prof ? [['Баланс / бонусы', `${fmt(parseNum(prof.balance))} ₽ · ${fmt(parseNum(prof.bonusPoints))} ⭐`] as [string, string]] : []),
    ...(prof?.phone ? [['Телефон', prof.phone] as [string, string]] : []),
  ]

  return (
    <Sheet title={nickname} subtitle={`${TIER_LABELS[tier] ?? tier}${prof?.fullName ? ' · ' + prof.fullName : ''}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {kpis.map(m => (
            <div key={m.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
              <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: m.color, lineHeight: 1 }}>{m.value}</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{m.label}</p>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>

        <div>
          <span style={LBL}>Последние чеки</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.length === 0 ? <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', textAlign: 'center', padding: '12px 0' }}>Нет чеков</p> : recent.map(rc => (
              <button key={rc.id} onClick={() => setOpenCheckId(rc.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: 'var(--on-surface)', textAlign: 'left' }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', flex: 1, minWidth: 0 }}>{fmtMskDate(rc.createdAt)} · {fmtMsk(rc.createdAt)}</span>
                <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{fmt(parseNum(rc.totalAmount))} ₽</span>
                <Icon name="chevron_right" size={14} color="rgba(204,195,216,0.4)" />
              </button>
            ))}
          </div>
        </div>
      </div>
      {openCheckId && <CheckDetailModal id={openCheckId} onClose={() => setOpenCheckId(null)} />}
    </Sheet>
  )
}

// ─── Tab: Сегодня (бизнес-день 09:00–06:00) ────────────────────────────────────
function TodayTab({ businessDay }: { businessDay: string }) {
  const [modal, setModal] = useState<null | { title: string; subtitle?: string; b: NetBreak }>(null)
  const [openCheckId, setOpenCheckId] = useState<string | null>(null)
  const [openItem, setOpenItem] = useState<any | null>(null)

  const { data: checksData, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'checks', businessDay, businessDay],
    queryFn: () => api.get<any>(`/analytics/checks?from=${businessDay}&to=${businessDay}`),
    enabled: !!businessDay,
    refetchInterval: 60000,
  })
  const { data: payData } = useQuery({
    queryKey: ['analytics', 'payments', businessDay, businessDay],
    queryFn: () => api.get<any>(`/analytics/payments?from=${businessDay}&to=${businessDay}`),
    enabled: !!businessDay,
    refetchInterval: 60000,
  })
  const { data: prodData } = useQuery({
    queryKey: ['analytics', 'products', businessDay, businessDay],
    queryFn: () => api.get<any>(`/analytics/products?from=${businessDay}&to=${businessDay}`),
    enabled: !!businessDay,
    refetchInterval: 60000,
  })

  const summary: NetBreak | undefined = checksData?.summary
  const checks: any[] = checksData?.checks ?? []
  const payBreakdown: any[] = payData?.breakdown ?? []
  const products: any[] = prodData?.products ?? []
  const totalProdRev: number = parseNum(prodData?.totalRev)

  const gross = parseNum(summary?.gross)
  const net = parseNum(summary?.net)
  const checksCnt = summary?.checks ?? 0
  const avgCheck = parseNum(summary?.avgCheck)
  const commission = parseNum(summary?.commission)

  const openBreak = (title: string) => { if (summary) setModal({ title, subtitle: `${bizDayLabel(businessDay)} · 09:00–06:00`, b: summary }) }
  const totalPay = payBreakdown.reduce((s: number, p: any) => s + parseNum(p.total), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Заголовок бизнес-дня */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="today" size={16} color="#8B5CF6" />
        <span style={{ fontSize: 13, fontWeight: 700 }}>{bizDayLabel(businessDay)}</span>
        <span style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)' }}>· 09:00–06:00</span>
      </div>

      {/* Big cards — все кликабельны */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <KpiCard label="Выручка" rawValue={gross} sub="валовая за день" icon="payments" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" onClick={summary ? () => openBreak('Выручка · сегодня') : undefined} />
        <KpiCard label="Чистая прибыль" rawValue={net} suffix=" ₽" sub="с учётом расходов" icon="trending_up" iconColor={net >= 0 ? '#10B981' : '#F43F5E'} iconBg="rgba(16,185,129,0.1)" onClick={summary ? () => openBreak('Чистая прибыль · сегодня') : undefined} />
        <KpiCard label="Чеков" value={String(checksCnt)} suffix="" sub="закрыто за день" icon="receipt_long" iconColor="#4cd7f6" iconBg="rgba(76,215,246,0.1)" onClick={summary ? () => openBreak('Чеки · сегодня') : undefined} />
        <KpiCard label="Средний чек" rawValue={avgCheck} sub="выручка / чеки" icon="receipt" iconColor="#A78BFA" iconBg="rgba(167,139,250,0.1)" onClick={summary ? () => openBreak('Средний чек · сегодня') : undefined} />
      </div>

      {/* Эквайринг (потери) */}
      <div
        className="glass-l2"
        onClick={summary ? () => openBreak('Эквайринг · сегодня') : undefined}
        style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: summary ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="credit_card" size={18} color="#F59E0B" />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Эквайринг (потери)</p>
            <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>комиссия СБП 8%</p>
          </div>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#F59E0B' }}>{fmt(commission)} ₽</span>
      </div>

      {/* Методы оплаты за сегодня */}
      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <span style={LBL}>Методы оплаты — сегодня</span>
        {payBreakdown.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '14px 0' }}>Нет данных</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payBreakdown.map((p: any) => {
              const pct = totalPay > 0 ? (parseNum(p.total) / totalPay) * 100 : 0
              const color = PAY_COLORS[p.method] ?? '#94A3B8'
              return (
                <div key={p.method}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{payLabel(p.method)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(parseNum(p.total))} ₽ · {pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Топ товары за сегодня — кликабельны */}
      <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...LBL, margin: 0 }}>Топ товары — сегодня</span>
          <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{fmt(totalProdRev)} ₽</span>
        </div>
        {products.length === 0 ? <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет данных</p> : products.slice(0, 10).map((p: any, i: number) => {
          const abcColor = ABC_COLORS[p.abc] ?? '#94A3B8'
          const barPct = totalProdRev > 0 ? (parseNum(p.totalRev) / totalProdRev) * 100 : 0
          return (
            <button key={p.itemId ?? i} onClick={() => setOpenItem({ ...p, _totalRev: totalProdRev })} style={{ width: '100%', textAlign: 'left', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 12, alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 18, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: `${abcColor}22`, color: abcColor, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{p.abc}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: abcColor, borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt(parseNum(p.totalRev))} ₽</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{parseNum(p.totalQty).toFixed(0)} шт</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Чеки за сегодня — кликабельны */}
      <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...LBL, margin: 0 }}>Чеки сегодня</span>
          <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{checks.length}</span>
        </div>
        {isLoading ? <StateView state="loading" />
          : isError ? <StateView state="error" description="Не удалось загрузить чеки." action={{ label: 'Повторить', onClick: () => refetch() }} />
          : checks.length === 0 ? <p style={{ padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Пока нет чеков сегодня</p>
          : checks.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setOpenCheckId(c.id)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}
            >
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 44, flexShrink: 0 }}>{fmtMsk(c.createdAt)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.guestName || 'Гость'}</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 5px' }}>{c.staffNickname || '—'} · {c.itemCount ?? 0} поз.</p>
                <PayChips payments={c.payments ?? []} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{fmt(parseNum(c.totalAmount))} ₽</span>
            </button>
          ))}
      </div>

      {modal && <KpiBreakdownModal title={modal.title} subtitle={modal.subtitle} b={modal.b} onClose={() => setModal(null)} />}
      {openCheckId && <CheckDetailModal id={openCheckId} onClose={() => setOpenCheckId(null)} />}
      {openItem && <ItemDetailModal item={openItem} totalRev={openItem._totalRev ?? totalProdRev} onClose={() => setOpenItem(null)} />}
    </div>
  )
}

// ─── Tab: Сводка (live overview) ──────────────────────────────────────────────
function OverviewTab({ overview, periodText }: { overview: any; periodText: string }) {
  const [modal, setModal] = useState<null | { title: string; subtitle?: string; b: NetBreak }>(null)

  const cur = (overview?.current ?? {}) as NetBreak & { margin: number | null }
  const today: NetBreak | undefined = overview?.today
  const deltas = overview?.deltas ?? {}
  const gross = parseNum(cur.gross)
  const net = parseNum(cur.net)
  const cogs = parseNum(cur.cogs)
  const expenses = parseNum(cur.expenses)
  const commission = parseNum(cur.commission)
  const refundsV = parseNum(cur.refunds)
  const checks = cur.checks ?? 0
  const avgCheck = parseNum(cur.avgCheck)
  const eventChecks = cur.eventChecks ?? 0
  const eventRevenue = parseNum(cur.eventRevenue)
  const eventCosts = parseNum(cur.eventCosts)
  const margin = cur.margin
  const outflow = cogs + expenses + commission + refundsV
  const profitColor = net >= 0 ? '#10B981' : '#F43F5E'
  const lossDriver = expenses >= cogs && expenses > 0 ? 'расходы и ЗП' : cogs > 0 ? 'себестоимость' : 'возвраты и эквайринг'
  const healthLine = net >= 0 ? 'бизнес в плюсе за период' : `в минусе — основная статья: ${lossDriver}`
  const seg = (v: number) => (gross > 0 ? `${Math.min(100, Math.max(0, (v / gross) * 100))}%` : '0%')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HERO — финансовое здоровье */}
      <div className="glass-l2" role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModal({ title: `Прибыль · ${periodText}`, subtitle: 'раскладка валовая → чистая', b: cur }) } }}
        onClick={() => setModal({ title: `Прибыль · ${periodText}`, subtitle: 'раскладка валовая → чистая', b: cur })}
        style={{ borderRadius: 20, padding: 22, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span style={{ ...LBL, margin: 0 }}>Прибыль за период · {periodText}</span>
          <Icon name="chevron_right" size={16} color="rgba(204,195,216,0.55)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '8px 0 4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: profitColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{net >= 0 ? '' : '−'}{fmt(Math.abs(net))} ₽</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: `${profitColor}22`, color: profitColor }}>маржа {margin == null ? '—' : `${margin}%`}</span>
          {typeof deltas.profit === 'number' && <DeltaBadge delta={deltas.profit} />}
        </div>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 14px' }}>{healthLine}</p>
        <div style={{ height: 12, borderRadius: 9999, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.06)' }}>
          <div title="Себестоимость" style={{ width: seg(cogs), background: '#F59E0B' }} />
          <div title="Расходы + ЗП" style={{ width: seg(expenses), background: '#F43F5E' }} />
          <div title="Эквайринг + возвраты" style={{ width: seg(commission + refundsV), background: '#a855f7' }} />
          <div title="Прибыль" style={{ flex: 1, background: net >= 0 ? '#10B981' : 'transparent' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--on-surface-variant)' }}>
          <span>+{fmt(gross)} ₽ пришло</span>
          <span>−{fmt(outflow)} ₽ ушло</span>
        </div>
      </div>

      {/* 4 метрики (кликабельны → раскладка) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
        <KpiCard label="Выручка" rawValue={gross} sub="за период" delta={deltas.revenue} icon="payments" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" onClick={() => setModal({ title: `Выручка · ${periodText}`, subtitle: 'нажмите для раскладки', b: cur })} />
        <KpiCard label="Себестоимость" rawValue={cogs} sub={`${gross > 0 ? Math.round((cogs / gross) * 100) : 0}% от выручки`} icon="inventory" iconColor="#F59E0B" iconBg="rgba(245,158,11,0.1)" onClick={() => setModal({ title: `Себестоимость · ${periodText}`, b: cur })} />
        <KpiCard label="Расходы + ЗП" rawValue={expenses} sub={net < 0 && expenses >= cogs ? 'главная причина убытка' : 'операционные + ЗП'} icon="receipt" iconColor="#F43F5E" iconBg="rgba(244,63,94,0.1)" onClick={() => setModal({ title: `Расходы + ЗП · ${periodText}`, b: cur })} />
        <KpiCard label="Чеки" value={String(checks)} suffix="" sub={`${eventChecks > 0 ? 'средний клубный' : 'средний'} ${fmt(avgCheck)} ₽`} delta={deltas.checks} icon="receipt_long" iconColor="#4cd7f6" iconBg="rgba(76,215,246,0.1)" onClick={() => setModal({ title: `Чеки · ${periodText}`, b: cur })} />
      </div>

      {/* Мероприятия — отдельно от клубовских цифр (в общую выручку входят, но
          средний чек не раздувают). Квадратная панель: кол-во и полная выручка. */}
      {eventChecks > 0 && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 18, border: '1px solid rgba(236,72,153,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ ...LBL, margin: 0 }}>Мероприятия — {periodText}</span>
            <Icon name="celebration" size={18} color="#EC4899" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(236,72,153,0.08)' }}>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#EC4899', margin: '0 0 4px', lineHeight: 1 }}>{eventChecks}</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Мероприятий</p>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(236,72,153,0.08)' }}>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#EC4899', margin: '0 0 4px', lineHeight: 1 }}>{fmt(eventRevenue)} ₽</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Выручка</p>
            </div>
          </div>
          {eventCosts > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Расходы мероприятий · нетто</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                <span style={{ color: '#F43F5E' }}>−{fmt(eventCosts)} ₽</span>
                <span style={{ color: 'var(--on-surface-variant)', margin: '0 6px' }}>→</span>
                <span style={{ color: eventRevenue - eventCosts >= 0 ? '#10B981' : '#F43F5E' }}>{fmt(eventRevenue - eventCosts)} ₽</span>
              </span>
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '12px 0 0', lineHeight: 1.4 }}>
            Учтены в общей выручке и прибыли. В «среднем чеке» считаются отдельно, чтобы не искажать клубные показатели.
          </p>
        </div>
      )}

      {/* Бизнес-день (сегодня) — всегда отдельно */}
      {today && (
        <div className="glass-l2" onClick={() => setModal({ title: 'Выручка · бизнес-день', subtitle: `${bizDayLabel(overview?.businessDay ?? '')} · 09:00–06:00`, b: today })}
          style={{ borderRadius: 16, padding: 20, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ ...LBL, margin: 0 }}>Сегодня · бизнес-день</span>
            <Icon name="chevron_right" size={16} color="rgba(204,195,216,0.4)" />
          </div>
          <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: '0 0 14px' }}>{bizDayLabel(overview?.businessDay ?? '')} · 09:00–06:00</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Выручка', value: `${fmt(parseNum(today.gross))} ₽`, color: '#8B5CF6' },
              { label: 'Чеков', value: String(today.checks ?? 0), color: '#4cd7f6' },
              { label: 'Средний чек', value: `${fmt(parseNum(today.avgCheck))} ₽`, color: '#A78BFA' },
              { label: 'Эквайринг (потери)', value: `${fmt(parseNum(today.commission))} ₽`, color: '#F59E0B' },
            ].map(it => (
              <div key={it.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: it.color, lineHeight: 1 }}>{it.value}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{it.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Способы оплаты — строго за выбранный период (§9.1) */}
      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <span style={LBL}>Методы оплаты — {periodText}</span>
        <PayBreakdown data={overview?.paymentBreakdown ?? []} />
      </div>

      {modal && <KpiBreakdownModal title={modal.title} subtitle={modal.subtitle} b={modal.b} onClose={() => setModal(null)} />}
    </div>
  )
}

// ─── Tab: Отчёты (period-based) ───────────────────────────────────────────────
function ReportsTab({ from, to }: { from: string; to: string }) {
  const [subTab, setSubTab] = useState<'revenue' | 'products' | 'payments'>('revenue')
  const [metricModal, setMetricModal] = useState<null | { title: string; subtitle?: string; value: string; valueColor?: string; rows: { label: string; value: string; color?: string }[] }>(null)
  const [openItem, setOpenItem] = useState<any | null>(null)

  const { data: revData } = useQuery({
    queryKey: ['analytics', 'revenue', from, to],
    queryFn: () => api.get<any>(`/analytics/revenue?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })
  const { data: prodData } = useQuery({
    queryKey: ['analytics', 'products', from, to],
    queryFn: () => api.get<any>(`/analytics/products?from=${from}&to=${to}`),
    enabled: !!from && !!to && subTab === 'products',
  })
  // Платежи за выбранный период. Грузим всегда (не только на под-вкладке «Платежи»):
  // из суммы СБП-переводов считаем потери на эквайринг (8%) для сводки периода.
  const { data: payData } = useQuery({
    queryKey: ['analytics', 'payments', from, to],
    queryFn: () => api.get<any>(`/analytics/payments?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })
  // Сравнение с предыдущим равным периодом (дельты) — из /overview за тот же период.
  const { data: ov } = useQuery({
    queryKey: ['analytics', 'overview', from, to],
    queryFn: () => api.get<any>(`/analytics/overview?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })
  const deltas = ov?.deltas ?? {}

  // /analytics/revenue → { revenue: [{date,revenue,count}], expenses: [{date,total}], cogs: [{date,total}] }
  // Это РАЗДЕЛЬНЫЕ дневные серии (даты по выручке/расходам/себестоимости могут
  // не совпадать), поэтому суммы считаем по своим массивам, а не по одному `days`.
  const revRows: any[] = revData?.revenue ?? []
  const expRows: any[] = revData?.expenses ?? []
  const cogsRows: any[] = revData?.cogs ?? []
  const totalRevenue  = revRows.reduce((s: number, d: any) => s + parseNum(d.revenue), 0)
  const totalExpenses = expRows.reduce((s: number, d: any) => s + parseNum(d.total), 0)
  const totalCogs     = cogsRows.reduce((s: number, d: any) => s + parseNum(d.total), 0)
  const checksCount   = revRows.reduce((s: number, d: any) => s + (d.count || 0), 0)
  const avgCheck      = checksCount ? totalRevenue / checksCount : 0
  const maxDayRev     = revRows.length ? Math.max(...revRows.map((d: any) => parseNum(d.revenue))) : 1

  // /analytics/products → { products: [...], totalRev }
  const products: any[] = prodData?.products ?? []
  const totalProdRev: number = parseNum(prodData?.totalRev)
  // /analytics/payments → { breakdown: [{ method, total }] } за выбранный период.
  const payBreakdown: any[] = payData?.breakdown ?? []
  // Эквайринг (потери) — берём с сервера (/overview → netBreakdown). Сервер считает
  // его только по чекам, где надбавку НЕ доплатил клиент (acquiring_surcharge=0):
  // если комиссию закрыл покупатель, это не потеря владельца. Клиентский пересчёт по
  // всем СБП-переводам был бы неверным (списывал комиссию даже на оплаченную клиентом).
  const acquiring     = parseNum(ov?.current?.commission)
  // Прибыль с учётом эквайринга — согласуется со сводкой бэкенда.
  const profit        = totalRevenue - totalExpenses - totalCogs - acquiring

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row — все карточки кликабельны (раскрывают раскладку за цифрой) */}
      {(() => {
        const periodSub = `${format(new Date(from), 'd MMM', { locale: ru })} — ${format(new Date(to), 'd MMM yyyy', { locale: ru })}`
        const breakdownRows = [
          { label: 'Валовая выручка', value: `${fmt(totalRevenue)} ₽` },
          { label: 'Себестоимость', value: `− ${fmt(totalCogs)} ₽`, color: '#F43F5E' },
          { label: 'Операционные расходы', value: `− ${fmt(totalExpenses)} ₽`, color: '#F43F5E' },
          { label: 'Эквайринг (потери)', value: `− ${fmt(acquiring)} ₽`, color: '#F59E0B' },
          { label: 'Прибыль', value: `${fmt(profit)} ₽`, color: '#10B981' },
        ]
        const cards: { label: string; value: string; color: string; delta?: number; onClick: () => void }[] = [
          { label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6', delta: deltas.revenue, onClick: () => setMetricModal({ title: 'Выручка · период', subtitle: periodSub, value: `${fmt(totalRevenue)} ₽`, valueColor: '#4cd7f6', rows: breakdownRows }) },
          { label: 'Прибыль', value: `${fmt(profit)} ₽`, color: '#10B981', delta: deltas.profit, onClick: () => setMetricModal({ title: 'Прибыль · период', subtitle: periodSub, value: `${fmt(profit)} ₽`, valueColor: '#10B981', rows: breakdownRows }) },
          { label: 'Расходы', value: `${fmt(totalExpenses)} ₽`, color: '#F43F5E', delta: deltas.expenses, onClick: () => setMetricModal({ title: 'Расходы · период', subtitle: periodSub, value: `${fmt(totalExpenses)} ₽`, valueColor: '#F43F5E', rows: [{ label: 'Операционные расходы', value: `${fmt(totalExpenses)} ₽` }, { label: 'Себестоимость', value: `${fmt(totalCogs)} ₽`, color: '#F59E0B' }, { label: 'Эквайринг (потери)', value: `${fmt(acquiring)} ₽`, color: '#F59E0B' }] }) },
          { label: 'Чеков', value: String(checksCount), color: '#8B5CF6', delta: deltas.checks, onClick: () => setMetricModal({ title: 'Чеки · период', subtitle: periodSub, value: String(checksCount), valueColor: '#8B5CF6', rows: [{ label: 'Средний чек', value: `${fmt(avgCheck)} ₽` }, { label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6' }] }) },
          { label: 'Средний чек', value: `${fmt(avgCheck)} ₽`, color: '#A78BFA', onClick: () => setMetricModal({ title: 'Средний чек · период', subtitle: periodSub, value: `${fmt(avgCheck)} ₽`, valueColor: '#A78BFA', rows: [{ label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6' }, { label: 'Чеков', value: String(checksCount), color: '#8B5CF6' }] }) },
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {cards.map(k => (
              <button key={k.label} onClick={k.onClick} className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', textAlign: 'left', border: `1px solid ${k.color}33`, cursor: 'pointer', color: 'var(--on-surface)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${k.color}, transparent 75%)` }} />
                <p style={{ fontSize: 21, fontWeight: 900, color: k.color, margin: '0 0 4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{k.label}</p>
                  {typeof k.delta === 'number' && <DeltaBadge delta={k.delta} />}
                </div>
              </button>
            ))}
          </div>
        )
      })()}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {([['revenue', 'По дням'], ['products', 'Топ товары'], ['payments', 'Платежи']] as [string, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k as any)} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: subTab === k ? '#8B5CF6' : 'var(--on-surface-variant)', borderBottom: subTab === k ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {/* Revenue bar chart */}
      {subTab === 'revenue' && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Выручка по дням · {format(new Date(from), 'd MMM', { locale: ru })} — {format(new Date(to), 'd MMM yyyy', { locale: ru })}</span>
          {revRows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет данных</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {revRows.map((d: any) => {
                const rev = parseNum(d.revenue)
                const pct = maxDayRev > 0 ? (rev / maxDayRev) * 100 : 0
                let dateLabel = d.date
                try { dateLabel = format(new Date(d.date), 'd MMM', { locale: ru }) } catch {}
                return (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', width: 50, flexShrink: 0, textAlign: 'right' }}>{dateLabel}</span>
                    <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)', borderRadius: 6, transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, width: 80, textAlign: 'right', flexShrink: 0 }}>{fmt(rev)} ₽</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Summary table */}
          <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Валовая выручка', `${fmt(totalRevenue)} ₽`, false],
              ['Себестоимость', `− ${fmt(totalCogs)} ₽`, false],
              ['Операционные расходы', `− ${fmt(totalExpenses)} ₽`, false],
              ['Эквайринг (потери)', `− ${fmt(acquiring)} ₽`, false],
              ['Прибыль', `${fmt(profit)} ₽`, true],
            ].map(([k, v, highlight]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', background: highlight ? 'rgba(16,185,129,0.04)' : 'transparent', borderRadius: highlight ? 8 : 0, paddingLeft: highlight ? 8 : 0, paddingRight: highlight ? 8 : 0 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: highlight ? '#10B981' : 'var(--on-surface)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top products */}
      {subTab === 'products' && (
        <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...LBL, margin: 0 }}>Топ товары</span>
            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{fmt(totalProdRev)} ₽</span>
          </div>
          {products.length === 0 ? <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет данных</p> : products.map((p: any, i: number) => {
            const abcColor = ABC_COLORS[p.abc] ?? '#94A3B8'
            const barPct = totalProdRev > 0 ? (parseNum(p.totalRev) / totalProdRev) * 100 : 0
            return (
              <button key={p.itemId ?? i} onClick={() => setOpenItem(p)} style={{ width: '100%', textAlign: 'left', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 12, alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 18, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: `${abcColor}22`, color: abcColor, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{p.abc}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: abcColor, borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt(parseNum(p.totalRev))} ₽</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{parseNum(p.totalQty).toFixed(0)} шт</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Payments breakdown */}
      {subTab === 'payments' && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Способы оплаты</span>
          {payBreakdown.length === 0 ? <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет данных</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const totalPay = payBreakdown.reduce((s: number, p: any) => s + parseNum(p.total), 0)
                return payBreakdown.map((p: any) => {
                  const pct = totalPay > 0 ? (parseNum(p.total) / totalPay) * 100 : 0
                  const color = PAY_COLORS[p.method] ?? '#94A3B8'
                  return (
                    <div key={p.method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{payLabel(p.method)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(parseNum(p.total))} ₽ · {pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}

      {metricModal && <MetricDetailModal title={metricModal.title} subtitle={metricModal.subtitle} value={metricModal.value} valueColor={metricModal.valueColor} rows={metricModal.rows} onClose={() => setMetricModal(null)} />}
      {openItem && <ItemDetailModal item={openItem} totalRev={totalProdRev} onClose={() => setOpenItem(null)} />}
    </div>
  )
}

// ─── Tab: Продукты (ABC) ──────────────────────────────────────────────────────
function ProductsTab({ products, from, to }: { products: any; from: string; to: string }) {
  const [openItem, setOpenItem] = useState<any | null>(null)
  const { data: prevProd } = useQuery({
    queryKey: ['analytics', 'products', from, to, 'prev'],
    queryFn: () => { const p = prevPeriodRange(from, to); return api.get<any>(`/analytics/products?from=${p.from}&to=${p.to}`) },
    enabled: !!from && !!to,
  })
  const rows: any[] = products?.products ?? []
  const totalRev: number = parseNum(products?.totalRev)
  const revDelta = pctDelta(totalRev, parseNum(prevProd?.totalRev))
  const exportCsv = () => downloadCsv(`bar_${from}_${to}.csv`, ['Позиция', 'Категория', 'Кол-во', 'Выручка', 'Доля %', 'ABC'],
    rows.map((r: any) => [r.name ?? '—', r.category ?? 'Прочее', parseNum(r.totalQty), parseNum(r.totalRev), r.share ?? 0, r.abc ?? 'C']))

  if (!products) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><Skeleton h={70} /><Skeleton h={56} /><Skeleton h={260} /></div>

  const catMap: Record<string, number> = {}
  rows.forEach((r: any) => {
    const cat = r.category ?? 'Прочее'
    catMap[cat] = (catMap[cat] ?? 0) + parseNum(r.totalRev)
  })
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const catMax = cats[0]?.[1] ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="glass-l2" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <span style={{ ...LBL, margin: 0 }}>Выручка бара за период</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#4cd7f6', margin: 0, lineHeight: 1 }}>{fmt(totalRev)} ₽</p>
            <DeltaBadge delta={revDelta} />
          </div>
        </div>
        <ExportBtn onClick={exportCsv} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {['A', 'B', 'C'].map(l => {
          const desc = l === 'A' ? '0–80% выручки' : l === 'B' ? '80–95%' : '95–100%'
          return (
            <div key={l} className="glass-l2" style={{ flex: 1, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${ABC_COLORS[l]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: ABC_COLORS[l] }}>{l}</div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Класс {l}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0 }}>{desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ ...LBL, margin: 0 }}>ABC-анализ позиций</span>
        </div>
        {rows.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет данных</p>
        ) : rows.map((item: any, i: number) => (
          <button key={item.itemId ?? i} onClick={() => setOpenItem(item)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', width: 20, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name ?? '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', width: 50, textAlign: 'right' }}>{item.share ?? '0'}%</span>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: `${ABC_COLORS[item.abc ?? 'C']}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: ABC_COLORS[item.abc ?? 'C'] }}>{item.abc ?? 'C'}</div>
          </button>
        ))}
      </div>

      {cats.length > 0 && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>По категориям</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cats.map(([cat, rev]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', width: 80, flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(rev / catMax) * 100}%`, background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)', borderRadius: 9999 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, width: 80, textAlign: 'right', flexShrink: 0 }}>{fmt(rev)} ₽</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {openItem && <ItemDetailModal item={openItem} totalRev={totalRev} onClose={() => setOpenItem(null)} />}
    </div>
  )
}

// Список игроков сегмента (клик по сегменту) — шторка со списком, тап → карточка.
function SegmentMembersSheet({ seg, onClose, onPlayer }: { seg: { key: string; label: string }; onClose: () => void; onPlayer: (p: any) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'segment-members', seg.key],
    queryFn: () => api.get<any>(`/analytics/segment-members?segment=${seg.key}`),
  })
  const players: any[] = data?.players ?? []
  return (
    <Sheet title={`Сегмент · ${seg.label}`} subtitle={`${players.length} игроков`} onClose={onClose}>
      {isLoading ? <StateView state="loading" /> : players.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', textAlign: 'center', padding: '24px 0' }}>Нет игроков в сегменте</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {players.map((p, i) => {
            const tier = p.clientTier ?? 'null'
            return (
              <button key={p.playerId ?? i} onClick={() => onPlayer(p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: 'var(--on-surface)', textAlign: 'left' }}>
                {p.photoUrl
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.photoUrl} alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', flexShrink: 0 }}>{(p.nickname ?? '??').slice(0, 2).toUpperCase()}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nickname ?? 'Игрок'}</p>
                  <p style={{ fontSize: 11, color: TIER_COLORS[tier] ?? 'var(--on-surface-variant)', margin: 0 }}>{TIER_LABELS[tier] ?? tier}{p.visits ? ` · ${p.visits} визитов` : ''}</p>
                </div>
                {parseNum(p.total) > 0 && <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{fmt(parseNum(p.total))} ₽</span>}
                <Icon name="chevron_right" size={14} color="rgba(204,195,216,0.4)" />
              </button>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

// ─── Tab: Игроки ──────────────────────────────────────────────────────────────
function PlayersTab({ clients }: { clients: any }) {
  const segments    = clients?.segments ?? { new: 0, active: 0, sleeping: 0 }
  const tierDist: any[]    = clients?.tierDist ?? []
  const topSpenders: any[] = clients?.topSpenders ?? []
  const guestSales = clients?.guestSales ?? { total: 0, visits: 0 }
  const retentionRate: number = clients?.retentionRate ?? 0
  const totalClients: number  = clients?.total ?? 0
  const newThisPeriod: number = clients?.newThisPeriod ?? 0
  const [metricModal, setMetricModal] = useState<null | { title: string; subtitle?: string; value: string; valueColor?: string; rows: { label: string; value: string; color?: string }[] }>(null)
  const [openPlayer, setOpenPlayer] = useState<any | null>(null)
  const [segOpen, setSegOpen] = useState<null | { key: 'new' | 'active' | 'sleeping'; label: string }>(null)

  if (!clients) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCards n={3} /><Skeleton h={120} /><Skeleton h={220} /></div>

  const segTotal = segments.new + segments.active + segments.sleeping || 1
  const segData = [
    { key: 'new' as const,      label: 'Новые',    value: segments.new,      color: '#10B981', icon: 'person_add', desc: 'Регистрация < 30 дней' },
    { key: 'active' as const,   label: 'Активные', value: segments.active,   color: '#8B5CF6', icon: 'people',     desc: 'Визит < 14 дней' },
    { key: 'sleeping' as const, label: 'Спящие',   value: segments.sleeping, color: '#F59E0B', icon: 'bedtime',    desc: 'Последний > 14 дней' },
  ]
  const tierTotal = tierDist.reduce((s: number, t: any) => s + (t.count ?? 0), 0) || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <KpiCard label="Всего игроков" value={String(totalClients)} sub="зарегистрировано" icon="group" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" onClick={() => setMetricModal({ title: 'Всего игроков', subtitle: 'клиентская база', value: String(totalClients), valueColor: '#8B5CF6', rows: [{ label: 'Новые за период', value: String(newThisPeriod), color: '#10B981' }, { label: 'Активные (14д)', value: String(segments.active), color: '#8B5CF6' }, { label: 'Спящие', value: String(segments.sleeping), color: '#F59E0B' }] })} />
        <KpiCard label="Новые за период" value={String(newThisPeriod)} sub="регистрации в периоде" icon="person_add" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" onClick={() => setMetricModal({ title: 'Новые за период', subtitle: 'регистрации в выбранном периоде', value: String(newThisPeriod), valueColor: '#10B981', rows: [{ label: 'Всего игроков', value: String(totalClients) }, { label: 'Сегмент «Новые»', value: String(segments.new), color: '#10B981' }] })} />
        <KpiCard label="Retention" value={`${retentionRate}%`} sub="повторные визиты 14д" icon="repeat" iconColor="#4cd7f6" iconBg="rgba(76,215,246,0.1)" onClick={() => setMetricModal({ title: 'Retention', subtitle: 'повторные визиты за 14 дней', value: `${retentionRate}%`, valueColor: '#4cd7f6', rows: [{ label: 'Активные (14д)', value: String(segments.active), color: '#8B5CF6' }, { label: 'Спящие', value: String(segments.sleeping), color: '#F59E0B' }] })} />
      </div>

      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <span style={LBL}>Сегменты</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {segData.map(seg => (
            <button key={seg.label} onClick={() => setSegOpen({ key: seg.key, label: seg.label })} style={{ textAlign: 'left', padding: 14, borderRadius: 12, background: `${seg.color}10`, border: `1px solid ${seg.color}22`, cursor: 'pointer', color: 'var(--on-surface)' }}>
              <Icon name={seg.icon} size={18} color={seg.color} />
              <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--on-surface)', margin: '8px 0 2px', lineHeight: 1 }}>{seg.value}</p>
              <p style={{ fontSize: 11, color: seg.color, fontWeight: 600, margin: '0 0 2px' }}>{seg.label}</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '0 0 8px' }}>{seg.desc}</p>
              <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', width: `${(seg.value / segTotal) * 100}%`, background: seg.color, borderRadius: 9999 }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 16 }} className="dash-row">
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Уровни</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tierDist.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center' }}>Нет данных</p> : tierDist.map((t: any) => {
              const tier = t.tier ?? 'null'
              const pct = Math.round((t.count / tierTotal) * 100)
              const color = TIER_COLORS[tier] ?? 'rgba(204,195,216,0.4)'
              return (
                <div key={tier}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{TIER_LABELS[tier] ?? tier}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{t.count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 9999, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Топ игроки за период</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topSpenders.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center' }}>Нет данных</p> : topSpenders.slice(0, 8).map((sp: any, i: number) => {
              const tier = sp.clientTier ?? 'null'
              return (
                <button key={sp.playerId ?? i} onClick={() => setOpenPlayer(sp)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
                  {sp.photoUrl
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={sp.photoUrl} alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 30, height: 30, borderRadius: '50%', background: `rgba(139,92,246,${0.25 - i * 0.02})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', flexShrink: 0 }}>
                        {(sp.nickname ?? '??').slice(0, 2).toUpperCase()}
                      </div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.nickname ?? 'Гость'}</p>
                    <p style={{ fontSize: 11, color: TIER_COLORS[tier] ?? 'var(--on-surface-variant)', margin: 0 }}>{TIER_LABELS[tier] ?? tier} · {sp.visits ?? 0} визитов</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{fmt(parseNum(sp.total))} ₽</p>
                </button>
              )
            })}
            {/* Обезличенные продажи — отдельной строкой, НЕ в рейтинге игроков. */}
            {parseNum(guestSales.total) > 0 && (
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', marginTop: 4 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(148,163,184,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="person" size={16} color="#94A3B8" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--on-surface-variant)' }}>Без игрока</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>обезличенные продажи · {guestSales.visits ?? 0} чеков</p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--on-surface-variant)', margin: 0, flexShrink: 0 }}>{fmt(parseNum(guestSales.total))} ₽</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {metricModal && <MetricDetailModal title={metricModal.title} subtitle={metricModal.subtitle} value={metricModal.value} valueColor={metricModal.valueColor} rows={metricModal.rows} onClose={() => setMetricModal(null)} />}
      {segOpen && <SegmentMembersSheet seg={segOpen} onClose={() => setSegOpen(null)} onPlayer={(p) => { setSegOpen(null); setOpenPlayer(p) }} />}
      {openPlayer && <PlayerDetailModal player={openPlayer} onClose={() => setOpenPlayer(null)} />}
    </div>
  )
}

// ─── Tab: Чеки ────────────────────────────────────────────────────────────────
function PayChips({ payments }: { payments: { method: string; amount: number | string }[] }) {
  if (!payments?.length) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {payments.map((p, i) => {
        const color = PAY_COLORS[p.method] ?? '#94A3B8'
        return (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: `${color}1f`, color, whiteSpace: 'nowrap' }}>
            {payLabel(p.method)}
          </span>
        )
      })}
    </div>
  )
}

function CheckDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'check', id],
    queryFn: () => api.get<any>(`/analytics/checks/${id}`),
  })

  const check = data?.check
  const items: any[] = data?.items ?? []
  const payments: any[] = data?.payments ?? []
  const discounts: any[] = data?.discounts ?? []
  const refunds: any[] = data?.refunds ?? []
  const player = data?.player
  const staff = data?.staff
  const guestName = data?.guestName

  const whoTitle = player ? (player.nickname || player.fullName || 'Игрок') : (guestName || 'Гость')

  return (
    <Sheet title={`Чек · ${check ? fmtMsk(check.createdAt) : ''}`} subtitle={check ? bizDayLabel(format(new Date(check.createdAt), 'yyyy-MM-dd')) : undefined} onClose={onClose}>
      {isLoading && <StateView state="loading" />}
      {isError && <p style={{ fontSize: 13, color: '#F43F5E', textAlign: 'center', padding: '20px 0' }}>Не удалось загрузить чек</p>}
      {check && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Кто / кассир */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Чей чек</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{whoTitle}</span>
            </div>
            {player?.phone && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Телефон</span>
                <span style={{ fontSize: 12 }}>{player.phone}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Кассир</span>
              <span style={{ fontSize: 12 }}>{staff?.nickname ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Открыт / закрыт</span>
              <span style={{ fontSize: 12 }}>{fmtMsk(check.createdAt)} → {check.closedAt ? fmtMsk(check.closedAt) : '—'}</span>
            </div>
          </div>

          {/* Состав */}
          <div>
            <span style={LBL}>Состав чека</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.length === 0 ? <p style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Нет позиций</p> : items.map((it, i) => (
                <div key={it.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{it.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', width: 56, textAlign: 'right', flexShrink: 0 }}>× {parseNum(it.quantity)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, width: 84, textAlign: 'right', flexShrink: 0 }}>{fmt(parseNum(it.lineTotal))} ₽</span>
                </div>
              ))}
            </div>
          </div>

          {/* Скидки (детально) / бонусы / сертификат */}
          {(discounts.length > 0 || parseNum(check.discountTotal) > 0 || parseNum(check.bonusUsed) > 0 || parseNum(check.certificateUsed) > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {discounts.length > 0 ? (
                <>
                  <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Скидки</span>
                  {discounts.map((d) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {d.name}
                        <span style={{ marginLeft: 6, opacity: 0.7 }}>{d.type === 'percent' ? `${parseNum(d.value)}%` : ''}{d.target === 'item' ? ' · позиция' : ''}</span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B', flexShrink: 0 }}>− {fmt(parseNum(d.amount))} ₽</span>
                    </div>
                  ))}
                </>
              ) : parseNum(check.discountTotal) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Скидка</span><span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>− {fmt(parseNum(check.discountTotal))} ₽</span></div>
              )}
              {parseNum(check.bonusUsed) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Бонусы</span><span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>− {fmt(parseNum(check.bonusUsed))} ₽</span></div>}
              {parseNum(check.certificateUsed) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Сертификат</span><span style={{ fontSize: 13, fontWeight: 700, color: '#14B8A6' }}>− {fmt(parseNum(check.certificateUsed))} ₽</span></div>}
            </div>
          )}

          {/* Списание на персонал — товарная сумма и себестоимость («как бы оплачено») */}
          {data?.staffComp && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="badge" size={14} color="#F59E0B" /> Списание на персонал
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Товарная сумма</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(parseNum(data.retailTotal))} ₽</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Себестоимость («оплачено»)</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B' }}>{fmt(parseNum(data.costTotal))} ₽</span>
              </div>
            </div>
          )}

          {/* Итог + оплата */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Итого</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#A78BFA' }}>{fmt(parseNum(check.totalAmount))} ₽</span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Как оплачено</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {payments.length === 0 ? <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>—</span> : payments.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{payLabel(p.method)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(parseNum(p.amount))} ₽</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Возвраты */}
          {refunds.length > 0 && (
            <div>
              <span style={LBL}>Возвраты</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {refunds.map((r, i) => (
                  <div key={r.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,63,94,0.08)' }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{r.reason || 'Возврат'}</p>
                      <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{fmtMskDate(r.createdAt)}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F43F5E' }}>− {fmt(parseNum(r.totalAmount))} ₽</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

function ChecksTab({ from, to }: { from: string; to: string }) {
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'checks', from, to],
    queryFn: () => api.get<any>(`/analytics/checks?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })

  const summary: NetBreak | undefined = data?.summary
  const checks: any[] = data?.checks ?? []
  const exportCsv = () => downloadCsv(`checks_${from}_${to}.csv`, ['Время', 'Клиент', 'Кассир', 'Позиций', 'Сумма', 'Оплата'],
    checks.map((c: any) => [fmtMsk(c.createdAt), c.guestName || 'Гость', c.staffNickname || '—', c.itemCount ?? 0, parseNum(c.totalAmount), (c.payments ?? []).map((p: any) => `${payLabel(p.method)} ${fmt(parseNum(p.amount))}`).join(' + ')]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Summary */}
      {summary && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Итог за период</span>
          <NetBreakdownRows b={summary} />
        </div>
      )}

      {/* Checks list */}
      <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ ...LBL, margin: 0 }}>Чеки</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{checks.length}</span>
            {checks.length > 0 && <ExportBtn onClick={exportCsv} />}
          </div>
        </div>
        {isLoading ? <StateView state="loading" />
          : isError ? <StateView state="error" description="Не удалось загрузить чеки." action={{ label: 'Повторить', onClick: () => refetch() }} />
          : checks.length === 0 ? <p style={{ padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет чеков за период</p>
          : checks.map(c => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'transparent', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer', color: 'var(--on-surface)' }}
            >
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 44, flexShrink: 0 }}>{fmtMsk(c.createdAt)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.guestName || 'Гость'}</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 5px' }}>{c.staffNickname || '—'} · {c.itemCount ?? 0} поз.</p>
                <PayChips payments={c.payments ?? []} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{fmt(parseNum(c.totalAmount))} ₽</span>
            </button>
          ))}
      </div>

      {openId && <CheckDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ─── Tab: Тарифы (выручка/количество по тарифам + по типам вечеров) ───────────
function TariffsTab({ from, to }: { from: string; to: string }) {
  // Кликабельный тариф → раскрываем строку с деталями (count/revenue).
  const [openTariff, setOpenTariff] = useState<any | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'tariffs', from, to],
    queryFn: () => api.get<any>(`/analytics/tariffs?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })
  const { data: prevT } = useQuery({
    queryKey: ['analytics', 'tariffs', from, to, 'prev'],
    queryFn: () => { const p = prevPeriodRange(from, to); return api.get<any>(`/analytics/tariffs?from=${p.from}&to=${p.to}`) },
    enabled: !!from && !!to,
  })

  const byTariff: any[] = data?.byTariff ?? []
  const byEvening: any[] = data?.byEvening ?? []
  const gameEvenings: any[] = data?.gameEvenings ?? []
  const gameEveningsTotal: number = parseNum(data?.gameEveningsTotal)
  const totalCount: number = parseNum(data?.total?.count)
  const totalRevenue: number = parseNum(data?.total?.revenue)
  const revDelta = pctDelta(totalRevenue, parseNum(prevT?.total?.revenue))
  const maxTariffRev = byTariff.length ? Math.max(...byTariff.map((t: any) => parseNum(t.revenue))) : 1
  const maxEveningRev = byEvening.length ? Math.max(...byEvening.map((e: any) => parseNum(e.revenue))) : 1
  const exportCsv = () => downloadCsv(`tariffs_${from}_${to}.csv`, ['Тариф', 'Кол-во', 'Выручка'], byTariff.map((t: any) => [t.name ?? '—', parseNum(t.count), parseNum(t.revenue)]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isLoading ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCards n={2} /><Skeleton h={220} /></div>
      : isError ? <StateView state="error" description="Не удалось загрузить аналитику тарифов." action={{ label: 'Повторить', onClick: () => refetch() }} />
      : (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            <div className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', border: '1px solid #8B5CF633' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #8B5CF6, transparent 75%)' }} />
              <p style={{ fontSize: 21, fontWeight: 900, color: '#8B5CF6', margin: '0 0 4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{totalCount}</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Тарифов продано</p>
            </div>
            <div className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', border: '1px solid #4cd7f633' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #4cd7f6, transparent 75%)' }} />
              <p style={{ fontSize: 21, fontWeight: 900, color: '#4cd7f6', margin: '0 0 4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalRevenue)} ₽</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Выручка по тарифам</p>
                <DeltaBadge delta={revDelta} />
              </div>
            </div>
          </div>

          {/* Игровые вечера — по типам. Вечер засчитан, только если в смене было
              ≥3 чеков с тарифом игрока (Резидент/Гость/Студент). */}
          <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ ...LBL, margin: 0 }}>Игровые вечера</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#A78BFA' }}>
                <Icon name="casino" size={16} color="#A78BFA" /> {gameEveningsTotal}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {gameEvenings.map((e: any) => (
                <div key={e.eveningKey} style={{ padding: '12px 14px', borderRadius: 12, background: e.count > 0 ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.04)' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: e.count > 0 ? '#A78BFA' : 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1 }}>{e.count}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '12px 0 0', lineHeight: 1.4 }}>
              Вечер засчитан, если в смене было не менее 3 чеков с тарифом «Резидент», «Гость» или «Студент» — по факту игры, а не по типу при открытии смены.
            </p>
          </div>

          {/* По тарифам — кликабельные строки */}
          <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...LBL, margin: 0 }}>По тарифам</span>
              <ExportBtn onClick={exportCsv} />
            </div>
            {byTariff.length === 0 ? <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет данных за период</p>
              : byTariff.map((t: any, i: number) => {
                const rev = parseNum(t.revenue)
                const pct = maxTariffRev > 0 ? (rev / maxTariffRev) * 100 : 0
                const isOpen = openTariff?.tariffId === t.tariffId
                return (
                  <div key={t.tariffId ?? i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <button
                      onClick={() => setOpenTariff(isOpen ? null : t)}
                      style={{ width: '100%', textAlign: 'left', padding: '12px 18px', display: 'flex', gap: 12, alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}
                    >
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 18, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)', borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt(rev)} ₽</p>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{parseNum(t.count).toFixed(0)} шт</p>
                      </div>
                      <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={18} color="var(--on-surface-variant)" />
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 18px 14px 48px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--on-surface-variant)' }}>Количество</span>
                          <span style={{ fontWeight: 700 }}>{parseNum(t.count).toFixed(0)} шт</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--on-surface-variant)' }}>Выручка</span>
                          <span style={{ fontWeight: 700, color: '#4cd7f6' }}>{fmt(rev)} ₽</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--on-surface-variant)' }}>Средняя цена</span>
                          <span style={{ fontWeight: 700 }}>{fmt(parseNum(t.count) > 0 ? rev / parseNum(t.count) : 0)} ₽</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          {/* По типам вечеров */}
          <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
            <span style={LBL}>По типам вечеров</span>
            {byEvening.length === 0 ? <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', textAlign: 'center', padding: '12px 0' }}>Нет данных</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {byEvening.map((e: any, i: number) => {
                    const rev = parseNum(e.revenue)
                    const pct = maxEveningRev > 0 ? (rev / maxEveningRev) * 100 : 0
                    return (
                      <div key={e.eveningKey ?? i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{e.label ?? e.eveningKey}</span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(rev)} ₽ · {parseNum(e.count).toFixed(0)} шт</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #10B981, #4cd7f6)', borderRadius: 4 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// ─── Раздел «Финансы»: Отчёт (P&L + по дням + товары/платежи) и Чеки ───────────
// Единый период приходит сверху (глобальный селектор), локальных фильтров нет.
function FinanceTab({ from, to }: { from: string; to: string }) {
  const [sub, setSub] = useState<'report' | 'checks'>('report')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', alignSelf: 'flex-start' }}>
        {([['report', 'Отчёт'], ['checks', 'Чеки']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} style={{ padding: '7px 16px', borderRadius: 9999, border: 'none', background: sub === k ? 'rgba(139,92,246,0.25)' : 'transparent', color: sub === k ? '#A78BFA' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>
      {sub === 'report' ? <ReportsTab from={from} to={to} /> : <ChecksTab from={from} to={to} />}
    </div>
  )
}

// ─── Tab: Персонал (списания на сотрудников) ───────────────────────────────────
function StaffTab({ staff, periodText, from, to }: { staff: any; periodText: string; from: string; to: string }) {
  const [openCheckId, setOpenCheckId] = useState<string | null>(null)
  if (!staff) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCards n={3} /><Skeleton h={220} /></div>
  const rows: any[] = staff?.staff ?? []
  const transactions: any[] = staff?.transactions ?? []
  const totals = staff?.totals ?? { retail: 0, cost: 0, checks: 0 }
  const exportCsv = () => downloadCsv(`staff_${from}_${to}.csv`, ['Сотрудник', 'Чеков', 'Товарная сумма', 'Себестоимость'],
    rows.map((r: any) => [r.nickname ?? '—', r.checksCount ?? 0, parseNum(r.retail), parseNum(r.cost)]))
  const maxCost = rows.length ? Math.max(...rows.map((r: any) => parseNum(r.cost))) : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <div className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '16px 18px', border: '1px solid #4cd7f633' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #4cd7f6, transparent 75%)' }} />
          <p style={{ fontSize: 22, fontWeight: 900, color: '#4cd7f6', margin: '0 0 4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(parseNum(totals.retail))} ₽</p>
          <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Товарная сумма</p>
        </div>
        <div className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '16px 18px', border: '1px solid #F59E0B33' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #F59E0B, transparent 75%)' }} />
          <p style={{ fontSize: 22, fontWeight: 900, color: '#F59E0B', margin: '0 0 4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(parseNum(totals.cost))} ₽</p>
          <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Себестоимость («оплачено»)</p>
        </div>
        <div className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '16px 18px', border: '1px solid #8B5CF633' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #8B5CF6, transparent 75%)' }} />
          <p style={{ fontSize: 22, fontWeight: 900, color: '#8B5CF6', margin: '0 0 4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{totals.checks ?? 0}</p>
          <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Списаний</p>
        </div>
      </div>

      <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ ...LBL, margin: 0 }}>Списания на персонал — {periodText}</span>
          {rows.length > 0 && <ExportBtn onClick={exportCsv} />}
        </div>
        {rows.length === 0 ? (
          <p style={{ padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>Списаний на персонал за период нет</p>
        ) : rows.map((r: any, i: number) => (
          <div key={r.staffId ?? i} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(245,158,11,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#F59E0B', flexShrink: 0 }}>{(r.nickname ?? '??').slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nickname ?? '—'}</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{r.checksCount ?? 0} списаний · товар {fmt(parseNum(r.retail))} ₽</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#F59E0B', margin: 0 }}>{fmt(parseNum(r.cost))} ₽</p>
                <p style={{ fontSize: 9, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>себестоимость</p>
              </div>
            </div>
            <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(parseNum(r.cost) / maxCost) * 100}%`, background: '#F59E0B', borderRadius: 9999 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Транзакции (каждое списание) — кликабельны → состав чека с розницей и себестоимостью */}
      {transactions.length > 0 && (
        <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ ...LBL, margin: 0 }}>Транзакции персонала</span>
          </div>
          {transactions.map((t: any) => (
            <button key={t.id} onClick={() => setOpenCheckId(t.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', flexShrink: 0 }}>{fmtMskDate(t.createdAt)} {fmtMsk(t.createdAt)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nickname ?? '—'}</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>товар {fmt(parseNum(t.retail))} ₽</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B', margin: 0 }}>{fmt(parseNum(t.cost))} ₽</p>
                <p style={{ fontSize: 9, color: 'var(--on-surface-variant)', margin: 0 }}>себест.</p>
              </div>
              <Icon name="chevron_right" size={14} color="rgba(204,195,216,0.4)" />
            </button>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 4px', lineHeight: 1.5 }}>
        Это бесплатные чеки (списание на персонал/владельца): в выручку они идут как 0&nbsp;₽, остаток списан. Здесь — товарная сумма и себестоимость, которую сотрудник «как бы оплатил».
      </p>
      {openCheckId && <CheckDetailModal id={openCheckId} onClose={() => setOpenCheckId(null)} />}
    </div>
  )
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('overview')
  const period = usePeriod()
  const qc = useQueryClient()

  // Глубокая ссылка на вкладку: /dashboard?tab=expenses → активируем вкладку.
  // Читаем window.location в useEffect (без next/navigation useSearchParams,
  // чтобы не требовать Suspense-границу).
  useEffect(() => {
    const TAB_KEYS: MainTab[] = ['overview', 'finance', 'expenses', 'games', 'bar', 'players', 'staff']
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && (TAB_KEYS as string[]).includes(tab)) setActiveTab(tab as MainTab)
  }, [])

  // Свайп для обновления (как на экране кассы) — перезагружает все витрины аналитики.
  const onRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['analytics'] })
  }, [qc])

  // Телеметрия: смена периода (и первичная отрисовка) — какой период смотрят.
  useEffect(() => { track('period_change', { preset: period.preset, from: period.from, to: period.to }) }, [period.preset, period.from, period.to])

  // Обзор за выбранный период (финансовое здоровье + способы оплаты за период).
  const { data: overview, isError: ovError, refetch: refetchOv } = useQuery({
    queryKey: ['analytics', 'overview', period.from, period.to],
    queryFn: () => api.get<any>(`/analytics/overview?from=${period.from}&to=${period.to}`),
    refetchInterval: 60000,
    enabled: activeTab === 'overview',
  })
  // Товары (Бар) — за выбранный период.
  const { data: products } = useQuery({
    queryKey: ['analytics', 'products', period.from, period.to],
    queryFn: () => api.get<any>(`/analytics/products?from=${period.from}&to=${period.to}`),
    enabled: activeTab === 'bar',
  })
  const { data: clients } = useQuery({
    queryKey: ['analytics', 'clients', period.from, period.to],
    queryFn: () => api.get<any>(`/analytics/clients?from=${period.from}&to=${period.to}`),
    enabled: activeTab === 'players',
  })
  const { data: staff } = useQuery({
    queryKey: ['analytics', 'staff', period.from, period.to],
    queryFn: () => api.get<any>(`/analytics/staff?from=${period.from}&to=${period.to}`),
    enabled: activeTab === 'staff',
  })

  const TABS = [
    { key: 'overview' as MainTab, label: 'Обзор',          icon: 'dashboard' },
    { key: 'finance'  as MainTab, label: 'Финансы',        icon: 'payments' },
    { key: 'expenses' as MainTab, label: 'Расходы',        icon: 'receipt_long' },
    { key: 'games'    as MainTab, label: 'Игры и тарифы',  icon: 'confirmation_number' },
    { key: 'bar'      as MainTab, label: 'Бар',            icon: 'inventory_2' },
    { key: 'players'  as MainTab, label: 'Игроки',         icon: 'group' },
    { key: 'staff'    as MainTab, label: 'Персонал',       icon: 'badge' },
  ]

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Header (фикс. шапка, контент скроллится отдельно — нужно для свайп-обновления) */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0, zIndex: 10, background: 'rgba(21,18,27,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: 'var(--on-surface)' }}>Аналитика</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
              {format(new Date(), 'd MMMM yyyy', { locale: ru })}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <PeriodSelector p={period} />
            <button onClick={() => { track('export_pdf', { section: activeTab }); if (typeof window !== 'undefined') window.print() }} title="Печать / сохранить в PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="upload_file" size={14} /> PDF
            </button>
          </div>
        </div>
        {/* Tabs — общий Chip; скролл внутри таб-бара */}
        <div style={{
          display: 'flex', gap: 8, padding: '4px 0 12px',
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch' as any,
        }}>
          {TABS.map(tab => {
            const active = activeTab === tab.key
            return (
              <Chip key={tab.key} active={active} onClick={() => { setActiveTab(tab.key); track('section_open', { section: tab.key }) }} icon={tab.icon}>
                <span className="dash-tab-label">{tab.label}</span>
              </Chip>
            )
          })}
        </div>
      </div>

      {/* Content — со свайпом для обновления (потяните вниз, как на экране кассы) */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PullToRefreshContainer onRefresh={onRefresh}>
          <div style={{ padding: '16px clamp(16px, 2vw, 24px) var(--bottom-nav-clear)', width: '100%', maxWidth: 'var(--content-wide)', margin: '0 auto', boxSizing: 'border-box' }}>
            {activeTab === 'overview'  && (overview ? <OverviewTab overview={overview} periodText={period.label} /> : ovError ? <StateView state="error" description="Не удалось загрузить аналитику." action={{ label: 'Повторить', onClick: () => refetchOv() }} /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}><Skeleton h={156} /><SkeletonCards /></div>)}
            {activeTab === 'finance'   && <FinanceTab from={period.from} to={period.to} />}
            {activeTab === 'expenses'  && <ExpensesTab from={period.from} to={period.to} />}
            {activeTab === 'games'     && <TariffsTab from={period.from} to={period.to} />}
            {activeTab === 'bar'       && <ProductsTab products={products} from={period.from} to={period.to} />}
            {activeTab === 'players'   && <PlayersTab clients={clients} />}
            {activeTab === 'staff'     && <StaffTab staff={staff} periodText={period.label} from={period.from} to={period.to} />}
          </div>
        </PullToRefreshContainer>
      </div>

      <style>{`
        @media (max-width: 768px) { .dash-row { grid-template-columns: 1fr !important; } }
        /* Скрываем скроллбар у таб-бара */
        div::-webkit-scrollbar { display: none; }
        .ti-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04)); background-size: 200% 100%; animation: ti-shimmer 1.3s ease-in-out infinite; }
        @keyframes ti-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
    </div>
  )
}
