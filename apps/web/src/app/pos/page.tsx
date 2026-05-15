'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useCurrentShift, useOpenShift } from '@/hooks/useShift'
import { differenceInMinutes } from 'date-fns'

interface CheckCard {
  id: string
  createdAt: string
  totalAmount: string
  itemCount: number
  status: string
  note?: string
  guestName?: string
  spaceName?: string
  hasRental?: boolean
}

function getTimerColor(createdAt: string): string {
  const mins = differenceInMinutes(new Date(), new Date(createdAt))
  if (mins < 30) return 'var(--on-surface-variant)'
  if (mins < 60) return 'var(--warning)'
  return 'var(--danger)'
}

function formatElapsed(createdAt: string): string {
  const mins = differenceInMinutes(new Date(), new Date(createdAt))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

function getInitials(name?: string): string {
  if (!name) return 'Г'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function isWarning(createdAt: string): boolean {
  return differenceInMinutes(new Date(), new Date(createdAt)) >= 30
}

const PAY_METHOD_COLORS: Record<string, string> = {
  cash: 'var(--pay-cash)',
  card: 'var(--pay-card)',
  transfer: 'var(--pay-split)',
  bonus: 'var(--pay-bonus)',
  deposit: 'var(--pay-deposit)',
  certificate: 'var(--pay-cert)',
}

export default function PosPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const { data: shift, isLoading: shiftLoading } = useCurrentShift()
  const openShift = useOpenShift()

  const { data: checksData, isLoading } = useQuery({
    queryKey: ['checks', 'active'],
    queryFn: () => api.get<{ checks: CheckCard[] }>('/pos/checks'),
    refetchInterval: 5000,
    enabled: !!shift,
  })

  const createCheck = useMutation({
    mutationFn: (body: { note?: string }) => api.post<{ check: { id: string } }>('/pos/checks', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['checks'] })
      router.push(`/pos/${res.check.id}`)
    },
  })

  const [showOpenShift, setShowOpenShift] = useState(false)
  const [cashStart, setCashStart] = useState('0')
  const [eveningType, setEveningType] = useState('none')

  const checks = checksData?.checks ?? []
  const avgTime = checks.length
    ? Math.round(checks.reduce((acc, c) => acc + differenceInMinutes(new Date(), new Date(c.createdAt)), 0) / checks.length)
    : 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Page header */}
      <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>Активные Счета</h2>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
              {checks.length} открытых счёт{checks.length === 1 ? '' : checks.length < 5 ? 'а' : 'ов'}
            </p>
          </div>
          {shift && checks.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                className="glass-l2"
                style={{ borderRadius: 999, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>schedule</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>
                  Среднее время: {avgTime}м
                </span>
              </div>
              <div
                className="glass-l2"
                style={{ borderRadius: 999, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>groups</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>
                  Гостей: {checks.length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cards grid — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 20,
          paddingBottom: 24,
        }}>

          {/* Skeleton loading */}
          {isLoading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: 20 }} />
          ))}

          {/* Check cards */}
          {checks.map((check) => {
            const warn = isWarning(check.createdAt)
            const timerColor = getTimerColor(check.createdAt)
            return (
              <button
                key={check.id}
                onClick={() => router.push(`/pos/${check.id}`)}
                className="glass-l2"
                style={{
                  borderRadius: 20,
                  padding: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  transition: 'all 0.3s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1.02)'
                  el.style.border = '1px solid rgba(139,92,246,0.5)'
                  el.style.boxShadow = '0 0 20px rgba(139,92,246,0.2)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1)'
                  el.style.border = '1px solid rgba(255,255,255,0.08)'
                  el.style.boxShadow = 'none'
                }}
              >
                {/* Top: avatar + info + badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(76,215,246,0.3))',
                    border: '1px solid rgba(139,92,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#A78BFA',
                  }}>
                    {getInitials(check.guestName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {check.guestName || 'Гость'}
                    </p>
                    {check.spaceName && (
                      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{check.spaceName}</p>
                    )}
                  </div>
                  <div style={{
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.3)',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#A78BFA',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}>
                    Открыт
                  </div>
                </div>

                {/* Amount */}
                <p style={{
                  fontSize: 28,
                  fontWeight: 900,
                  fontStyle: 'italic',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--on-surface)',
                  margin: '0 0 10px',
                  lineHeight: 1,
                }}>
                  {parseFloat(check.totalAmount).toLocaleString('ru')} ₽
                </p>

                {/* Bottom: timer + items */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, color: timerColor }}
                    >
                      {warn ? 'warning' : 'schedule'}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: timerColor,
                      animation: warn ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                    }}>
                      {formatElapsed(check.createdAt)}
                    </span>
                  </div>
                  {check.itemCount > 0 && (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      fontSize: 11,
                      color: 'var(--on-surface-variant)',
                    }}>
                      {check.itemCount} поз.
                    </span>
                  )}
                </div>

                {/* Rental stripe */}
                {check.hasRental && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)',
                  }} />
                )}
              </button>
            )
          })}

          {/* New check slot */}
          {shift && !isLoading && (
            <button
              onClick={() => createCheck.mutate({})}
              disabled={createCheck.isPending}
              style={{
                borderRadius: 20,
                padding: 14,
                cursor: 'pointer',
                background: 'rgba(139,92,246,0.03)',
                border: '1.5px dashed rgba(139,92,246,0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                minHeight: 160,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(139,92,246,0.08)'
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(139,92,246,0.03)'
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(76,215,246,0.25))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#A78BFA' }}>add</span>
              </div>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#A78BFA',
              }}>
                НОВЫЙ ЧЕК
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      {shift && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(29,26,36,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '16px 32px',
          display: 'flex',
          gap: 12,
        }}>
          <button
            onClick={() => createCheck.mutate({})}
            disabled={createCheck.isPending}
            className="glass-l2"
            style={{
              padding: '12px 20px',
              borderRadius: 14,
              border: '1px solid rgba(139,92,246,0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#A78BFA',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              transition: 'all 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
            НОВЫЙ СЧЁТ
          </button>
          <button
            className="glass-l2"
            style={{
              padding: '12px 20px',
              borderRadius: 14,
              border: '1px solid rgba(76,215,246,0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#4cd7f6',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>table_restaurant</span>
            СХЕМА ЗАЛА
          </button>
          <button
            className="glass-l2"
            style={{
              padding: '12px 20px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--on-surface-variant)',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span>
            ОТЧЁТ СМЕНЫ
          </button>
        </div>
      )}

      {/* No active shift overlay */}
      {!shiftLoading && !shift && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(21,18,27,0.8)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div
            className="glass-l1"
            style={{ borderRadius: 32, padding: '48px 40px', maxWidth: 380, width: '100%', textAlign: 'center' }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 24, marginLeft: 'auto', marginRight: 'auto',
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: '#A78BFA' }}>schedule</span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', marginBottom: 8, color: 'var(--on-surface)' }}>
              СМЕНА НЕ ОТКРЫТА
            </h2>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 13, marginBottom: 28 }}>
              Откройте смену чтобы начать работу
            </p>
            <button
              onClick={() => setShowOpenShift(true)}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
              }}
            >
              Открыть смену
            </button>
          </div>
        </div>
      )}

      {/* Open shift modal */}
      {showOpenShift && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowOpenShift(false) }}
        >
          <div
            className="glass-l1"
            style={{
              width: '100%', borderRadius: '32px 32px 0 0', padding: '24px 24px 40px',
              boxShadow: 'var(--sh-drawer)',
            }}
          >
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 24px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', marginBottom: 24, color: 'var(--on-surface)' }}>
              ОТКРЫТЬ СМЕНУ
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                  Наличные в начале
                </label>
                <input
                  type="number"
                  value={cashStart}
                  onChange={e => setCashStart(e.target.value)}
                  className="glass-l2"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 15, outline: 'none', background: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                  Тип вечера
                </label>
                <select
                  value={eveningType}
                  onChange={e => setEveningType(e.target.value)}
                  className="glass-l2"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.04)' }}
                >
                  <option value="none">Обычный</option>
                  <option value="sport_mafia">Спортивная мафия</option>
                  <option value="city_mafia">Городская мафия</option>
                  <option value="kids_mafia">Детская мафия</option>
                  <option value="board_games">Настольные игры</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => setShowOpenShift(false)}
                  className="glass-l2"
                  style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, background: 'none' }}
                >
                  Отмена
                </button>
                <button
                  onClick={async () => {
                    await openShift.mutateAsync({ cashStart: Number(cashStart), eveningType })
                    setShowOpenShift(false)
                  }}
                  disabled={openShift.isPending}
                  style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                    color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                    boxShadow: '0 4px 20px rgba(139,92,246,0.35)', opacity: openShift.isPending ? 0.6 : 1,
                  }}
                >
                  Открыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
