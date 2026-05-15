'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format, subDays } from 'date-fns'
import { ru } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'finances' | 'products' | 'players'

const PAY_COLORS: Record<string, string> = {
  cash: '#10B981',
  card: '#3B82F6',
  transfer: '#8B5CF6',
  bonus: '#F59E0B',
  deposit: '#06B6D4',
  certificate: '#14B8A6',
  debt: '#F43F5E',
}
const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'Перевод',
  bonus: 'Бонусы', deposit: 'Депозит', certificate: 'Сертификат', debt: 'Долг',
}
const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#94A3B8',
  gold: '#F59E0B',
  platinum: '#E2E8F0',
  null: 'rgba(204,195,216,0.4)',
}
const TIER_LABELS: Record<string, string> = {
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина', null: 'Без уровня',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseNum(v: unknown) {
  return parseFloat(String(v ?? 0)) || 0
}
function fmt(n: number) {
  return n.toLocaleString('ru', { maximumFractionDigits: 0 })
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--on-surface-variant)', margin: '0 0 14px',
    }}>
      {children}
    </p>
  )
}

function KpiCard({
  label, value, sub, delta, icon, iconColor, iconBg,
}: {
  label: string; value: string; sub: string; delta?: number
  icon: string; iconColor: string; iconBg: string
}) {
  return (
    <div
      className="glass-l2"
      style={{ borderRadius: 16, padding: 20, boxShadow: 'var(--sh-card)', cursor: 'default' }}
      onMouseEnter={e => {
        e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)'
        e.currentTarget.style.boxShadow = '0 0 20px rgba(139,92,246,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
        e.currentTarget.style.boxShadow = 'var(--sh-card)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: iconColor }}>{icon}</span>
        </div>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <p style={{
        fontSize: 22, fontWeight: 900, fontStyle: 'italic',
        fontVariantNumeric: 'tabular-nums',
        margin: '0 0 4px', color: 'var(--on-surface)', lineHeight: 1,
      }}>
        {value}
      </p>
      <p style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        margin: '0 0 2px', color: 'var(--on-surface-variant)',
      }}>
        {label}
      </p>
      <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: 0 }}>{sub}</p>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (!delta) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(204,195,216,0.1)', borderRadius: 6, padding: '2px 7px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)' }}>remove</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(204,195,216,0.45)' }}>0%</span>
    </div>
  )
  const up = delta > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: up ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
      borderRadius: 6, padding: '2px 7px',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 11, color: up ? 'var(--success)' : 'var(--danger)' }}>
        {up ? 'trending_up' : 'trending_down'}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: up ? 'var(--success)' : 'var(--danger)' }}>
        {up ? '+' : ''}{delta}%
      </span>
    </div>
  )
}

// ─── Revenue mini bar chart ───────────────────────────────────────────────────
function MiniBarChart({ data, color = '#8B5CF6', height = 60 }: {
  data: { date: string; revenue: string | number }[]
  color?: string; height?: number
}) {
  if (!data.length) return null
  const values = data.map(d => parseNum(d.revenue))
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.map((d, i) => {
        const pct = (values[i] / max) * 100
        return (
          <div
            key={d.date}
            title={`${d.date}: ${fmt(values[i])} ₽`}
            style={{
              flex: 1, minWidth: 4,
              height: `${Math.max(pct, 4)}%`,
              background: color,
              borderRadius: '3px 3px 0 0',
              opacity: 0.7 + (i / data.length) * 0.3,
              transition: 'opacity 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = String(0.7 + (i / data.length) * 0.3) }}
          />
        )
      })}
    </div>
  )
}

