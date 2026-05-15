'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useCurrentShift, useOpenShift } from '@/hooks/useShift'
import { formatDistanceToNow, differenceInMinutes } from 'date-fns'
import { ru } from 'date-fns/locale'

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

function getTimerColor(createdAt: string) {
  const mins = differenceInMinutes(new Date(), new Date(createdAt))
  if (mins < 30) return 'var(--text-secondary)'
  if (mins < 60) return 'var(--warning)'
  return 'var(--danger)'
}

function getInitials(name?: string) {
  if (!name) return 'Г'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
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

  const shiftTypeLabels: Record<string, string> = {
    none: 'Обычная',
    sport_mafia: 'Спорт мафия',
    city_mafia: 'Городская мафия',
    kids_mafia: 'Детская мафия',
    board_games: 'Настольные игры',
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'transparent', position: 'relative' }}>

      {/* Shift header */}
      {shift && (
        <div style={{ padding: '12px 16px 0', position: 'sticky', top: 0, zIndex: 30 }}>
          <div className="glass-1" style={{
            borderRadius: 'var(--r-full)', padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pulse-dot" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {shiftTypeLabels[shift.eveningType ?? 'none'] ?? 'Смена'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {formatDistanceToNow(new Date(shift.openedAt), { locale: ru })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>в кассе</span>
              <span className="amount" style={{ fontSize: 15, color: 'var(--success)' }}>
                {Number(shift.cashStart ?? 0).toLocaleString('ru')} ₽
              </span>
            </div>
          </div>
        </div>
      )}

      {/* No shift overlay */}
      {!shiftLoading && !shift && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-2"
            style={{ borderRadius: 28, padding: '40px 32px', maxWidth: 360, width: '100%', textAlign: 'center' }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 20, marginLeft: 'auto', marginRight: 'auto',
              background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--accent-rgb),0.05))',
              border: '1px solid rgba(var(--accent-rgb),0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5">
                <path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <h2 className="drawer-title" style={{ fontSize: 20, marginBottom: 8, color: 'var(--text-primary)' }}>СМЕНА НЕ ОТКРЫТА</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 28 }}>
              Откройте смену чтобы начать работу
            </p>
            <button
              onClick={() => setShowOpenShift(true)}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                boxShadow: 'var(--sh-button)',
              }}
            >
              Открыть смену
            </button>
          </motion.div>
        </div>
      )}

      {/* Checks grid */}
      <div style={{ padding: '16px 16px 110px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>

        <AnimatePresence>
          {checks.map((check, idx) => {
            const timerColor = getTimerColor(check.createdAt)
            const mins = differenceInMinutes(new Date(), new Date(check.createdAt))
            const isOverdue = mins >= 60
            return (
              <motion.button
                key={check.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.04, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push(`/pos/${check.id}`)}
                className="glass-2"
                style={{
                  borderRadius: 20, padding: '16px 14px',
                  boxShadow: 'var(--sh-card)',
                  textAlign: 'left', cursor: 'pointer', border: 'none',
                  display: 'flex', flexDirection: 'column', gap: 0,
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Top: avatar + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.3), rgba(var(--accent-2-rgb),0.3))',
                    border: '1px solid rgba(var(--accent-rgb),0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: 'var(--accent-light)',
                  }}>
                    {getInitials(check.guestName)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {check.guestName || 'Гость'}
                    </p>
                    {check.spaceName && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{check.spaceName}</p>
                    )}
                  </div>
                </div>

                {/* Timer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  {isOverdue && <span className="pulse-dot danger" style={{ width: 6, height: 6 }} />}
                  <span style={{ fontSize: 11, color: timerColor, fontWeight: 500 }}>
                    {formatDistanceToNow(new Date(check.createdAt), { locale: ru })}
                  </span>
                </div>

                {/* Amount */}
                <p className="amount" style={{ fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>
                  {parseFloat(check.totalAmount).toLocaleString('ru')} ₽
                </p>

                {check.itemCount > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {check.itemCount} поз.
                  </p>
                )}

                {/* Bottom progress line for rental */}
                {check.hasRental && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), #06B6D4)' }} />
                )}
              </motion.button>
            )
          })}
        </AnimatePresence>

        {/* New check slot */}
        {shift && !isLoading && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => createCheck.mutate({})}
            disabled={createCheck.isPending}
            style={{
              borderRadius: 20, padding: '16px 14px', cursor: 'pointer',
              background: 'rgba(var(--accent-rgb),0.03)',
              border: '1.5px dashed rgba(var(--accent-rgb),0.3)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              minHeight: 130,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.25), rgba(var(--accent-2-rgb),0.25))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Plus size={18} color="var(--accent-light)" />
            </div>
            <span className="label-cap" style={{ color: 'var(--accent-light)' }}>НОВЫЙ ЧЕК</span>
          </motion.button>
        )}

        {/* Skeletons */}
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 140, borderRadius: 20 }} />
        ))}
      </div>

      {/* FAB */}
      {shift && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => createCheck.mutate({})}
          disabled={createCheck.isPending}
          className="glow-pulse"
          style={{
            position: 'fixed', bottom: 88, right: 16,
            width: 56, height: 56, borderRadius: 18, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--sh-button)', zIndex: 50,
          }}
        >
          <Plus size={28} />
        </motion.button>
      )}

      {/* Open shift drawer */}
      <AnimatePresence>
        {showOpenShift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
            onClick={e => { if (e.target === e.currentTarget) setShowOpenShift(false) }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="glass-1"
              style={{ width: '100%', borderRadius: '32px 32px 0 0', padding: '24px 24px 40px', boxShadow: 'var(--sh-drawer)' }}
            >
              {/* Drag indicator */}
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 24px' }} />

              <h2 className="drawer-title" style={{ fontSize: 20, marginBottom: 24, color: 'var(--text-primary)' }}>
                ОТКРЫТЬ СМЕНУ
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="label-cap" style={{ display: 'block', marginBottom: 8 }}>Наличные в начале</label>
                  <input
                    type="number"
                    value={cashStart}
                    onChange={e => setCashStart(e.target.value)}
                    className="glass-2"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid var(--l2-border)', color: 'var(--text-primary)', fontSize: 15, outline: 'none', background: 'none' }}
                  />
                </div>
                <div>
                  <label className="label-cap" style={{ display: 'block', marginBottom: 8 }}>Тип вечера</label>
                  <select
                    value={eveningType}
                    onChange={e => setEveningType(e.target.value)}
                    className="glass-2"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid var(--l2-border)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', background: 'var(--l2-bg)' }}
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
                    className="glass-2"
                    style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid var(--l2-border)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, background: 'none' }}
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
                      background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                      color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                      boxShadow: 'var(--sh-button)', opacity: openShift.isPending ? 0.6 : 1,
                    }}
                  >
                    Открыть
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
