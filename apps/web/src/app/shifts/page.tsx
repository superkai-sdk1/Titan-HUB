'use client'
import { useState, useRef } from 'react'
import { Icon } from '@/components/Icon'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useCurrentShift } from '@/hooks/useShift'
import { OpenShiftModal, CloseShiftModal } from '@/components/ShiftModals'
import { PageHeader } from '@/components/manage/DesignSystem'
import { formatDistanceToNow, format } from 'date-fns'
import { ru } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────
type AnalyticsTab = 'overview' | 'checks' | 'products' | 'players'

const PAY_COLORS: Record<string, string> = {
  cash: '#10B981', card: '#3B82F6', transfer: '#8B5CF6',
  bonus: '#F59E0B', deposit: '#06B6D4', certificate: '#14B8A6', debt: '#F43F5E',
}
const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'Перевод',
  bonus: 'Бонусы', deposit: 'Депозит', certificate: 'Сертификат', debt: 'Долг',
}

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }
function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }

function MonoLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--on-surface-variant)', margin: '0 0 14px',
      ...style,
    }}>
      {children}
    </p>
  )
}

// ─── Evening type labels ──────────────────────────────────────────────────────
const EVENING_LABELS: Record<string, string> = {
  none: 'Обычный',
  sport_mafia: 'Спортивная мафия',
  city_mafia: 'Городская мафия',
  kids_mafia: 'Детская мафия',
  board_games: 'Настольные игры',
}

// ─── ShiftAnalytics component ─────────────────────────────────────────────────
function ShiftAnalytics({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const [tab, setTab] = useState<AnalyticsTab>('overview')
  const touchStartX = useRef<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'shift', shiftId],
    queryFn: () => api.get<any>(`/analytics/shifts/${shiftId}`),
  })

  const tabs: { key: AnalyticsTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Итоги', icon: 'summarize' },
    { key: 'checks', label: 'Чеки', icon: 'receipt_long' },
    { key: 'products', label: 'Товары', icon: 'inventory_2' },
    { key: 'players', label: 'Игроки', icon: 'group' },
  ]

  const TAB_KEYS: AnalyticsTab[] = ['overview', 'checks', 'products', 'players']

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(dx) > 50) {
      const idx = TAB_KEYS.indexOf(tab)
      if (dx > 0 && idx < TAB_KEYS.length - 1) setTab(TAB_KEYS[idx + 1])
      if (dx < 0 && idx > 0) setTab(TAB_KEYS[idx - 1])
    }
    touchStartX.current = null
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,8,14,0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="glass-l1"
        style={{
          width: '100%', maxWidth: 800, maxHeight: '90vh',
          borderRadius: 24, display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>Аналитика смены</h2>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>Детальный отчёт</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--on-surface-variant)',
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid #8B5CF6' : '2px solid transparent',
                color: tab === t.key ? '#8B5CF6' : 'var(--on-surface-variant)',
                fontSize: 12, fontWeight: tab === t.key ? 600 : 400,
                transition: 'all 0.2s', marginBottom: -1,
              }}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content — свайп меняет вкладку */}
        <div
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 24 }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <Icon name="refresh" size={32} color="rgba(204,195,216,0.3)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <>
              {tab === 'overview' && <OverviewTab data={data} />}
              {tab === 'checks' && <ChecksTab checks={data?.checks ?? []} />}
              {tab === 'products' && <ProductsTab items={data?.topItems ?? []} />}
              {tab === 'players' && <ShiftPlayersTab players={data?.playerStats ?? []} />}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── ShiftAnalytics sub-tabs ──────────────────────────────────────────────────
