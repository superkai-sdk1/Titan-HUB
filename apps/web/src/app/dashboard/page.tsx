'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Users, ShoppingBag, DollarSign, TrendingDown, Minus as MinusIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

type Period = 'day' | 'week' | 'month'

const PAY_COLORS: Record<string, string> = {
  cash: 'var(--pay-cash)',
  card: 'var(--pay-card)',
  transfer: 'var(--pay-split)',
  bonus: 'var(--pay-bonus)',
  deposit: 'var(--pay-deposit)',
  certificate: 'var(--pay-cert)',
}

const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'Перевод',
  bonus: 'Бонусы', deposit: 'Депозит', certificate: 'Сертификат',
}

const ABC_COLORS = ['var(--accent)', 'var(--info)', 'var(--text-muted)']
const ABC_LABELS = ['A', 'B', 'C']

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('day')

  const { data: dash } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get<any>('/analytics/dashboard'),
  })

  const { data: revenueData } = useQuery({
    queryKey: ['analytics', 'revenue', period],
    queryFn: () => api.get<any>('/analytics/revenue'),
  })

  const { data: productsData } = useQuery({
    queryKey: ['analytics', 'products'],
    queryFn: () => api.get<any>('/analytics/products'),
  })

  const todayRev = dash?.today?.revenue ?? 0
  const todayChecks = dash?.today?.checks ?? 0
  const monthRev = dash?.month?.revenue ?? 0
  const monthChecks = dash?.month?.checks ?? 0
  const avgCheck = todayChecks > 0 ? todayRev / todayChecks : 0

  const kpis = [
    {
      label: 'Выручка сегодня',
      value: Number(todayRev).toLocaleString('ru') + ' ₽',
      sub: `${todayChecks} чеков`,
      delta: 12,
      icon: DollarSign,
      iconColor: 'var(--accent)',
    },
    {
      label: 'За месяц',
      value: Number(monthRev).toLocaleString('ru') + ' ₽',
      sub: `${monthChecks} чеков`,
      delta: 8,
      icon: TrendingUp,
      iconColor: 'var(--success)',
    },
    {
      label: 'Средний чек',
      value: avgCheck.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽',
      sub: 'сегодня',
      delta: -3,
      icon: ShoppingBag,
      iconColor: 'var(--info)',
    },
    {
      label: 'Клиентов',
      value: String(dash?.totalClients ?? 0),
      sub: '+' + (dash?.newClients ?? 0) + ' за месяц',
      delta: 0,
      icon: Users,
      iconColor: 'var(--warning)',
    },
  ]

  const payBreakdown: any[] = dash?.paymentBreakdown ?? []
  const totalPay = payBreakdown.reduce((s: number, p: any) => s + parseFloat(p.total ?? 0), 0)

  const hourlyData: number[] = dash?.hourly ?? Array.from({ length: 24 }, () => Math.floor(Math.random() * 100))
  const maxHourly = Math.max(...hourlyData, 1)
  const currentHour = new Date().getHours()

  const topItems: any[] = productsData?.products?.slice(0, 10) ?? []

  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ padding: '20px 16px 0', position: 'sticky', top: 0, zIndex: 20, background: 'linear-gradient(135deg, #080B14 0%, #0D1526 100%)' }}>
        <p className="label-cap" style={{ marginBottom: 4 }}>АНАЛИТИКА</p>
        <h1 style={{
          fontSize: 24, fontWeight: 900, fontStyle: 'italic', margin: '0 0 16px',
          background: 'linear-gradient(135deg, var(--accent-light), #fff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {format(new Date(), 'd MMMM yyyy', { locale: ru })}
        </h1>

        {/* Period control */}
        <div className="glass-2" style={{ borderRadius: 14, padding: 4, display: 'flex', marginBottom: 20 }}>
          {(['day', 'week', 'month'] as Period[]).map((p) => {
            const labels = { day: 'День', week: 'Неделя', month: 'Месяц' }
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: period === p ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'transparent',
                  color: period === p ? '#fff' : 'var(--text-secondary)',
                  boxShadow: period === p ? '0 2px 12px rgba(var(--accent-rgb),0.3)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {labels[p]}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className="glass-2"
              style={{ borderRadius: 20, padding: '16px', boxShadow: 'var(--sh-card)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: `rgba(${cssVarToRgb(kpi.iconColor)},0.15)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <kpi.icon size={16} color={kpi.iconColor} />
                </div>
                <DeltaBadge delta={kpi.delta} />
              </div>
              <p className="amount" style={{ fontSize: 22, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                {kpi.value}
              </p>
              <p className="label-cap" style={{ margin: 0, color: 'var(--text-muted)' }}>{kpi.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Hourly chart */}
        <div className="glass-2" style={{ borderRadius: 20, padding: '20px 16px', marginBottom: 20, boxShadow: 'var(--sh-card)' }}>
          <p className="label-cap" style={{ marginBottom: 16 }}>ПО ЧАСАМ</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
            {hourlyData.map((val, h) => {
              const height = Math.max(4, (val / maxHourly) * 60)
              const isCurrent = h === currentHour
              return (
                <div
                  key={h}
                  title={`${h}:00 — ${val}`}
                  style={{
                    flex: 1, borderRadius: '4px 4px 0 0', height: height,
                    background: isCurrent
                      ? 'linear-gradient(180deg, var(--accent), var(--accent-dark))'
                      : 'rgba(255,255,255,0.08)',
                    boxShadow: isCurrent ? '0 0 8px rgba(var(--accent-rgb),0.5)' : 'none',
                    transition: 'height 0.4s ease',
                    cursor: 'default',
                  }}
                />
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            {[0, 6, 12, 18, 23].map(h => (
              <span key={h} style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h}:00</span>
            ))}
          </div>
        </div>

        {/* Payment breakdown */}
        {payBreakdown.length > 0 && (
          <div className="glass-2" style={{ borderRadius: 20, padding: '20px 16px', marginBottom: 20, boxShadow: 'var(--sh-card)' }}>
            <p className="label-cap" style={{ marginBottom: 12 }}>МЕТОДЫ ОПЛАТЫ</p>
            {/* Stacked bar */}
            <div style={{ height: 12, borderRadius: 8, display: 'flex', overflow: 'hidden', marginBottom: 14, gap: 2 }}>
              {payBreakdown.map((p: any) => {
                const pct = totalPay > 0 ? (parseFloat(p.total ?? 0) / totalPay) * 100 : 0
                return (
                  <div
                    key={p.method}
                    style={{ width: `${pct}%`, background: PAY_COLORS[p.method] ?? 'var(--accent)', borderRadius: 4, transition: 'width 0.5s' }}
                    title={`${PAY_LABELS[p.method] ?? p.method}: ${pct.toFixed(1)}%`}
                  />
                )
              })}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {payBreakdown.map((p: any) => (
                <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_COLORS[p.method] ?? 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{PAY_LABELS[p.method] ?? p.method}</span>
                  <span className="amount" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                    {parseFloat(p.total ?? 0).toLocaleString('ru')} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top items */}
        {topItems.length > 0 && (
          <div className="glass-2" style={{ borderRadius: 20, padding: '20px 16px', boxShadow: 'var(--sh-card)' }}>
            <p className="label-cap" style={{ marginBottom: 14 }}>ТОП ПОЗИЦИЙ</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topItems.map((item: any, i: number) => {
                const abcIdx = i < 3 ? 0 : i < 6 ? 1 : 2
                return (
                  <div
                    key={item.itemId ?? i}
                    className="glass-3"
                    style={{ borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: `rgba(${cssVarToRgb(ABC_COLORS[abcIdx])},0.15)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: ABC_COLORS[abcIdx],
                    }}>
                      {ABC_LABELS[abcIdx]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        {item.name ?? '—'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p className="amount" style={{ fontSize: 13, margin: 0, color: 'var(--text-primary)' }}>
                        {parseFloat(item.totalRev ?? 0).toLocaleString('ru')} ₽
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
                        {item.totalQty ?? 0} шт.
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(148,163,184,0.1)', borderRadius: 6, padding: '2px 7px' }}>
        <MinusIcon size={10} color="var(--text-muted)" />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>0%</span>
      </div>
    )
  }
  const up = delta > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: up ? 'rgba(52,211,153,0.1)' : 'rgba(251,113,133,0.1)',
      borderRadius: 6, padding: '2px 7px'
    }}>
      {up ? <TrendingUp size={10} color="var(--success)" /> : <TrendingDown size={10} color="var(--danger)" />}
      <span style={{ fontSize: 10, fontWeight: 700, color: up ? 'var(--success)' : 'var(--danger)' }}>
        {up ? '+' : ''}{delta}%
      </span>
    </div>
  )
}

function cssVarToRgb(cssVar: string): string {
  const map: Record<string, string> = {
    'var(--accent)': '139,92,246',
    'var(--accent-light)': '167,139,250',
    'var(--success)': '52,211,153',
    'var(--danger)': '251,113,133',
    'var(--warning)': '251,191,36',
    'var(--info)': '96,165,250',
    'var(--text-muted)': '148,163,184',
  }
  return map[cssVar] ?? '139,92,246'
}
