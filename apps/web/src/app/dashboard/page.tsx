'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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

const ABC_COLORS = ['#8B5CF6', '#60A5FA', 'rgba(204,195,216,0.45)']
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
      label: 'ВЫРУЧКА',
      value: Number(todayRev).toLocaleString('ru') + ' ₽',
      sub: `${todayChecks} чеков`,
      delta: 12,
      icon: 'payments',
      iconColor: '#8B5CF6',
      iconBg: 'rgba(139,92,246,0.1)',
    },
    {
      label: 'СРЕДНИЙ ЧЕК',
      value: avgCheck.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽',
      sub: 'сегодня',
      delta: -3,
      icon: 'receipt_long',
      iconColor: '#4cd7f6',
      iconBg: 'rgba(76,215,246,0.1)',
    },
    {
      label: 'НОВЫЕ ГОСТИ',
      value: String(dash?.newClients ?? 0),
      sub: 'за период',
      delta: 5,
      icon: 'person_add',
      iconColor: '#8B5CF6',
      iconBg: 'rgba(139,92,246,0.1)',
    },
    {
      label: 'ЗА МЕСЯЦ',
      value: Number(monthRev).toLocaleString('ru') + ' ₽',
      sub: `${monthChecks} чеков`,
      delta: 8,
      icon: 'timer',
      iconColor: '#4cd7f6',
      iconBg: 'rgba(76,215,246,0.1)',
    },
  ]

  const payBreakdown: any[] = dash?.paymentBreakdown ?? []
  const totalPay = payBreakdown.reduce((s: number, p: any) => s + parseFloat(p.total ?? 0), 0)
  const topItems: any[] = productsData?.products?.slice(0, 10) ?? []

  const topStaff = [
    { name: 'Александр К.', initials: 'АК', revenue: 45000, checks: 28 },
    { name: 'Мария В.', initials: 'МВ', revenue: 38000, checks: 22 },
    { name: 'Дмитрий С.', initials: 'ДС', revenue: 29000, checks: 18 },
  ]

  const criticalEvents = [
    { icon: 'warning', color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)', text: 'Низкий запас: Американо' },
    { icon: 'error', color: 'var(--danger)', bg: 'rgba(251,113,133,0.1)', text: 'Долг не закрыт: Стол 7' },
    { icon: 'info', color: 'var(--info)', bg: 'rgba(96,165,250,0.1)', text: 'Смена открыта 8+ часов' },
  ]

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Page header */}
      <div style={{
        padding: '24px 32px 0',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(21,18,27,0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>Аналитический дашборд</h1>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
              {format(new Date(), 'd MMMM yyyy', { locale: ru })}
            </p>
          </div>

          {/* Period picker */}
          <div
            className="glass-l2"
            style={{ borderRadius: 14, padding: 4, display: 'flex', gap: 2 }}
          >
            {(['day', 'week', 'month'] as Period[]).map((p) => {
              const labels = { day: 'День', week: 'Неделя', month: 'Месяц' }
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    background: period === p ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'transparent',
                    color: period === p ? '#fff' : 'var(--on-surface-variant)',
                    boxShadow: period === p ? '0 2px 12px rgba(139,92,246,0.3)' : 'none',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {labels[p]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 32px 80px', flex: 1 }}>

        {/* KPI Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}>
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className="glass-l2"
              style={{
                borderRadius: 16,
                padding: 20,
                boxShadow: 'var(--sh-card)',
                transition: 'all 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget
                el.style.border = '1px solid rgba(139,92,246,0.5)'
                el.style.boxShadow = '0 0 20px rgba(139,92,246,0.2)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget
                el.style.border = '1px solid rgba(255,255,255,0.08)'
                el.style.boxShadow = 'var(--sh-card)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: kpi.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.iconColor }}>
                    {kpi.icon}
                  </span>
                </div>
                <DeltaBadge delta={kpi.delta} />
              </div>
              <p style={{
                fontSize: 22, fontWeight: 900, fontStyle: 'italic',
                fontVariantNumeric: 'tabular-nums',
                margin: '0 0 4px',
                color: 'var(--on-surface)',
                lineHeight: 1,
              }}>
                {kpi.value}
              </p>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                margin: '0 0 2px', color: 'var(--on-surface-variant)',
              }}>
                {kpi.label}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)', margin: 0 }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Middle section */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 24,
          marginBottom: 24,
        }}
          className="dashboard-middle"
        >
          {/* ABC analysis table */}
          {topItems.length > 0 && (
            <div className="glass-l2" style={{ borderRadius: 16, padding: 24 }}>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--on-surface-variant)', margin: '0 0 16px',
              }}>
                ABC АНАЛИЗ
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Header row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 100px 60px 36px',
                  gap: 8, padding: '0 0 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  marginBottom: 4,
                }}>
                  {['Позиция', 'Категория', 'Выручка', 'Доля%', 'ABC'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(204,195,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {h}
                    </span>
                  ))}
                </div>
                {topItems.map((item: any, i: number) => {
                  const abcIdx = i < 3 ? 0 : i < 6 ? 1 : 2
                  const totalRev = topItems.reduce((s: number, it: any) => s + parseFloat(it.totalRev ?? 0), 0)
                  const share = totalRev > 0 ? ((parseFloat(item.totalRev ?? 0) / totalRev) * 100).toFixed(1) : '0'
                  return (
                    <div
                      key={item.itemId ?? i}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr 100px 100px 60px 36px',
                        gap: 8, padding: '10px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name ?? '—'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                        {item.category ?? '—'}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)' }}>
                        {parseFloat(item.totalRev ?? 0).toLocaleString('ru')} ₽
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{share}%</span>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: `rgba(${abcIdx === 0 ? '139,92,246' : abcIdx === 1 ? '96,165,250' : '148,163,184'},0.15)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: ABC_COLORS[abcIdx],
                      }}>
                        {ABC_LABELS[abcIdx]}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Payment methods */}
          {payBreakdown.length > 0 && (
            <div className="glass-l2" style={{ borderRadius: 16, padding: 24 }}>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--on-surface-variant)', margin: '0 0 16px',
              }}>
                МЕТОДЫ ОПЛАТЫ
              </p>

              {/* Stacked bar */}
              <div style={{ height: 24, borderRadius: 9999, display: 'flex', overflow: 'hidden', marginBottom: 20, gap: 2 }}>
                {payBreakdown.map((p: any) => {
                  const pct = totalPay > 0 ? (parseFloat(p.total ?? 0) / totalPay) * 100 : 0
                  return (
                    <div
                      key={p.method}
                      style={{
                        width: `${pct}%`, minWidth: pct > 0 ? 4 : 0,
                        background: PAY_COLORS[p.method] ?? '#8B5CF6',
                        transition: 'width 0.5s',
                      }}
                      title={`${PAY_LABELS[p.method] ?? p.method}: ${pct.toFixed(1)}%`}
                    />
                  )
                })}
              </div>

              {/* Legend 2x grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {payBreakdown.map((p: any) => {
                  const pct = totalPay > 0 ? ((parseFloat(p.total ?? 0) / totalPay) * 100).toFixed(0) : '0'
                  return (
                    <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_COLORS[p.method] ?? '#8B5CF6', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {PAY_LABELS[p.method] ?? p.method}
                        </p>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>{pct}%</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
          className="dashboard-bottom"
        >
          {/* Top staff */}
          <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--on-surface-variant)', margin: '0 0 16px',
            }}>
              ТОП СОТРУДНИКОВ
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topStaff.map((s, i) => (
                <div
                  key={s.name}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.05)',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, rgba(139,92,246,${0.3 - i * 0.07}), rgba(76,215,246,${0.3 - i * 0.07}))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#A78BFA',
                  }}>
                    {s.initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>{s.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{s.checks} чеков</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0 }}>
                    {s.revenue.toLocaleString('ru')} ₽
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Critical events */}
          <div className="glass-l2" style={{ borderRadius: 16, padding: 20 }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--on-surface-variant)', margin: '0 0 16px',
            }}>
              КРИТИЧЕСКИЕ СОБЫТИЯ
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {criticalEvents.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: ev.bg,
                    borderLeft: `4px solid ${ev.color}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: ev.color, flexShrink: 0 }}>
                    {ev.icon}
                  </span>
                  <p style={{ fontSize: 13, color: 'var(--on-surface)', margin: 0 }}>{ev.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 1024px) {
          .dashboard-middle, .dashboard-bottom {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(204,195,216,0.1)', borderRadius: 6, padding: '2px 7px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'rgba(204,195,216,0.45)' }}>remove</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(204,195,216,0.45)' }}>0%</span>
      </div>
    )
  }
  const up = delta > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: up ? 'rgba(52,211,153,0.1)' : 'rgba(251,113,133,0.1)',
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