function OverviewTab({ data }: { data: any }) {
  const ov = data?.overview ?? {}
  const payments: any[] = data?.payments ?? []
  const totalPay = payments.reduce((s: number, p: any) => s + parseNum(p.total), 0)

  const stats = [
    { label: 'ВЫРУЧКА', value: `${fmt(parseNum(ov.totalRevenue))} ₽`, icon: 'payments', color: '#8B5CF6' },
    { label: 'ЧЕКОВ', value: String(ov.checksCount ?? 0), icon: 'receipt_long', color: '#4cd7f6' },
    { label: 'СРЕДНИЙ ЧЕК', value: `${fmt(parseNum(ov.avgCheck))} ₽`, icon: 'bar_chart', color: '#10B981' },
    { label: 'ИГРОКОВ', value: String(ov.uniquePlayers ?? 0), icon: 'group', color: '#F59E0B' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} className="glass-l2" style={{ borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Icon name={s.icon} size={18} color={s.color} />
            </div>
            <p style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: '0 0 4px', color: 'var(--on-surface)' }}>{s.value}</p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Payment breakdown */}
      {payments.length > 0 && (
        <div className="glass-l2" style={{ borderRadius: 14, padding: 18 }}>
          <MonoLabel>МЕТОДЫ ОПЛАТЫ</MonoLabel>
          <div style={{ height: 16, borderRadius: 9999, display: 'flex', overflow: 'hidden', marginBottom: 14, gap: 2 }}>
            {payments.map((p: any) => {
              const pct = totalPay > 0 ? (parseNum(p.total) / totalPay) * 100 : 0
              return (
                <div key={p.method} style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, background: PAY_COLORS[p.method] ?? '#8B5CF6' }} />
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payments.map((p: any) => {
              const pct = totalPay > 0 ? ((parseNum(p.total) / totalPay) * 100).toFixed(0) : '0'
              return (
                <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_COLORS[p.method] ?? '#8B5CF6', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--on-surface-variant)' }}>{PAY_LABELS[p.method] ?? p.method}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseNum(p.total))} ₽</span>
                  <span style={{ fontSize: 11, color: 'rgba(204,195,216,0.4)', width: 32, textAlign: 'right' }}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ChecksTab({ checks }: { checks: any[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {checks.length === 0 && (
        <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Чеков нет</p>
      )}
      {checks.map((ch: any) => (
        <div key={ch.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgba(139,92,246,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="receipt" size={18} color="#8B5CF6" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>
              Стол {ch.tableNumber ?? '—'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>
              {ch.createdAt ? format(new Date(ch.createdAt), 'HH:mm', { locale: ru }) : '—'}
            </p>
          </div>
          <p style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>
            {fmt(parseNum(ch.totalAmount))} ₽
          </p>
        </div>
      ))}
    </div>
  )
}

function ProductsTab({ items }: { items: any[] }) {
  const ABC_COLORS: Record<string, string> = { A: '#8B5CF6', B: '#3B82F6', C: 'rgba(204,195,216,0.45)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.length === 0 && (
        <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет продаж</p>
      )}
      {items.map((item: any, i: number) => (
        <div key={item.itemId ?? i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `rgba(${item.abc === 'A' ? '139,92,246' : item.abc === 'B' ? '59,130,246' : '148,163,184'},0.15)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: ABC_COLORS[item.abc ?? 'C'], flexShrink: 0,
          }}>
            {item.abc ?? 'C'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name ?? '—'}</p>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>×{parseNum(item.totalQty).toFixed(0)} · {item.category ?? ''}</p>
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>
            {fmt(parseNum(item.totalRev))} ₽
          </p>
        </div>
      ))}
    </div>
  )
}

function ShiftPlayersTab({ players }: { players: any[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {players.length === 0 && (
        <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '20px 0' }}>Нет данных</p>
      )}
      {players.map((sp: any, i: number) => {
        const initials = (sp.nickname ?? '??').slice(0, 2).toUpperCase()
        return (
          <div key={sp.playerId ?? i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, rgba(139,92,246,0.25), rgba(76,215,246,0.25))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#A78BFA',
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>{sp.nickname ?? 'Гость'}</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{sp.cnt ?? 0} чека(ов)</p>
            </div>
            <p style={{ fontSize: 14, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>
              {fmt(parseNum(sp.total))} ₽
            </p>
          </div>
        )
      })}
    </div>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────
export default function ShiftsPage() {
  const { data: shift } = useCurrentShift()

  const { data: historyData } = useQuery({
    queryKey: ['shifts', 'history'],
    queryFn: () => api.get<{ shifts: any[] }>('/shifts/history'),
  })

  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [analyticsShiftId, setAnalyticsShiftId] = useState<string | null>(null)

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title="Смены"
        subtitle={format(new Date(), 'd MMMM yyyy', { locale: ru })}
        action={!shift ? { label: 'Открыть смену', icon: 'add', onClick: () => setShowOpen(true) } : undefined}
      />

      <div style={{ padding: '20px 16px var(--bottom-nav-clear, 24px)', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 680, margin: '0 auto', width: '100%' }}>

        {/* Current shift card */}
        {shift ? (
          <div className="glass-l2" style={{
            borderRadius: 20, padding: 24,
            border: '1px solid rgba(16,185,129,0.25)',
            background: 'rgba(16,185,129,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', background: '#10B981',
                  boxShadow: '0 0 8px rgba(16,185,129,0.6)',
                  animation: 'pulse 2s infinite',
                  flexShrink: 0,
                }} />
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Смена открыта</p>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
                    {formatDistanceToNow(new Date(shift.openedAt), { locale: ru, addSuffix: true })}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowClose(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 12,
                  border: '1px solid rgba(244,63,94,0.3)',
                  background: 'rgba(244,63,94,0.08)',
                  color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(244,63,94,0.16)'
                  e.currentTarget.style.borderColor = 'rgba(244,63,94,0.5)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(244,63,94,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'
                }}
              >
                <Icon name="stop_circle" size={16} />
                Закрыть смену
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { label: 'НАЧАЛО', value: format(new Date(shift.openedAt), 'HH:mm', { locale: ru }) },
                { label: 'КАССА', value: `${fmt(parseNum(shift.cashStart))} ₽` },
                { label: 'ТИП ВЕЧЕРА', value: EVENING_LABELS[shift.eveningType] ?? shift.eveningType },
              ].map(item => (
                <div key={item.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px' }}>{item.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {shift.note && (
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 0 }}>
                📝 {shift.note}
              </p>
            )}
          </div>
        ) : (
          <div className="glass-l2" style={{ borderRadius: 20, padding: 32, textAlign: 'center' }}>
            <Icon name="schedule" size={48} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)', margin: '0 0 6px' }}>Смена не открыта</p>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 24px' }}>Откройте смену, чтобы начать принимать чеки</p>
            <button
              onClick={() => setShowOpen(true)}
              style={{
                padding: '12px 32px', borderRadius: 14,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                color: '#fff', fontSize: 14, fontWeight: 700,
                boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
              }}
            >
              Открыть смену
            </button>
          </div>
        )}

        {/* Shift history */}
        <div>
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--on-surface-variant)', margin: '0 0 14px',
          }}>
            ИСТОРИЯ СМЕН
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!historyData?.shifts?.length && (
              <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '16px 0' }}>Истории нет</p>
            )}
            {historyData?.shifts?.map((row: any) => (
              <div
                key={row.shift.id}
                className="glass-l2"
                style={{
                  borderRadius: 14, padding: '14px 18px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  cursor: row.shift.status === 'closed' ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
                onClick={() => { if (row.shift.status === 'closed') setAnalyticsShiftId(row.shift.id) }}
                onMouseEnter={e => { if (row.shift.status === 'closed') { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.3)' } }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)' }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: row.shift.status === 'open' ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={row.shift.status === 'open' ? 'radio_button_checked' : 'check_circle'} size={20} color={row.shift.status === 'open' ? '#10B981' : 'rgba(204,195,216,0.5)'} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
                      {format(new Date(row.shift.openedAt), 'd MMMM yyyy', { locale: ru })}
                    </p>
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      padding: '2px 8px', borderRadius: 6,
                      background: row.shift.status === 'open' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)',
                      color: row.shift.status === 'open' ? '#10B981' : 'rgba(204,195,216,0.4)',
                    }}>
                      {row.shift.status === 'open' ? 'Открыта' : 'Закрыта'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
                    {row.openedByNickname ?? 'Неизвестно'} · {format(new Date(row.shift.openedAt), 'HH:mm', { locale: ru })}
                    {row.shift.closedAt ? ` — ${format(new Date(row.shift.closedAt), 'HH:mm', { locale: ru })}` : ''}
                  </p>
                </div>

                {row.shift.status === 'closed' && (
                  <Icon name="chevron_right" size={18} color="rgba(204,195,216,0.3)" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <OpenShiftModal open={showOpen} onClose={() => setShowOpen(false)} />
      <CloseShiftModal open={showClose} onClose={() => setShowClose(false)} />
      {analyticsShiftId && <ShiftAnalytics shiftId={analyticsShiftId} onClose={() => setAnalyticsShiftId(null)} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
