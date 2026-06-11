'use client'
/**
 * Единый экран «Склад»: дашборд (KPI) + вкладки Остатки · Поставки · Ревизия.
 * Объединяет прежние три раздела (/inventory, /supplies, /revision) в один хаб.
 * Источник истины остатка — журнал движений (stock_movements), остаток = SUM(delta).
 */
import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, formatMoney } from '@/components/manage/DesignSystem'
import { Icon } from '@/components/Icon'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ItemsTab, type ItemsFilter } from './tabs/ItemsTab'
import { SuppliesTab } from './tabs/SuppliesTab'
import { RevisionTab } from './tabs/RevisionTab'

type Tab = 'items' | 'supplies' | 'revision'

interface Overview {
  stockValue: number
  lowStockCount: number
  outOfStockCount: number
  deadStockCount: number
  trackedCount: number
  lastSupplyAt: string | null
  lastRevisionAt: string | null
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'items',    label: 'Остатки',  icon: 'inventory_2' },
  { key: 'supplies', label: 'Поставки', icon: 'local_shipping' },
  { key: 'revision', label: 'Ревизия',  icon: 'fact_check' },
]

function isTab(v: string | null): v is Tab { return v === 'items' || v === 'supplies' || v === 'revision' }

function KpiCard({ icon, color, value, label, onClick, active }: { icon: string; color: string; value: string; label: string; onClick?: () => void; active?: boolean }) {
  const clickable = !!onClick
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className="glass-l2"
      style={{ borderRadius: 16, padding: '12px 14px', textAlign: 'left', cursor: clickable ? 'pointer' : 'default', border: active ? `1px solid ${color}88` : '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
    >
      <Icon name={icon} size={18} color={color} />
      <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{label}</span>
    </button>
  )
}

export default function StockHubPage() {
  const [tab, setTab] = useState<Tab>('items')
  const [itemsFilter, setItemsFilter] = useState<ItemsFilter>('all')

  // Вкладка в URL (?tab=) — без next/navigation, чтобы не требовать Suspense.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (isTab(t)) setTab(t)
  }, [])
  function changeTab(t: Tab) {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    window.history.replaceState(null, '', url.toString())
  }

  const { data: ov } = useQuery<Overview>({
    queryKey: ['inventory-overview'],
    queryFn: () => api.get('/inventory/overview'),
  })

  const subtitle = ov
    ? ov.lowStockCount + ov.outOfStockCount > 0
      ? `${ov.lowStockCount} мало · ${ov.outOfStockCount} нет в наличии`
      : 'Остатки в норме'
    : 'Остатки · поставки · ревизия'

  function goItems(f: ItemsFilter) { setItemsFilter(f); changeTab('items') }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Склад" subtitle={subtitle} />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Дашборд */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="payments" size={22} color="#a78bfa" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Стоимость склада</p>
              <p style={{ fontSize: 22, fontWeight: 800, margin: '1px 0 0', color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(ov?.stockValue ?? 0)}</p>
            </div>
            {ov && ov.deadStockCount > 0 && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#94A3B8', margin: 0, lineHeight: 1 }}>{ov.deadStockCount}</p>
                <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>залежалось</p>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiCard icon="warning" color="#F59E0B" value={String(ov?.lowStockCount ?? 0)} label="Заканчивается" active={tab === 'items' && itemsFilter === 'low'} onClick={() => goItems('low')} />
            <KpiCard icon="remove_shopping_cart" color="#F43F5E" value={String(ov?.outOfStockCount ?? 0)} label="Нет в наличии" active={tab === 'items' && itemsFilter === 'out'} onClick={() => goItems('out')} />
          </div>
          {ov && (ov.lastSupplyAt || ov.lastRevisionAt) && (
            <div style={{ display: 'flex', gap: 16, padding: '0 4px', flexWrap: 'wrap' }}>
              {ov.lastSupplyAt && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Последняя поставка: {format(new Date(ov.lastSupplyAt), 'd MMM', { locale: ru })}</span>}
              {ov.lastRevisionAt && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Последняя ревизия: {format(new Date(ov.lastRevisionAt), 'd MMM', { locale: ru })}</span>}
            </div>
          )}
        </div>

        {/* Переключатель вкладок (segmented) */}
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => changeTab(t.key)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 8px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.15s', background: active ? 'var(--primary-violet)' : 'transparent', color: active ? '#fff' : 'var(--on-surface-variant)' }}>
                <Icon name={t.icon} size={17} color={active ? '#fff' : 'var(--on-surface-variant)'} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Содержимое вкладки */}
        {tab === 'items' && <ItemsTab filter={itemsFilter} setFilter={setItemsFilter} />}
        {tab === 'supplies' && <SuppliesTab />}
        {tab === 'revision' && <RevisionTab />}
      </div>
    </div>
  )
}
