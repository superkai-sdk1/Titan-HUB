'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useCurrentShift, useOpenShift, useCloseShift } from '@/hooks/useShift'
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
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
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
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(204,195,216,0.3)', animation: 'spin 1s linear infinite' }}>refresh</span>
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
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: s.color }}>{s.icon}</span>
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
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8B5CF6' }}>receipt</span>
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

// ─── Open shift modal ─────────────────────────────────────────────────────────
function OpenShiftModal({ onClose }: { onClose: () => void }) {
  const openShift = useOpenShift()
  const [cashStart, setCashStart] = useState('0')
  const [eveningType, setEveningType] = useState('none')
  const [note, setNote] = useState('')

  async function handleOpen() {
    await openShift.mutateAsync({ cashStart: Number(cashStart), eveningType, note: note || undefined })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Открыть смену</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>Касса в начале (₽)</label>
            <input
              type="number" value={cashStart} onChange={e => setCashStart(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>Тип вечера</label>
            <select
              value={eveningType} onChange={e => setEveningType(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              {Object.entries(EVENING_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>Заметка (необязательно)</label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Особые условия..."
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 14, cursor: 'pointer' }}>Отмена</button>
            <button
              onClick={handleOpen} disabled={openShift.isPending}
              style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: openShift.isPending ? 'not-allowed' : 'pointer', opacity: openShift.isPending ? 0.7 : 1 }}
            >
              {openShift.isPending ? 'Открываем...' : 'Открыть смену'}
            </button>
          </div>

          {openShift.isError && (
            <p style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
              {(openShift.error as any)?.message ?? 'Ошибка открытия смены'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Close shift modal ────────────────────────────────────────────────────────
function CloseShiftModal({ onClose, onClosed }: { onClose: () => void; onClosed: (result: any) => void }) {
  const closeShift = useCloseShift()
  const [cashEnd, setCashEnd] = useState('0')

  const { data: cashBalance } = useQuery({
    queryKey: ['shifts', 'cash-balance'],
    queryFn: () => api.get<any>('/shifts/cash-balance'),
  })

  const expected = parseNum(cashBalance?.expected)
  const actual = Number(cashEnd) || 0
  const diff = actual - expected

  async function handleClose() {
    const res = await closeShift.mutateAsync({ cashEnd: actual })
    onClosed(res)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Закрыть смену</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Expected cash breakdown */}
          <div className="glass-l2" style={{ borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cashBalance ? 10 : 0 }}>
              <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Ожидаемая касса</span>
              <span style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: '#10B981' }}>
                {fmt(expected)} ₽
              </span>
            </div>
            {cashBalance && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                {[
                  ['Начало смены', fmt(parseNum(cashBalance.cashStart)), '+'],
                  ['Наличные платежи', fmt(parseNum(cashBalance.cashPayments)), '+'],
                  ...(parseNum(cashBalance.deposits) > 0 ? [['Внесения', fmt(parseNum(cashBalance.deposits)), '+']] : []),
                  ...(parseNum(cashBalance.withdrawals) > 0 ? [['Изъятия', fmt(parseNum(cashBalance.withdrawals)), '−']] : []),
                ].map(([label, val, sign]) => (
                  <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--on-surface-variant)' }}>
                    <span>{label}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', color: sign === '−' ? '#F87171' : 'rgba(204,195,216,0.7)' }}>{sign} {val} ₽</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>Фактическая касса (₽)</label>
            <input
              type="number" value={cashEnd} onChange={e => setCashEnd(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Discrepancy */}
          {cashEnd !== '0' && (
            <div style={{
              borderRadius: 12, padding: 14,
              background: diff === 0 ? 'rgba(16,185,129,0.08)' : diff > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(244,63,94,0.08)',
              border: `1px solid ${diff === 0 ? '#10B981' : diff > 0 ? '#F59E0B' : '#F43F5E'}33`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: diff === 0 ? '#10B981' : diff > 0 ? '#F59E0B' : '#F43F5E', flexShrink: 0 }}>
                {diff === 0 ? 'check_circle' : diff > 0 ? 'arrow_circle_up' : 'arrow_circle_down'}
              </span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
                  {diff === 0 ? 'Касса совпадает' : diff > 0 ? 'Излишек' : 'Недостача'}
                </p>
                {diff !== 0 && (
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>
                    {diff > 0 ? '+' : ''}{fmt(diff)} ₽
                  </p>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 14, cursor: 'pointer' }}>Отмена</button>
            <button
              onClick={handleClose} disabled={closeShift.isPending}
              style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #F43F5E, #DC2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: closeShift.isPending ? 'not-allowed' : 'pointer', opacity: closeShift.isPending ? 0.7 : 1 }}
            >
              {closeShift.isPending ? 'Закрываем...' : 'Закрыть смену'}
            </button>
          </div>

          {closeShift.isError && (
            <p style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
              {(closeShift.error as any)?.message ?? 'Ошибка закрытия смены'}
            </p>
          )}
        </div>
      </div>
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

      {/* Header */}
      <div style={{
        padding: '24px 32px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>Смены</h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
            {format(new Date(), 'd MMMM yyyy', { locale: ru })}
          </p>
        </div>

        {!shift && (
          <button
            onClick={() => setShowOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 14,
              border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Открыть смену
          </button>
        )}
      </div>

      <div style={{ padding: '24px 32px 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>

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
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>stop_circle</span>
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
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>
              schedule
            </span>
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
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: row.shift.status === 'open' ? '#10B981' : 'rgba(204,195,216,0.5)' }}>
                    {row.shift.status === 'open' ? 'radio_button_checked' : 'check_circle'}
                  </span>
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
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(204,195,216,0.3)', flexShrink: 0 }}>
                    chevron_right
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showOpen && <OpenShiftModal onClose={() => setShowOpen(false)} />}
      {showClose && <CloseShiftModal onClose={() => setShowClose(false)} onClosed={() => setShowClose(false)} />}
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