// ─── Payment breakdown widget ─────────────────────────────────────────────────
function PayBreakdown({ data }: { data: { method: string; total: string | number }[] }) {
  const total = data.reduce((s, p) => s + parseNum(p.total), 0)
  if (!data.length) return (
    <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет данных</p>
  )
  return (
    <>
      <div style={{ height: 20, borderRadius: 9999, display: 'flex', overflow: 'hidden', marginBottom: 16, gap: 2 }}>
        {data.map((p) => {
          const pct = total > 0 ? (parseNum(p.total) / total) * 100 : 0
          return (
            <div key={p.method} style={{
              width: `${pct}%`, minWidth: pct > 0 ? 3 : 0,
              background: PAY_COLORS[p.method] ?? '#8B5CF6',
            }} title={`${PAY_LABELS[p.method] ?? p.method}: ${pct.toFixed(1)}%`} />
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((p) => {
          const pct = total > 0 ? ((parseNum(p.total) / total) * 100).toFixed(0) : '0'
          return (
            <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_COLORS[p.method] ?? '#8B5CF6', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[p.method] ?? p.method}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(parseNum(p.total))} ₽
              </span>
              <span style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', width: 32, textAlign: 'right' }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Tab: Finances ────────────────────────────────────────────────────────────
function FinancesTab({ dash, revenue }: { dash: any; revenue: any }) {
  const [dayOffset, setDayOffset] = useState(0)
  const targetDate = subDays(new Date(), dayOffset)
  const targetStr = targetDate.toISOString().split('T')[0]

  const { data: dayData } = useQuery({
    queryKey: ['analytics', 'revenue', 'day', targetStr],
    queryFn: () => api.get<any>(`/analytics/revenue?from=${targetStr}&to=${targetStr}`),
  })

  const dayRev = parseNum(dayData?.revenue?.[0]?.revenue)
  const dayChecks = dayData?.revenue?.[0]?.count ?? 0
  const dayExp = parseNum(dayData?.expenses?.[0]?.total)
  const dayCogs = parseNum(dayData?.cogs?.[0]?.total)
  const dayProfit = dayRev - dayExp - dayCogs

  const monthRev = parseNum(dash?.month?.revenue)
  const monthProfit = parseNum(dash?.month?.profit)
  const monthCogs = parseNum(dash?.month?.cogs)
  const monthExp = parseNum(dash?.month?.expenses)
  const monthDelta = dash?.month?.delta ?? 0

  const revenueRows: any[] = revenue?.revenue ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Month KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        <KpiCard label="ВЫРУЧКА МЕСЯЦ" value={`${fmt(monthRev)} ₽`} sub="последние 30 дней" delta={monthDelta}
          icon="payments" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" />
        <KpiCard label="ПРИБЫЛЬ МЕСЯЦ" value={`${fmt(monthProfit)} ₽`}
          sub={`маржа ${monthRev > 0 ? Math.round((monthProfit / monthRev) * 100) : 0}%`}
          icon="trending_up" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" />
        <KpiCard label="COGS (СЕБЕСТ.)" value={`${fmt(monthCogs)} ₽`} sub="стоимость товаров"
          icon="inventory" iconColor="#F59E0B" iconBg="rgba(245,158,11,0.1)" />
        <KpiCard label="РАСХОДЫ" value={`${fmt(monthExp)} ₽`} sub="операционные"
          icon="receipt" iconColor="#F43F5E" iconBg="rgba(244,63,94,0.1)" />
      </div>

      {/* Day navigator + mini chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }} className="dash-row">

        {/* Day detail */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <MonoLabel>ДЕНЬ</MonoLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setDayOffset(d => d + 1)}
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', minWidth: 90, textAlign: 'center' }}>
                {dayOffset === 0 ? 'Сегодня' : dayOffset === 1 ? 'Вчера' : format(targetDate, 'd MMM', { locale: ru })}
              </span>
              <button
                onClick={() => setDayOffset(d => Math.max(0, d - 1))}
                disabled={dayOffset === 0}
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: dayOffset === 0 ? 'rgba(204,195,216,0.2)' : 'var(--on-surface-variant)', cursor: dayOffset === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Выручка', value: `${fmt(dayRev)} ₽`, color: '#8B5CF6' },
              { label: 'Прибыль', value: `${fmt(dayProfit)} ₽`, color: dayProfit >= 0 ? '#10B981' : '#F43F5E' },
              { label: 'Чеков', value: String(dayChecks), color: '#4cd7f6' },
              { label: 'Расходы', value: `${fmt(dayExp + dayCogs)} ₽`, color: '#F59E0B' },
            ].map(item => (
              <div key={item.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                <p style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: '0 0 4px', color: item.color }}>{item.value}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono', monospace" }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 30d revenue chart */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <MonoLabel>ВЫРУЧКА ЗА 30 ДНЕЙ</MonoLabel>
          {revenueRows.length > 0 ? (
            <>
              <MiniBarChart data={revenueRows} color="rgba(139,92,246,0.7)" height={80} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'rgba(204,195,216,0.4)' }}>{revenueRows[0]?.date?.slice(5) ?? ''}</span>
                <span style={{ fontSize: 10, color: 'rgba(204,195,216,0.4)' }}>{revenueRows[revenueRows.length - 1]?.date?.slice(5) ?? ''}</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', paddingTop: 20 }}>Нет данных</p>
          )}
        </div>
      </div>

      {/* Payment breakdown */}
      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <MonoLabel>МЕТОДЫ ОПЛАТЫ — 30 ДНЕЙ</MonoLabel>
        <PayBreakdown data={dash?.paymentBreakdown ?? []} />
      </div>
    </div>
  )
}

// ─── Tab: Products ────────────────────────────────────────────────────────────
function ProductsTab({ products }: { products: any }) {
  const rows: any[] = products?.products ?? []
  const totalRev: number = products?.totalRev ?? 0

  const ABC_COLORS: Record<string, string> = { A: '#8B5CF6', B: '#3B82F6', C: 'rgba(204,195,216,0.45)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ABC legend */}
      <div style={{ display: 'flex', gap: 12 }}>
        {['A', 'B', 'C'].map(l => {
          const desc = l === 'A' ? '0–80% выручки' : l === 'B' ? '80–95% выручки' : '95–100% выручки'
          return (
            <div key={l} className="glass-l2" style={{ flex: 1, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `rgba(${l === 'A' ? '139,92,246' : l === 'B' ? '59,130,246' : '148,163,184'},0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: ABC_COLORS[l] }}>
                {l}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>Класс {l}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: 0 }}>{desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ABC table */}
      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <MonoLabel>ABC АНАЛИЗ — ПОЗИЦИИ</MonoLabel>
        {rows.length === 0 ? (
          <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет данных за период</p>
        ) : (
          <div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 110px 60px 50px 36px',
              gap: 8, padding: '0 0 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4,
            }}>
              {['Позиция', 'Категория', 'Выручка', 'Доля%', 'Накоп.%', 'ABC'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(204,195,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>
            {rows.map((item: any, i: number) => (
              <div
                key={item.itemId ?? i}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 110px 60px 50px 36px',
                  gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name ?? '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{item.category ?? '—'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)' }}>{fmt(parseNum(item.totalRev))} ₽</span>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{item.share ?? '0'}%</span>
                <span style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)' }}>{item.cumulative ?? '0'}%</span>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: `rgba(${item.abc === 'A' ? '139,92,246' : item.abc === 'B' ? '59,130,246' : '148,163,184'},0.15)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: ABC_COLORS[item.abc ?? 'C'],
                }}>
                  {item.abc ?? 'C'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category breakdown mini bars */}
      {rows.length > 0 && (() => {
        const catMap: Record<string, number> = {}
        rows.forEach((r: any) => {
          const cat = r.category ?? 'Прочее'
          catMap[cat] = (catMap[cat] ?? 0) + parseNum(r.totalRev)
        })
        const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
        const catMax = cats[0]?.[1] ?? 1
        return (
          <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
            <MonoLabel>ПО КАТЕГОРИЯМ</MonoLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cats.map(([cat, rev]) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', width: 90, flexShrink: 0, textAlign: 'right' }}>{cat}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(rev / catMax) * 100}%`, background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)', borderRadius: 9999 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)', width: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(rev)} ₽</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Tab: Players ─────────────────────────────────────────────────────────────
function PlayersTab({ clients }: { clients: any }) {
  const segments = clients?.segments ?? { new: 0, active: 0, sleeping: 0 }
  const tierDist: any[] = clients?.tierDist ?? []
  const topSpenders: any[] = clients?.topSpenders ?? []
  const retentionRate: number = clients?.retentionRate ?? 0
  const totalClients: number = clients?.total ?? 0
  const newThisMonth: number = clients?.newThisMonth ?? 0

  const segTotal = segments.new + segments.active + segments.sleeping || 1
  const segData = [
    { label: 'Новые', value: segments.new, color: '#10B981', icon: 'person_add', desc: 'Регистрация < 30 дней' },
    { label: 'Активные', value: segments.active, color: '#8B5CF6', icon: 'people', desc: 'Визит < 14 дней' },
    { label: 'Спящие', value: segments.sleeping, color: '#F59E0B', icon: 'bedtime', desc: 'Последний визит > 14 дней' },
  ]

  const tierTotal = tierDist.reduce((s: number, t: any) => s + (t.count ?? 0), 0) || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        <KpiCard label="ВСЕГО ИГРОКОВ" value={String(totalClients)} sub="зарегистрировано"
          icon="group" iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.1)" />
        <KpiCard label="НОВЫЕ ЗА МЕСЯЦ" value={String(newThisMonth)} sub="последние 30 дней"
          icon="person_add" iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" />
        <KpiCard label="RETENTION RATE" value={`${retentionRate}%`} sub="повторные визиты 14д"
          icon="repeat" iconColor="#4cd7f6" iconBg="rgba(76,215,246,0.1)" />
      </div>

      {/* Segments */}
      <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
        <MonoLabel>СЕГМЕНТЫ ИГРОКОВ</MonoLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {segData.map(seg => (
            <div key={seg.label} style={{ padding: 16, borderRadius: 12, background: `rgba(${seg.color === '#10B981' ? '16,185,129' : seg.color === '#8B5CF6' ? '139,92,246' : '245,158,11'},0.08)`, border: `1px solid ${seg.color}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: seg.color }}>{seg.icon}</span>
                <span style={{ fontSize: 12, color: seg.color, fontWeight: 600 }}>{seg.label}</span>
              </div>
              <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', color: 'var(--on-surface)', margin: '0 0 4px', lineHeight: 1 }}>{seg.value}</p>
              <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '0 0 8px' }}>{seg.desc}</p>
              {/* mini bar */}
              <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: `${(seg.value / segTotal) * 100}%`, background: seg.color, borderRadius: 9999, transition: 'width 0.6s' }} />
              </div>
              <p style={{ fontSize: 10, color: 'rgba(204,195,216,0.4)', margin: '4px 0 0' }}>{Math.round((seg.value / segTotal) * 100)}% от активных</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tier distribution + Top spenders */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 20 }} className="dash-row">

        {/* Tier distribution */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <MonoLabel>РАСПРЕДЕЛЕНИЕ ПО УРОВНЯМ</MonoLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tierDist.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', paddingTop: 12 }}>Нет данных</p>
            ) : tierDist.map((t: any) => {
              const tier = t.tier ?? 'null'
              const pct = Math.round((t.count / tierTotal) * 100)
              const color = TIER_COLORS[tier] ?? 'rgba(204,195,216,0.4)'
              return (
                <div key={tier}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{TIER_LABELS[tier] ?? tier}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)' }}>{t.count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top spenders */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
          <MonoLabel>ТОП ИГРОКОВ ПО ТРАТАМ — 30 ДНЕЙ</MonoLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topSpenders.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.4)', textAlign: 'center', paddingTop: 12 }}>Нет данных</p>
            ) : topSpenders.slice(0, 8).map((sp: any, i: number) => {
              const initials = (sp.nickname ?? '??').slice(0, 2).toUpperCase()
              const tier = sp.clientTier ?? 'null'
              const tierColor = TIER_COLORS[tier] ?? 'rgba(204,195,216,0.4)'
              return (
                <div key={sp.playerId ?? i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, rgba(139,92,246,${0.3 - i * 0.025}), rgba(76,215,246,${0.3 - i * 0.025}))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#A78BFA',
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sp.nickname ?? 'Гость'}
                    </p>
                    <p style={{ fontSize: 11, color: tierColor, margin: 0 }}>{TIER_LABELS[tier] ?? tier} · {sp.cnt ?? 0} визитов</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>
                    {fmt(parseNum(sp.total))} ₽
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('finances')

  const { data: dash } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get<any>('/analytics/dashboard'),
    refetchInterval: 60000,
  })

  const { data: revenue } = useQuery({
    queryKey: ['analytics', 'revenue', '30d'],
    queryFn: () => api.get<any>('/analytics/revenue'),
    refetchInterval: 300000,
  })

  const { data: products } = useQuery({
    queryKey: ['analytics', 'products'],
    queryFn: () => api.get<any>('/analytics/products'),
    refetchInterval: 300000,
    enabled: activeTab === 'products',
  })

  const { data: clients } = useQuery({
    queryKey: ['analytics', 'clients'],
    queryFn: () => api.get<any>('/analytics/clients'),
    refetchInterval: 300000,
    enabled: activeTab === 'players',
  })

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'finances', label: 'Финансы', icon: 'payments' },
    { key: 'products', label: 'Продукты', icon: 'inventory_2' },
    { key: 'players', label: 'Игроки', icon: 'group' },
  ]

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(21,18,27,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>Аналитика</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {format(new Date(), 'd MMMM yyyy', { locale: ru })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                borderBottom: activeTab === tab.key ? '2px solid #8B5CF6' : '2px solid transparent',
                color: activeTab === tab.key ? '#8B5CF6' : 'var(--on-surface-variant)',
                fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
                transition: 'all 0.2s', marginBottom: -1,
              }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: 17,
                fontVariationSettings: activeTab === tab.key ? "'FILL' 1" : "'FILL' 0",
              }}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '24px 32px 80px', flex: 1 }}>
        {activeTab === 'finances' && <FinancesTab dash={dash} revenue={revenue} />}
        {activeTab === 'products' && <ProductsTab products={products} />}
        {activeTab === 'players' && <PlayersTab clients={clients} />}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dash-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
