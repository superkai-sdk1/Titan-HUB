'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Users, ShoppingBag, DollarSign } from 'lucide-react'
import { api } from '@/lib/api'

type Tab = 'finance' | 'products' | 'clients'

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('finance')

  const { data: dash } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get<any>('/analytics/dashboard'),
  })

  const { data: revenueData } = useQuery({
    queryKey: ['analytics', 'revenue'],
    queryFn: () => api.get<any>('/analytics/revenue'),
    enabled: tab === 'finance',
  })

  const { data: productsData } = useQuery({
    queryKey: ['analytics', 'products'],
    queryFn: () => api.get<any>('/analytics/products'),
    enabled: tab === 'products',
  })

  const { data: clientsData } = useQuery({
    queryKey: ['analytics', 'clients'],
    queryFn: () => api.get<any>('/analytics/clients'),
    enabled: tab === 'clients',
  })

  const todayRev = dash?.today?.revenue ?? 0
  const todayChecks = dash?.today?.checks ?? 0
  const monthRev = dash?.month?.revenue ?? 0
  const monthChecks = dash?.month?.checks ?? 0

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30 px-4 py-3 safe-top">
        <h1 className="text-lg font-bold">Аналитика</h1>
      </div>

      <div className="px-4 py-4">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl bg-surface border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-primary/10"><DollarSign size={16} className="text-primary" /></div>
              <span className="text-xs text-muted-foreground">Сегодня</span>
            </div>
            <p className="text-2xl font-bold">{Number(todayRev).toLocaleString('ru')} ₽</p>
            <p className="text-xs text-muted-foreground mt-1">{todayChecks} чеков</p>
          </div>
          <div className="rounded-2xl bg-surface border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-green-500/10"><TrendingUp size={16} className="text-green-400" /></div>
              <span className="text-xs text-muted-foreground">30 дней</span>
            </div>
            <p className="text-2xl font-bold">{Number(monthRev).toLocaleString('ru')} ₽</p>
            <p className="text-xs text-muted-foreground mt-1">{monthChecks} чеков</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-surface mb-4 p-1">
          {([['finance', 'Финансы'], ['products', 'Товары'], ['clients', 'Клиенты']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Finance tab */}
        {tab === 'finance' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Выручка по дням</h3>
            {revenueData?.revenue?.map((row: any) => {
              const maxRev = Math.max(...(revenueData.revenue.map((r: any) => parseFloat(r.revenue ?? 0))))
              const pct = maxRev ? (parseFloat(row.revenue ?? 0) / maxRev) * 100 : 0
              return (
                <div key={row.date} className="rounded-xl bg-surface border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{row.date}</span>
                    <span className="text-sm font-semibold">{parseFloat(row.revenue ?? 0).toLocaleString('ru')} ₽</span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.count} чеков</p>
                </div>
              )
            })}

            {/* Payment breakdown */}
            {dash?.paymentBreakdown?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mt-4 mb-3">Методы оплаты</h3>
                <div className="space-y-2">
                  {dash.paymentBreakdown.map((p: any) => (
                    <div key={p.method} className="flex items-center justify-between rounded-xl bg-surface border border-border p-3">
                      <span className="text-sm">{p.method}</span>
                      <span className="text-sm font-semibold">{parseFloat(p.total ?? 0).toLocaleString('ru')} ₽</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Products tab */}
        {tab === 'products' && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Топ товары за 30 дней</h3>
            {productsData?.products?.map((p: any, i: number) => (
              <div key={p.itemId ?? i} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
                <span className="text-lg font-bold text-muted-foreground/30 w-8 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{p.totalQty ?? 0} шт.</p>
                </div>
                <p className="text-sm font-semibold">{parseFloat(p.totalRev ?? 0).toLocaleString('ru')} ₽</p>
              </div>
            ))}
          </div>
        )}

        {/* Clients tab */}
        {tab === 'clients' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">Всего клиентов</p>
                <p className="text-2xl font-bold">{clientsData?.total ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-surface border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">За 30 дней</p>
                <p className="text-2xl font-bold">{clientsData?.newThisMonth ?? 0}</p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">По уровням</h3>
              <div className="space-y-2">
                {clientsData?.tierDist?.map((t: any) => (
                  <div key={t.tier} className="flex items-center justify-between rounded-xl bg-surface border border-border p-3">
                    <span className="text-sm capitalize">{t.tier}</span>
                    <span className="text-sm font-semibold">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
