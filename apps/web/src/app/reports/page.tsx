'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { ru } from 'date-fns/locale'

const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }
const INP: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

const PAY_LABELS: Record<string, string> = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', bonus: 'Бонусы', certificate: 'Сертификат', mixed: 'Смешанная' }

type Range = '7d' | '30d' | 'month' | 'custom'

function getRange(range: Range, customFrom: string, customTo: string): [string, string] {
  const now = new Date()
  if (range === '7d') return [format(subDays(now, 6), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')]
  if (range === '30d') return [format(subDays(now, 29), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')]
  if (range === 'month') return [format(startOfMonth(now), 'yyyy-MM-dd'), format(endOfMonth(now), 'yyyy-MM-dd')]
  return [customFrom, customTo]
}

function KpiCard({ label, value, sub, color = '#8B5CF6' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="glass-l2" style={{ borderRadius: 16, padding: '18px 20px' }}>
      <p style={{ ...LBL, marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 900, fontStyle: 'italic', color, margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activeTab, setActiveTab] = useState<'revenue' | 'products' | 'shifts'>('revenue')

  const [from, to] = getRange(range, customFrom, customTo)

  const { data: revData } = useQuery({
    queryKey: ['analytics', 'revenue', from, to],
    queryFn: () => api.get<any>(`/analytics/revenue?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })
  const { data: prodData } = useQuery({
    queryKey: ['analytics', 'products', from, to],
    queryFn: () => api.get<any>(`/analytics/products?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  })
  const { data: dashData } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get<any>('/analytics/dashboard'),
  })

  const days: any[] = revData?.days ?? []
  const totalRevenue = days.reduce((s: number, d: any) => s + parseFloat(d.revenue || 0), 0)
  const totalExpenses = days.reduce((s: number, d: any) => s + parseFloat(d.expenses || 0), 0)
  const totalCogs = days.reduce((s: number, d: any) => s + parseFloat(d.cogs || 0), 0)
  const profit = totalRevenue - totalExpenses - totalCogs
  const checksCount = days.reduce((s: number, d: any) => s + (d.checksCount || 0), 0)
  const avgCheck = checksCount ? totalRevenue / checksCount : 0

  const products: any[] = prodData?.items ?? []
  const totalProdRev = prodData?.totalRev ?? 0
  const payBreakdown: any = dashData?.paymentBreakdown ?? {}

  // Max bar width calc
  const maxDayRev = days.length ? Math.max(...days.map((d: any) => parseFloat(d.revenue || 0))) : 1

  function handlePrint() { window.print() }

  const TABS = [
    { id: 'revenue', label: 'Финансы' },
    { id: 'products', label: 'Товары' },
    { id: 'shifts', label: 'Платежи' },
  ] as const

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Отчёты</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {format(new Date(from), 'd MMM', { locale: ru })} — {format(new Date(to), 'd MMM yyyy', { locale: ru })}
            </p>
          </div>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>Печать
          </button>
        </div>

        {/* Range selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['7d', '30d', 'month', 'custom'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${range === r ? '#8B5CF6' : 'rgba(255,255,255,0.08)'}`, background: range === r ? 'rgba(139,92,246,0.15)' : 'transparent', color: range === r ? '#A78BFA' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {r === '7d' ? '7 дней' : r === '30d' ? '30 дней' : r === 'month' ? 'Месяц' : 'Период'}
            </button>
          ))}
          {range === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...INP, fontSize: 12 }} />
              <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...INP, fontSize: 12 }} />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: activeTab === t.id ? '#A78BFA' : 'var(--on-surface-variant)', borderBottom: activeTab === t.id ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 32px 80px', flex: 1 }}>
        {activeTab === 'revenue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              <KpiCard label="Выручка" value={`${Math.round(totalRevenue).toLocaleString('ru')} ₽`} color="#4cd7f6" />
              <KpiCard label="Прибыль" value={`${Math.round(profit).toLocaleString('ru')} ₽`} color="#10B981" />
              <KpiCard label="Расходы" value={`${Math.round(totalExpenses).toLocaleString('ru')} ₽`} color="#F43F5E" />
              <KpiCard label="Себестоимость" value={`${Math.round(totalCogs).toLocaleString('ru')} ₽`} color="#F59E0B" />
              <KpiCard label="Чеков" value={String(checksCount)} color="#8B5CF6" />
              <KpiCard label="Средний чек" value={`${Math.round(avgCheck).toLocaleString('ru')} ₽`} color="#A78BFA" />
            </div>

            {/* Bar chart */}
            {days.length > 0 && (
              <div className="glass-l2" style={{ borderRadius: 16, padding: '20px' }}>
                <p style={LBL}>Выручка по дням</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {days.map((d: any) => {
                    const rev = parseFloat(d.revenue || 0)
                    const pct = maxDayRev > 0 ? (rev / maxDayRev) * 100 : 0
                    let dateLabel = d.date
                    try { dateLabel = format(new Date(d.date), 'd MMM', { locale: ru }) } catch {}
                    return (
                      <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', width: 52, flexShrink: 0, textAlign: 'right' }}>{dateLabel}</span>
                        <div style={{ flex: 1, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 6, background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)', transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', width: 80, textAlign: 'right', flexShrink: 0 }}>{Math.round(rev).toLocaleString('ru')} ₽</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'products' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ ...LBL, margin: 0 }}>Топ товары</p>
                <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Выручка: {Math.round(totalProdRev).toLocaleString('ru')} ₽</span>
              </div>
              {products.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>Нет данных</div>
              ) : (
                <div>
                  {products.map((p: any, i: number) => {
                    const abcColor = p.abc === 'A' ? '#10B981' : p.abc === 'B' ? '#F59E0B' : '#94A3B8'
                    const barPct = totalProdRev > 0 ? (parseFloat(p.revenue) / totalProdRev) * 100 : 0
                    return (
                      <div key={p.itemId ?? i} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 20, flexShrink: 0 }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: `${abcColor}22`, color: abcColor, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{p.abc}</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barPct}%`, background: abcColor, borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{Math.round(parseFloat(p.revenue || 0)).toLocaleString('ru')} ₽</p>
                          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{parseFloat(p.quantity || 0).toFixed(0)} шт · {parseFloat(p.share || 0).toFixed(1)}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'shifts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Payment breakdown */}
            <div className="glass-l2" style={{ borderRadius: 16, padding: '20px' }}>
              <p style={LBL}>Способы оплаты (текущий месяц)</p>
              {Object.keys(payBreakdown).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 12 }}>Нет данных</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {Object.entries(payBreakdown).map(([method, amount]: [string, any]) => {
                    const total = Object.values(payBreakdown).reduce((s: number, v: any) => s + parseFloat(v), 0)
                    const pct = total > 0 ? (parseFloat(amount) / total) * 100 : 0
                    const COLORS: Record<string, string> = { cash: '#10B981', card: '#3B82F6', transfer: '#8B5CF6', bonus: '#F59E0B', certificate: '#4cd7f6' }
                    const color = COLORS[method] ?? '#94A3B8'
                    return (
                      <div key={method}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[method] ?? method}</span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{Math.round(parseFloat(amount)).toLocaleString('ru')} ₽ · {pct.toFixed(1)}%</span>
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

            {/* Summary table */}
            <div className="glass-l2" style={{ borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ ...LBL, margin: 0 }}>Сводка по периоду</p>
              </div>
              {[
                ['Валовая выручка', `${Math.round(totalRevenue).toLocaleString('ru')} ₽`],
                ['Себестоимость (COGS)', `− ${Math.round(totalCogs).toLocaleString('ru')} ₽`],
                ['Операционные расходы', `− ${Math.round(totalExpenses).toLocaleString('ru')} ₽`],
                ['Валовая прибыль', `${Math.round(profit).toLocaleString('ru')} ₽`],
                ['Количество чеков', String(checksCount)],
                ['Средний чек', `${Math.round(avgCheck).toLocaleString('ru')} ₽`],
              ].map(([k, v], i) => {
                const isLast = i === 5
                const isProfit = i === 3
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)', background: isProfit ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                    <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isProfit ? '#10B981' : 'var(--on-surface)' }}>{v}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .glass-l2 { background: #f5f5f5 !important; border: 1px solid #ddd !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  )
}
