'use client'
import { useState } from 'react'
import { Icon } from '@/components/Icon'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useCountUp } from '@/hooks/useCountUp'
import { StateView } from '@/components/StateView'

// ─── Constants ────────────────────────────────────────────────────────────────
type MainTab = 'today' | 'overview' | 'reports' | 'products' | 'players' | 'checks'
type ReportRange = '7d' | '30d' | 'month' | 'custom'

const PAY_COLORS: Record<string, string> = {
  cash: '#10B981', card: '#3B82F6', transfer: '#8B5CF6',
  bonus: '#F59E0B', deposit: '#06B6D4', certificate: '#14B8A6', debt: '#F43F5E',
}
const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'Перевод',
  bonus: 'Бонусы', deposit: 'Депозит', certificate: 'Сертификат', debt: 'Долг',
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
function getRange(range: ReportRange, from: string, to: string): [string, string] {
  const now = new Date()
  if (range === '7d') return [format(subDays(now, 6), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')]
  if (range === '30d') return [format(subDays(now, 29), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')]
  if (range === 'month') return [format(startOfMonth(now), 'yyyy-MM-dd'), format(endOfMonth(now), 'yyyy-MM-dd')]
  return [from, to]
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
      style={{ borderRadius: 16, padding: 20, cursor: clickable ? 'pointer' : 'default', position: 'relative', transition: 'transform 0.15s, border-color 0.15s' }}
      onMouseEnter={clickable ? e => { e.currentTarget.style.transform = 'translateY(-2px)' } : undefined}
      onMouseLeave={clickable ? e => { e.currentTarget.style.transform = 'translateY(0)' } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={iconColor} />
        </div>
        {delta !== undefined ? <DeltaBadge delta={delta} /> : clickable ? <Icon name="chevron_right" size={16} color="rgba(204,195,216,0.4)" /> : null}
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', margin: '0 0 4px', color: 'var(--on-surface)', lineHeight: 1 }}>{displayValue}</p>
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px', color: 'var(--on-surface-variant)' }}>{label}</p>
      <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: 0 }}>{sub}</p>
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
          return <div key={p.method} style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, background: PAY_COLORS[p.method] ?? '#8B5CF6' }} title={`${PAY_LABELS[p.method] ?? p.method}: ${pct.toFixed(1)}%`} />
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(p => {
          const pct = total > 0 ? ((parseNum(p.total) / total) * 100).toFixed(0) : '0'
          return (
            <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_COLORS[p.method] ?? '#8B5CF6', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[p.method] ?? p.method}</span>
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
  return (
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
}

// Модалка детализации KPI: показывает раскладку gross→net.
function KpiBreakdownModal({ title, subtitle, b, onClose }: { title: string; subtitle?: string; b: NetBreak; onClose: () => void }) {
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', margin: '0 0 4px', color: '#8B5CF6', lineHeight: 1 }}>{b.checks}</p>
          <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>Чеков</p>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', margin: '0 0 4px', color: '#4cd7f6', lineHeight: 1 }}>{fmt(parseNum(b.avgCheck))} ₽</p>
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
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', marginBottom: 16 }}>
        <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', margin: 0, color: valueColor, lineHeight: 1 }}>{value}</p>
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
            <p style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', margin: '0 0 4px', color: m.color, lineHeight: 1 }}>{m.value}</p>
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
  const total = parseNum(player.total)
  const visits = player.cnt ?? player.visits ?? 0
  const tier = player.clientTier ?? 'null'
  const avg = visits > 0 ? total / visits : 0
  return (
    <Sheet title={player.nickname ?? 'Гость'} subtitle={`${TIER_LABELS[tier] ?? tier}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Потрачено · 30 дней', value: `${fmt(total)} ₽`, color: '#4cd7f6' },
          { label: 'Визитов', value: String(visits), color: '#A78BFA' },
          { label: 'Средний чек', value: `${fmt(avg)} ₽`, color: '#10B981' },
          { label: 'Уровень', value: TIER_LABELS[tier] ?? tier, color: TIER_COLORS[tier] ?? '#94A3B8' },
        ].map(m => (
          <div key={m.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
            <p style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', margin: '0 0 4px', color: m.color, lineHeight: 1 }}>{m.value}</p>
            <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{m.label}</p>
          </div>
        ))}
      </div>
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
        <span style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', color: '#F59E0B' }}>{fmt(commission)} ₽</span>
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
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[p.method] ?? p.method}</span>
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
              <span style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', flexShrink: 0 }}>{fmt(parseNum(c.totalAmount))} ₽</span>
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
function OverviewTab({ dash, revenue }: { dash: any; revenue: any }) {
  const [modal, setModal] = useState<null | { title: string; subtitle?: string; b: NetBreak }>(null)

  const businessDay: string = dash?.businessDay ?? format(new Date(), 'yyyy-MM-dd')
  const netToday: NetBreak | undefined = dash?.netToday
  const netMonth: NetBreak | undefined = dash?.netMonth

  // Заголовочные суммы — ВСЕГДА реальная (валовая) выручка. Детализация
  // gross→net доступна по клику на карточку (модалка-раскладка).
  const dayHeadline   = parseNum(dash?.today?.revenue)
  const dayChecks     = dash?.today?.checks ?? netToday?.checks ?? 0
  const dayAvg        = parseNum(dash?.today?.avgCheck ?? netToday?.avgCheck)
  const monthHeadline = parseNum(dash?.month?.revenue)

  const monthProfit= parseNum(dash?.month?.profit)
  const monthCogs  = parseNum(dash?.month?.cogs)
  const monthExp   = parseNum(dash?.month?.expenses)
  const monthDelta = dash?.month?.delta ?? 0
  const monthRevGross = parseNum(dash?.month?.revenue)
  const revenueRows: any[] = revenue?.revenue ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Month KPIs (clickable) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <KpiCard label="Выручка месяц" rawValue={monthHeadline} sub="последние 30 дней" delta={monthDelta} icon="payments" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" onClick={netMonth ? () => setModal({ title: 'Выручка · месяц', subtitle: 'последние 30 дней · нажмите для раскладки', b: netMonth }) : undefined} />
        <KpiCard label="Прибыль месяц" rawValue={monthProfit} sub={`маржа ${monthRevGross > 0 ? Math.round((monthProfit / monthRevGross) * 100) : 0}%`} icon="trending_up" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" onClick={netMonth ? () => setModal({ title: 'Прибыль · месяц', subtitle: 'последние 30 дней', b: netMonth }) : undefined} />
        <KpiCard label="Себестоимость" rawValue={monthCogs} sub="стоимость товаров" icon="inventory" iconColor="#F59E0B" iconBg="rgba(245,158,11,0.1)" onClick={netMonth ? () => setModal({ title: 'Себестоимость · месяц', subtitle: 'в составе раскладки прибыли', b: netMonth }) : undefined} />
        <KpiCard label="Расходы" rawValue={monthExp} sub="операционные + ЗП" icon="receipt" iconColor="#F43F5E" iconBg="rgba(244,63,94,0.1)" onClick={netMonth ? () => setModal({ title: 'Расходы · месяц', subtitle: 'в составе раскладки прибыли', b: netMonth }) : undefined} />
      </div>

      {/* Day navigator + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }} className="dash-row">
        <div
          className="glass-l2"
          onClick={netToday ? () => setModal({ title: 'Выручка · бизнес-день', subtitle: `${bizDayLabel(businessDay)} · 09:00–06:00`, b: netToday }) : undefined}
          style={{ borderRadius: 16, padding: 20, cursor: netToday ? 'pointer' : 'default' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ ...LBL, margin: 0 }}>Бизнес-день</span>
            {netToday && <Icon name="chevron_right" size={16} color="rgba(204,195,216,0.4)" />}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: '0 0 14px' }}>{bizDayLabel(businessDay)} · 09:00–06:00</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Выручка', value: `${fmt(dayHeadline)} ₽`, color: '#8B5CF6' },
              { label: 'Чеков', value: String(dayChecks), color: '#4cd7f6' },
              { label: 'Средний чек', value: `${fmt(dayAvg)} ₽`, color: '#A78BFA' },
              { label: 'Эквайринг (потери)', value: `${fmt(parseNum(netToday?.commission))} ₽`, color: '#F59E0B' },
            ].map(item => (
              <div key={item.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                <p style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', margin: '0 0 4px', color: item.color, lineHeight: 1 }}>{item.value}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Выручка за 30 дней</span>
          {revenueRows.length > 0 ? (
            <>
              <MiniBarChart data={revenueRows} color="rgba(139,92,246,0.7)" height={80} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(204,195,216,0.4)' }}>{revenueRows[0]?.date?.slice(5) ?? ''}</span>
                <span style={{ fontSize: 10, color: 'rgba(204,195,216,0.4)' }}>{revenueRows[revenueRows.length - 1]?.date?.slice(5) ?? ''}</span>
              </div>
            </>
          ) : <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', paddingTop: 20 }}>Нет данных</p>}
        </div>
      </div>

      {/* Payment breakdown */}
      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <span style={LBL}>Методы оплаты — 30 дней</span>
        <PayBreakdown data={dash?.paymentBreakdown ?? []} />
      </div>

      {modal && <KpiBreakdownModal title={modal.title} subtitle={modal.subtitle} b={modal.b} onClose={() => setModal(null)} />}
    </div>
  )
}

// ─── Tab: Отчёты (period-based) ───────────────────────────────────────────────
function ReportsTab() {
  const [range, setRange] = useState<ReportRange>('30d')
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [subTab, setSubTab] = useState<'revenue' | 'products' | 'payments'>('revenue')
  const [metricModal, setMetricModal] = useState<null | { title: string; subtitle?: string; value: string; valueColor?: string; rows: { label: string; value: string; color?: string }[] }>(null)
  const [openItem, setOpenItem] = useState<any | null>(null)

  const [from, to] = getRange(range, customFrom, customTo)

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
  // Эквайринг (потери) = 8% от СБП-переводов за период (как в бэкенде netBreakdown).
  const transferTotal = parseNum(payBreakdown.find((p: any) => p.method === 'transfer')?.total)
  const acquiring     = Math.round(transferTotal * 0.08 * 100) / 100
  // Прибыль с учётом эквайринга — согласуется со сводкой бэкенда.
  const profit        = totalRevenue - totalExpenses - totalCogs - acquiring

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Range selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['7d', '30d', 'month', 'custom'] as ReportRange[]).map(r => (
          <button key={r} onClick={() => setRange(r)} style={{ padding: '6px 14px', borderRadius: 9999, border: `1px solid ${range === r ? '#8B5CF6' : 'rgba(255,255,255,0.08)'}`, background: range === r ? 'rgba(139,92,246,0.15)' : 'transparent', color: range === r ? '#A78BFA' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {r === '7d' ? '7 дней' : r === '30d' ? '30 дней' : r === 'month' ? 'Этот месяц' : 'Период'}
          </button>
        ))}
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={INP} />
            <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>—</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={INP} />
          </div>
        )}
      </div>

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
        const cards = [
          { label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6', onClick: () => setMetricModal({ title: 'Выручка · период', subtitle: periodSub, value: `${fmt(totalRevenue)} ₽`, valueColor: '#4cd7f6', rows: breakdownRows }) },
          { label: 'Прибыль', value: `${fmt(profit)} ₽`, color: '#10B981', onClick: () => setMetricModal({ title: 'Прибыль · период', subtitle: periodSub, value: `${fmt(profit)} ₽`, valueColor: '#10B981', rows: breakdownRows }) },
          { label: 'Расходы', value: `${fmt(totalExpenses)} ₽`, color: '#F43F5E', onClick: () => setMetricModal({ title: 'Расходы · период', subtitle: periodSub, value: `${fmt(totalExpenses)} ₽`, valueColor: '#F43F5E', rows: [{ label: 'Операционные расходы', value: `${fmt(totalExpenses)} ₽` }, { label: 'Себестоимость', value: `${fmt(totalCogs)} ₽`, color: '#F59E0B' }, { label: 'Эквайринг (потери)', value: `${fmt(acquiring)} ₽`, color: '#F59E0B' }] }) },
          { label: 'Чеков', value: String(checksCount), color: '#8B5CF6', onClick: () => setMetricModal({ title: 'Чеки · период', subtitle: periodSub, value: String(checksCount), valueColor: '#8B5CF6', rows: [{ label: 'Средний чек', value: `${fmt(avgCheck)} ₽` }, { label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6' }] }) },
          { label: 'Средний чек', value: `${fmt(avgCheck)} ₽`, color: '#A78BFA', onClick: () => setMetricModal({ title: 'Средний чек · период', subtitle: periodSub, value: `${fmt(avgCheck)} ₽`, valueColor: '#A78BFA', rows: [{ label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6' }, { label: 'Чеков', value: String(checksCount), color: '#8B5CF6' }] }) },
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {cards.map(k => (
              <button key={k.label} onClick={k.onClick} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', textAlign: 'left', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
                <p style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: k.color, margin: '0 0 4px', lineHeight: 1 }}>{k.value}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{k.label}</p>
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
                        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[p.method] ?? p.method}</span>
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
function ProductsTab({ products }: { products: any }) {
  const rows: any[] = products?.products ?? []
  const totalRev: number = parseNum(products?.totalRev)
  const [openItem, setOpenItem] = useState<any | null>(null)

  const catMap: Record<string, number> = {}
  rows.forEach((r: any) => {
    const cat = r.category ?? 'Прочее'
    catMap[cat] = (catMap[cat] ?? 0) + parseNum(r.totalRev)
  })
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const catMax = cats[0]?.[1] ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

// ─── Tab: Игроки ──────────────────────────────────────────────────────────────
function PlayersTab({ clients }: { clients: any }) {
  const segments    = clients?.segments ?? { new: 0, active: 0, sleeping: 0 }
  const tierDist: any[]    = clients?.tierDist ?? []
  const topSpenders: any[] = clients?.topSpenders ?? []
  const retentionRate: number = clients?.retentionRate ?? 0
  const totalClients: number  = clients?.total ?? 0
  const newThisMonth: number  = clients?.newThisMonth ?? 0
  const [metricModal, setMetricModal] = useState<null | { title: string; subtitle?: string; value: string; valueColor?: string; rows: { label: string; value: string; color?: string }[] }>(null)
  const [openPlayer, setOpenPlayer] = useState<any | null>(null)

  const segTotal = segments.new + segments.active + segments.sleeping || 1
  const segData = [
    { label: 'Новые',    value: segments.new,      color: '#10B981', icon: 'person_add', desc: 'Регистрация < 30 дней' },
    { label: 'Активные', value: segments.active,   color: '#8B5CF6', icon: 'people',     desc: 'Визит < 14 дней' },
    { label: 'Спящие',   value: segments.sleeping, color: '#F59E0B', icon: 'bedtime',    desc: 'Последний > 14 дней' },
  ]
  const tierTotal = tierDist.reduce((s: number, t: any) => s + (t.count ?? 0), 0) || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <KpiCard label="Всего игроков" value={String(totalClients)} sub="зарегистрировано" icon="group" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" onClick={() => setMetricModal({ title: 'Всего игроков', subtitle: 'клиентская база', value: String(totalClients), valueColor: '#8B5CF6', rows: [{ label: 'Новые за месяц', value: String(newThisMonth), color: '#10B981' }, { label: 'Активные (14д)', value: String(segments.active), color: '#8B5CF6' }, { label: 'Спящие', value: String(segments.sleeping), color: '#F59E0B' }] })} />
        <KpiCard label="Новые за месяц" value={String(newThisMonth)} sub="последние 30 дней" icon="person_add" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" onClick={() => setMetricModal({ title: 'Новые за месяц', subtitle: 'регистрация < 30 дней', value: String(newThisMonth), valueColor: '#10B981', rows: [{ label: 'Всего игроков', value: String(totalClients) }, { label: 'Новые сегмент', value: String(segments.new), color: '#10B981' }] })} />
        <KpiCard label="Retention" value={`${retentionRate}%`} sub="повторные визиты 14д" icon="repeat" iconColor="#4cd7f6" iconBg="rgba(76,215,246,0.1)" onClick={() => setMetricModal({ title: 'Retention', subtitle: 'повторные визиты за 14 дней', value: `${retentionRate}%`, valueColor: '#4cd7f6', rows: [{ label: 'Активные (14д)', value: String(segments.active), color: '#8B5CF6' }, { label: 'Спящие', value: String(segments.sleeping), color: '#F59E0B' }] })} />
      </div>

      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <span style={LBL}>Сегменты</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {segData.map(seg => (
            <button key={seg.label} onClick={() => setMetricModal({ title: `Сегмент · ${seg.label}`, subtitle: seg.desc, value: String(seg.value), valueColor: seg.color, rows: [{ label: 'Доля сегментов', value: `${Math.round((seg.value / segTotal) * 100)}%`, color: seg.color }, { label: 'Всего в сегментах', value: String(segTotal) }] })} style={{ textAlign: 'left', padding: 14, borderRadius: 12, background: `${seg.color}10`, border: `1px solid ${seg.color}22`, cursor: 'pointer', color: 'var(--on-surface)' }}>
              <Icon name={seg.icon} size={18} color={seg.color} />
              <p style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--on-surface)', margin: '8px 0 2px', lineHeight: 1 }}>{seg.value}</p>
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
          <span style={LBL}>Топ игроки — 30 дней</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topSpenders.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center' }}>Нет данных</p> : topSpenders.slice(0, 8).map((sp: any, i: number) => {
              const tier = sp.clientTier ?? 'null'
              return (
                <button key={sp.playerId ?? i} onClick={() => setOpenPlayer(sp)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: 'var(--on-surface)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: `rgba(139,92,246,${0.25 - i * 0.02})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', flexShrink: 0 }}>
                    {(sp.nickname ?? '??').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.nickname ?? 'Гость'}</p>
                    <p style={{ fontSize: 11, color: TIER_COLORS[tier] ?? 'var(--on-surface-variant)', margin: 0 }}>{TIER_LABELS[tier] ?? tier} · {sp.cnt ?? 0} визитов</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{fmt(parseNum(sp.total))} ₽</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {metricModal && <MetricDetailModal title={metricModal.title} subtitle={metricModal.subtitle} value={metricModal.value} valueColor={metricModal.valueColor} rows={metricModal.rows} onClose={() => setMetricModal(null)} />}
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

          {/* Итог + оплата */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Итого</span>
              <span style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', color: '#A78BFA' }}>{fmt(parseNum(check.totalAmount))} ₽</span>
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

function ChecksTab() {
  type CMode = 'day' | 'range'
  const todayBiz = format(new Date(), 'yyyy-MM-dd')
  const [cmode, setCmode] = useState<CMode>('day')
  const [day, setDay] = useState(todayBiz)
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(todayBiz)
  const [openId, setOpenId] = useState<string | null>(null)

  const qFrom = cmode === 'day' ? day : from
  const qTo = cmode === 'day' ? day : to

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'checks', qFrom, qTo],
    queryFn: () => api.get<any>(`/analytics/checks?from=${qFrom}&to=${qTo}`),
    enabled: !!qFrom && !!qTo,
  })

  const summary: NetBreak | undefined = data?.summary
  const checks: any[] = data?.checks ?? []

  const preset: React.CSSProperties = { padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mode switch */}
      <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', alignSelf: 'flex-start' }}>
        <button onClick={() => setCmode('day')} style={{ padding: '7px 16px', borderRadius: 9999, border: 'none', background: cmode === 'day' ? 'rgba(139,92,246,0.25)' : 'transparent', color: cmode === 'day' ? '#A78BFA' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Бизнес-день</button>
        <button onClick={() => setCmode('range')} style={{ padding: '7px 16px', borderRadius: 9999, border: 'none', background: cmode === 'range' ? 'rgba(139,92,246,0.25)' : 'transparent', color: cmode === 'range' ? '#A78BFA' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Период</button>
      </div>

      {/* Day navigator OR range inputs */}
      {cmode === 'day' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setDay(d => shiftBizDay(d, -1))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevron_left" size={18} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 150, textAlign: 'center' }}>
              {day === todayBiz ? 'Сегодня' : day === shiftBizDay(todayBiz, -1) ? 'Вчера' : ''} {bizDayLabel(day)}
            </span>
            <button onClick={() => setDay(d => shiftBizDay(d, 1))} disabled={day >= todayBiz} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: day >= todayBiz ? 'rgba(204,195,216,0.2)' : 'var(--on-surface-variant)', cursor: day >= todayBiz ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevron_right" size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setDay(todayBiz) }} style={preset}>Сегодня</button>
            <button onClick={() => { setDay(shiftBizDay(todayBiz, -1)) }} style={preset}>Вчера</button>
            <button onClick={() => { setCmode('range'); setFrom(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setTo(todayBiz) }} style={preset}>7 дней</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={INP} />
          <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={INP} />
          <button onClick={() => { setFrom(todayBiz); setTo(todayBiz) }} style={preset}>Сегодня</button>
          <button onClick={() => { setFrom(shiftBizDay(todayBiz, -1)); setTo(shiftBizDay(todayBiz, -1)) }} style={preset}>Вчера</button>
          <button onClick={() => { setFrom(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setTo(todayBiz) }} style={preset}>7 дней</button>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Итог за период</span>
          <NetBreakdownRows b={summary} />
        </div>
      )}

      {/* Checks list */}
      <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...LBL, margin: 0 }}>Чеки</span>
          <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{checks.length}</span>
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
              <span style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', flexShrink: 0 }}>{fmt(parseNum(c.totalAmount))} ₽</span>
            </button>
          ))}
      </div>

      {openId && <CheckDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('today')

  const { data: dash, isError: dashError, refetch: refetchDash } = useQuery({ queryKey: ['analytics', 'dashboard'], queryFn: () => api.get<any>('/analytics/dashboard'), refetchInterval: 60000 })
  const { data: revenue } = useQuery({ queryKey: ['analytics', 'revenue', '30d'], queryFn: () => api.get<any>('/analytics/revenue'), refetchInterval: 300000 })
  const { data: products } = useQuery({ queryKey: ['analytics', 'products'], queryFn: () => api.get<any>('/analytics/products'), refetchInterval: 300000, enabled: activeTab === 'products' })
  const { data: clients } = useQuery({ queryKey: ['analytics', 'clients'], queryFn: () => api.get<any>('/analytics/clients'), refetchInterval: 300000, enabled: activeTab === 'players' })

  // Бизнес-день для вкладки «Сегодня»: берём с дашборда, иначе вычисляем локально.
  const businessDay: string = dash?.businessDay ?? format(new Date(), 'yyyy-MM-dd')

  const TABS = [
    { key: 'today'    as MainTab, label: 'Сегодня', icon: 'today' },
    { key: 'overview' as MainTab, label: 'Сводка',  icon: 'dashboard' },
    { key: 'reports'  as MainTab, label: 'Отчёты',  icon: 'bar_chart' },
    { key: 'checks'   as MainTab, label: 'Чеки',    icon: 'receipt_long' },
    { key: 'products' as MainTab, label: 'Товары',  icon: 'inventory_2' },
    { key: 'players'  as MainTab, label: 'Игроки',  icon: 'group' },
  ]

  return (
    <div style={{ minHeight: '100dvh', overflowX: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Аналитика</h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
            {format(new Date(), 'd MMMM yyyy', { locale: ru })}
          </p>
        </div>
        {/* Tabs — горизонтальный скролл только внутри таб-бара, не страницы */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch' as any,
        }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '9px 12px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '2px solid #8B5CF6' : '2px solid transparent',
              color: activeTab === tab.key ? '#8B5CF6' : 'var(--on-surface-variant)',
              fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 400,
              transition: 'all 0.2s', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <Icon name={tab.icon} size={15} />
              <span className="dash-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, width: '100%', boxSizing: 'border-box' }}>
        {activeTab === 'today'     && <TodayTab businessDay={businessDay} />}
        {activeTab === 'overview'  && (dash ? <OverviewTab dash={dash} revenue={revenue} /> : dashError ? <StateView state="error" description="Не удалось загрузить аналитику." action={{ label: 'Повторить', onClick: () => refetchDash() }} /> : <StateView state="loading" />)}
        {activeTab === 'reports'   && <ReportsTab />}
        {activeTab === 'checks'    && <ChecksTab />}
        {activeTab === 'products'  && <ProductsTab  products={products} />}
        {activeTab === 'players'   && <PlayersTab   clients={clients} />}
      </div>

      <style>{`
        @media (max-width: 768px) { .dash-row { grid-template-columns: 1fr !important; } }
        /* Скрываем скроллбар у таб-бара */
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
