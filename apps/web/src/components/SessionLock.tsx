'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

const LOCK_AFTER_MS = 30 * 60 * 1000 // 30 minutes

export function SessionLock() {
  const { token, user, isLocked, lock, unlock, updateActivity } = useAuthStore()

  // Track activity
  useEffect(() => {
    if (!token) return
    const handler = () => updateActivity()
    window.addEventListener('mousedown', handler, { passive: true })
    window.addEventListener('touchstart', handler, { passive: true })
    window.addEventListener('keydown', handler, { passive: true })
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('touchstart', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [token, updateActivity])

  // Reset activity timer on page load (reload = user is present)
  useEffect(() => {
    if (!token) return
    updateActivity()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check inactivity every minute (only locks while page is open and idle)
  useEffect(() => {
    if (!token) return

    const interval = setInterval(() => {
      const lastActiveAt = useAuthStore.getState().lastActiveAt
      const idle = Date.now() - lastActiveAt
      if (idle >= LOCK_AFTER_MS && !useAuthStore.getState().isLocked) {
        lock()
      }
    }, 60_000)

    return () => clearInterval(interval)
  }, [token, lock])

  if (!isLocked || !token) return null

  return <PinLockOverlay user={user} onUnlock={unlock} />
}

function PinLockOverlay({
  user,
  onUnlock,
}: {
  user: { nickname: string; role: string; photoUrl: string | null } | null
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()

  async function handlePin(fullPin: string) {
    setLoading(true)
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login/pin', { pin: fullPin })
      setAuth(res.token, res.user)
      onUnlock()
    } catch {
      setError(true)
      setPin('')
      setTimeout(() => setError(false), 600)
    } finally {
      setLoading(false)
    }
  }

  function append(digit: string) {
    if (loading || pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) setTimeout(() => handlePin(next), 80)
  }

  const dots = [0, 1, 2, 3]
  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,12,20,0.97)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 style={{
          fontSize: 28, fontWeight: 900, fontStyle: 'italic',
          background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          margin: '0 0 8px',
        }}>
          TITAN HUB
        </h1>
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>
          Сессия заблокирована
        </p>
      </div>

      {/* Avatar */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(76,215,246,0.3))',
        border: '2px solid rgba(139,92,246,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
        fontSize: 26, fontWeight: 700, color: '#A78BFA',
      }}>
        {(user?.nickname ?? '?').slice(0, 2).toUpperCase()}
      </div>

      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', marginBottom: 4 }}>
        {user?.nickname ?? 'Пользователь'}
      </p>
      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginBottom: 32 }}>
        Введите PIN для разблокировки
      </p>

      {/* PIN dots */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 40,
        animation: error ? 'pin-shake 0.35s ease' : 'none',
      }}>
        {dots.map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < pin.length
              ? (error ? '#F43F5E' : '#8B5CF6')
              : 'rgba(255,255,255,0.15)',
            transition: 'background 0.15s, transform 0.1s',
            transform: i < pin.length ? 'scale(1.2)' : 'scale(1)',
            boxShadow: i < pin.length && !error ? '0 0 12px rgba(139,92,246,0.6)' : 'none',
          }} />
        ))}
      </div>

      {/* Keypad */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 72px)',
        gap: 12,
      }}>
        {PAD.map((key, idx) => {
          if (key === '') return <div key={idx} />
          const isDelete = key === '⌫'
          return (
            <button
              key={idx}
              onClick={() => isDelete ? setPin(p => p.slice(0, -1)) : append(key)}
              disabled={loading}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.1)',
                background: isDelete ? 'transparent' : 'rgba(255,255,255,0.07)',
                color: 'var(--on-surface)', fontSize: isDelete ? 20 : 24, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { if (!isDelete) e.currentTarget.style.background = 'rgba(139,92,246,0.2)' }}
              onMouseLeave={e => { if (!isDelete) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
            >
              {key}
            </button>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#F43F5E', marginTop: 24 }}>Неверный PIN</p>
      )}

      <style>{`
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
