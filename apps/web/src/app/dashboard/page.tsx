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
type MainTab = 'overview' | 'reports' | 'products' | 'players'
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

const INP: React.CSSProperties = { padding: '9px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 12px', display: 'block' }

// ─── Shared components ────────────────────────────────────────────────────────
function KpiCard({ label, value, rawValue, suffix = ' ₽', sub, delta, icon, iconColor, iconBg }: {
  label: string; value?: string; rawValue?: number; suffix?: string; sub: string; delta?: number
  icon: string; iconColor: string; iconBg: string
}) {
  const animated = useCountUp(rawValue ?? 0, 700)
  const displayValue = rawValue !== undefined
    ? `${animated.toLocaleString('ru', { maximumFractionDigits: 0 })}${suffix}`
    : (value ?? '')
  return (
    <div className="glass-l2 ti-slide-up" style={{ borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={iconColor} />
        </div>
        {delta !== undefined && <DeltaBadge delta={delta} />}
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

// ─── Tab: Сводка (live overview) ──────────────────────────────────────────────
function OverviewTab({ dash, revenue }: { dash: any; revenue: any }) {
  const [dayOffset, setDayOffset] = useState(0)
  const targetDate = subDays(new Date(), dayOffset)
  const targetStr = targetDate.toISOString().split('T')[0]

  const { data: dayData } = useQuery({
    queryKey: ['analytics', 'revenue', 'day', targetStr],
    queryFn: () => api.get<any>(`/analytics/revenue?from=${targetStr}&to=${targetStr}`),
  })

  const dayRev   = parseNum(dayData?.revenue?.[0]?.revenue)
  const dayChecks= dayData?.revenue?.[0]?.count ?? 0
  const dayExp   = parseNum(dayData?.expenses?.[0]?.total)
  const dayCogs  = parseNum(dayData?.cogs?.[0]?.total)
  const dayProfit= dayRev - dayExp - dayCogs

  const monthRev   = parseNum(dash?.month?.revenue)
  const monthProfit= parseNum(dash?.month?.profit)
  const monthCogs  = parseNum(dash?.month?.cogs)
  const monthExp   = parseNum(dash?.month?.expenses)
  const monthDelta = dash?.month?.delta ?? 0
  const revenueRows: any[] = revenue?.revenue ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Month KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <KpiCard label="Выручка месяц" rawValue={monthRev} sub="последние 30 дней" delta={monthDelta} icon="payments" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" />
        <KpiCard label="Прибыль месяц" rawValue={monthProfit} sub={`маржа ${monthRev > 0 ? Math.round((monthProfit / monthRev) * 100) : 0}%`} icon="trending_up" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" />
        <KpiCard label="Себестоимость" rawValue={monthCogs} sub="стоимость товаров" icon="inventory" iconColor="#F59E0B" iconBg="rgba(245,158,11,0.1)" />
        <KpiCard label="Расходы" rawValue={monthExp} sub="операционные" icon="receipt" iconColor="#F43F5E" iconBg="rgba(244,63,94,0.1)" />
      </div>

      {/* Day navigator + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }} className="dash-row">
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={LBL}>День</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setDayOffset(d => d + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevron_left" size={16} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
                {dayOffset === 0 ? 'Сегодня' : dayOffset === 1 ? 'Вчера' : format(targetDate, 'd MMM', { locale: ru })}
              </span>
              <button onClick={() => setDayOffset(d => Math.max(0, d - 1))} disabled={dayOffset === 0} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: dayOffset === 0 ? 'rgba(204,195,216,0.2)' : 'var(--on-surface-variant)', cursor: dayOffset === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevron_right" size={16} />
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Выручка', value: `${fmt(dayRev)} ₽`, color: '#8B5CF6' },
              { label: 'Прибыль', value: `${fmt(dayProfit)} ₽`, color: dayProfit >= 0 ? '#10B981' : '#F43F5E' },
              { label: 'Чеков', value: String(dayChecks), color: '#4cd7f6' },
              { label: 'Расходы', value: `${fmt(dayExp + dayCogs)} ₽`, color: '#F59E0B' },
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
    </div>
  )
}

// ─── Tab: Отчёты (period-based) ───────────────────────────────────────────────
function ReportsTab() {
  const [range, setRange] = useState<ReportRange>('30d')
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [subTab, setSubTab] = useState<'revenue' | 'products' | 'payments'>('revenue')

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
  const { data: dashData } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get<any>('/analytics/dashboard'),
  })

  const days: any[] = revData?.days ?? []
  const totalRevenue  = days.reduce((s: number, d: any) => s + parseFloat(d.revenue || 0), 0)
  const totalExpenses = days.reduce((s: number, d: any) => s + parseFloat(d.expenses || 0), 0)
  const totalCogs     = days.reduce((s: number, d: any) => s + parseFloat(d.cogs || 0), 0)
  const profit        = totalRevenue - totalExpenses - totalCogs
  const checksCount   = days.reduce((s: number, d: any) => s + (d.checksCount || 0), 0)
  const avgCheck      = checksCount ? totalRevenue / checksCount : 0
  const maxDayRev     = days.length ? Math.max(...days.map((d: any) => parseFloat(d.revenue || 0))) : 1

  const products: any[] = prodData?.items ?? []
  const totalProdRev: number = prodData?.totalRev ?? 0
  const payBreakdown: any = dashData?.paymentBreakdown ?? {}

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

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { label: 'Выручка', value: `${fmt(totalRevenue)} ₽`, color: '#4cd7f6' },
          { label: 'Прибыль', value: `${fmt(profit)} ₽`, color: '#10B981' },
          { label: 'Расходы', value: `${fmt(totalExpenses)} ₽`, color: '#F43F5E' },
          { label: 'Чеков', value: String(checksCount), color: '#8B5CF6' },
          { label: 'Средний чек', value: `${fmt(avgCheck)} ₽`, color: '#A78BFA' },
        ].map(k => (
          <div key={k.label} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: k.color, margin: '0 0 4px', lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{k.label}</p>
          </div>
        ))}
      </div>

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
          {days.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет данных</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {days.map((d: any) => {
                const rev = parseFloat(d.revenue || 0)
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
            const barPct = totalProdRev > 0 ? (parseFloat(p.revenue) / totalProdRev) * 100 : 0
            return (
              <div key={p.itemId ?? i} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 12, alignItems: 'center' }}>
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
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt(parseFloat(p.revenue || 0))} ₽</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{parseFloat(p.quantity || 0).toFixed(0)} шт</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Payments breakdown */}
      {subTab === 'payments' && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <span style={LBL}>Способы оплаты</span>
          {Object.keys(payBreakdown).length === 0 ? <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Нет данных</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const totalPay = Object.values(payBreakdown).reduce((s: number, v: any) => s + parseFloat(v), 0)
                return Object.entries(payBreakdown).map(([method, amount]: [string, any]) => {
                  const pct = totalPay > 0 ? (parseFloat(amount) / totalPay) * 100 : 0
                  const color = PAY_COLORS[method] ?? '#94A3B8'
                  return (
                    <div key={method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[method] ?? method}</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(parseFloat(amount))} ₽ · {pct.toFixed(1)}%</span>
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
    </div>
  )
}

// ─── Tab: Продукты (ABC) ──────────────────────────────────────────────────────
function ProductsTab({ products }: { products: any }) {
  const rows: any[] = products?.products ?? []

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
          <div key={item.itemId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', width: 20, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name ?? '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', width: 50, textAlign: 'right' }}>{item.share ?? '0'}%</span>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: `${ABC_COLORS[item.abc ?? 'C']}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: ABC_COLORS[item.abc ?? 'C'] }}>{item.abc ?? 'C'}</div>
          </div>
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
        <KpiCard label="Всего игроков" value={String(totalClients)} sub="зарегистрировано" icon="group" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" />
        <KpiCard label="Новые за месяц" value={String(newThisMonth)} sub="последние 30 дней" icon="person_add" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" />
        <KpiCard label="Retention" value={`${retentionRate}%`} sub="повторные визиты 14д" icon="repeat" iconColor="#4cd7f6" iconBg="rgba(76,215,246,0.1)" />
      </div>

      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <span style={LBL}>Сегменты</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {segData.map(seg => (
            <div key={seg.label} style={{ padding: 14, borderRadius: 12, background: `${seg.color}10`, border: `1px solid ${seg.color}22` }}>
              <Icon name={seg.icon} size={18} color={seg.color} />
              <p style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--on-surface)', margin: '8px 0 2px', lineHeight: 1 }}>{seg.value}</p>
              <p style={{ fontSize: 11, color: seg.color, fontWeight: 600, margin: '0 0 2px' }}>{seg.label}</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '0 0 8px' }}>{seg.desc}</p>
              <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', width: `${(seg.value / segTotal) * 100}%`, background: seg.color, borderRadius: 9999 }} />
              </div>
            </div>
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
                <div key={sp.playerId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: `rgba(139,92,246,${0.25 - i * 0.02})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', flexShrink: 0 }}>
                    {(sp.nickname ?? '??').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.nickname ?? 'Гость'}</p>
                    <p style={{ fontSize: 11, color: TIER_COLORS[tier] ?? 'var(--on-surface-variant)', margin: 0 }}>{TIER_LABELS[tier] ?? tier} · {sp.cnt ?? 0} визитов</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{fmt(parseNum(sp.total))} ₽</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('overview')

  const { data: dash, isError: dashError, refetch: refetchDash } = useQuery({ queryKey: ['analytics', 'dashboard'], queryFn: () => api.get<any>('/analytics/dashboard'), refetchInterval: 60000 })
  const { data: revenue } = useQuery({ queryKey: ['analytics', 'revenue', '30d'], queryFn: () => api.get<any>('/analytics/revenue'), refetchInterval: 300000 })
  const { data: products } = useQuery({ queryKey: ['analytics', 'products'], queryFn: () => api.get<any>('/analytics/products'), refetchInterval: 300000, enabled: activeTab === 'products' })
  const { data: clients } = useQuery({ queryKey: ['analytics', 'clients'], queryFn: () => api.get<any>('/analytics/clients'), refetchInterval: 300000, enabled: activeTab === 'players' })

  const TABS = [
    { key: 'overview' as MainTab, label: 'Сводка',  icon: 'dashboard' },
    { key: 'reports'  as MainTab, label: 'Отчёты',  icon: 'bar_chart' },
    { key: 'products' as MainTab, label: 'Товары',  icon: 'inventory_2' },
    { key: 'players'  as MainTab, label: 'Игроки',  icon: 'group' },
  ]

  return (
    <div style={{ minHeight: '100%', overflowX: 'hidden', display: 'flex', flexDirection: 'column', width: '100%' }}>
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
      <div style={{ padding: '16px 16px 16px', flex: 1, overflowX: 'hidden', width: '100%' }}>
        {activeTab === 'overview'  && (dash ? <OverviewTab dash={dash} revenue={revenue} /> : dashError ? <StateView state="error" description="Не удалось загрузить аналитику." action={{ label: 'Повторить', onClick: () => refetchDash() }} /> : <StateView state="loading" />)}
        {activeTab === 'reports'   && <ReportsTab />}
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
