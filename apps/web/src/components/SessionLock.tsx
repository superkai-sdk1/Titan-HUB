'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore, INACTIVITY_TIMEOUT_MS } from '@/store/auth.store'
import { api } from '@/lib/api'
import { startAuthentication } from '@simplewebauthn/browser'
import { Icon } from '@/components/Icon'

// ─── SessionLock wrapper (activity tracking + interval check) ─────────────────

export function SessionLock() {
  const { token, user, isLocked, lock, unlock, updateActivity } = useAuthStore()
  const pathname = usePathname()

  // Планшеты (role 'tablet') не имеют PIN/passkey — для них блокировка по
  // бездействию означала бы вечную блокировку (выход только через перепривязку).
  // Поэтому планшеты вообще не отслеживаем и не блокируем.
  // Суперадмин-контур (/superadmin) — отдельная авторизация, клубный лок неуместен.
  const isTablet = user?.role === 'tablet' || pathname.startsWith('/superadmin')

  // Track user activity
  useEffect(() => {
    if (!token || isTablet) return
    const handler = () => updateActivity()
    window.addEventListener('mousedown', handler, { passive: true })
    window.addEventListener('touchstart', handler, { passive: true })
    window.addEventListener('keydown', handler, { passive: true })
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('touchstart', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [token, isTablet, updateActivity])

  // Check inactivity every 30 seconds
  useEffect(() => {
    if (!token || isTablet) return
    const interval = setInterval(() => {
      const { lastActiveAt, isLocked: locked } = useAuthStore.getState()
      const idle = Date.now() - lastActiveAt
      if (idle >= INACTIVITY_TIMEOUT_MS && !locked) {
        lock()
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [token, isTablet, lock])

  if (!isLocked || !token || isTablet) return null

  return <LockOverlay user={user} onUnlock={unlock} />
}

// ─── Lock Overlay ─────────────────────────────────────────────────────────────

function LockOverlay({
  user,
  onUnlock,
}: {
  user: { id?: string; nickname: string; role: string; photoUrl: string | null } | null
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const { setAuth } = useAuthStore()

  // Check if WebAuthn is available
  const webAuthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential

  async function handlePin(fullPin: string) {
    setPinLoading(true)
    setErrorMsg('')
    try {
      // Разблокировка строго СВОЕГО профиля: передаём id заблокированного
      // пользователя, чтобы чужой PIN не подходил и не переключал аккаунт.
      const lockedUserId = useAuthStore.getState().user?.id
      const res = await api.post<{ token: string; user: any }>('/auth/login/pin', {
        pin: fullPin,
        userId: lockedUserId,
      })
      // Доп. защита: если по какой-то причине вернулся другой пользователь —
      // не подменяем сессию молча, требуем именно свой PIN.
      if (lockedUserId && res.user?.id && res.user.id !== lockedUserId) {
        throw new Error('wrong-user')
      }
      setAuth(res.token, res.user)
      onUnlock()
    } catch {
      setPinError(true)
      setPin('')
      setErrorMsg('Неверный PIN')
      setTimeout(() => { setPinError(false); setErrorMsg('') }, 1500)
    } finally {
      setPinLoading(false)
    }
  }

  async function handlePasskey() {
    setPasskeyLoading(true)
    setErrorMsg('')
    try {
      const userId = useAuthStore.getState().user?.id
      const { options, challengeId } = await api.post<{ options: any; challengeId: string }>(
        '/auth/passkey/authenticate/options',
        { userId }
      )
      const response = await startAuthentication({ optionsJSON: options })
      const res = await api.post<{ token: string; user: any }>(
        '/auth/passkey/authenticate/verify',
        { challengeId, response }
      )
      // Разблокировка только своего профиля — не подменяем аккаунт чужим passkey.
      if (userId && res.user?.id && res.user.id !== userId) {
        throw new Error('wrong-user')
      }
      setAuth(res.token, res.user)
      onUnlock()
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') { setPasskeyLoading(false); return }
      setErrorMsg('Ошибка Passkey')
      setTimeout(() => setErrorMsg(''), 2000)
      setPasskeyLoading(false)
    }
  }

  function append(digit: string) {
    if (pinLoading || pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) setTimeout(() => handlePin(next), 80)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  const initials = (user?.nickname ?? '?').slice(0, 2).toUpperCase()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>
      {/* Blurred background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(10, 8, 18, 0.92)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
      }} />

      {/* Ambient */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-15%', left: '25%', width: 360, height: 360, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '5%', right: '20%', width: 280, height: 280, borderRadius: '50%', background: 'rgba(76,215,246,0.06)', filter: 'blur(80px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Lock badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28,
          padding: '6px 14px', borderRadius: 99,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Icon name="lock" size={14} color="rgba(167,139,250,0.8)" />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Сессия заблокирована</span>
        </div>

        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', marginBottom: 12,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(76,215,246,0.3))',
          border: '2px solid rgba(139,92,246,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 800, color: '#fff',
          boxShadow: '0 0 32px rgba(139,92,246,0.25)',
        }}>
          {initials}
        </div>

        <p style={{ fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: '0 0 4px' }}>
          {user?.nickname ?? 'Пользователь'}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '0 0 32px' }}>
          Введите PIN для продолжения
        </p>

        {/* PIN dots */}
        <div style={{
          display: 'flex', gap: 18, marginBottom: 28,
          animation: pinError ? 'lock-shake 0.35s ease' : 'none',
        }}>
          {[0,1,2,3].map(i => {
            const filled = i < pin.length
            return (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: filled ? (pinError ? '#EF4444' : '#8B5CF6') : 'transparent',
                border: `2px solid ${filled ? (pinError ? '#EF4444' : '#8B5CF6') : 'rgba(255,255,255,0.2)'}`,
                boxShadow: filled && !pinError ? '0 0 14px rgba(139,92,246,0.7)' : filled && pinError ? '0 0 14px rgba(239,68,68,0.6)' : 'none',
                transition: 'all 0.15s',
                transform: filled ? 'scale(1.2)' : 'scale(1)',
              }} />
            )
          })}
        </div>

        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 10, marginBottom: 20 }}>
          {keys.map((k, idx) => {
            if (k === '') return <div key={idx} />
            const isDel = k === '⌫'
            return (
              <button
                key={idx}
                onClick={() => isDel ? setPin(p => p.slice(0, -1)) : append(k)}
                disabled={pinLoading}
                aria-label={isDel ? 'Стереть' : k}
                style={{
                  width: 72, height: 72, borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: isDel ? 'transparent' : 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.9)', fontSize: isDel ? 20 : 24, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.1s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseDown={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.2)'; e.currentTarget.style.transform = 'scale(0.9)' }}
                onMouseUp={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'scale(1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'scale(1)' }}
              >
                {k}
              </button>
            )
          })}
        </div>

        {/* Error message */}
        {errorMsg && (
          <p style={{ fontSize: 13, color: '#FCA5A5', margin: '0 0 12px', textAlign: 'center' }}>{errorMsg}</p>
        )}

        {/* Passkey button */}
        {webAuthnSupported && (
          <button
            onClick={handlePasskey}
            disabled={passkeyLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              transition: 'all 0.2s', marginBottom: 20,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            <PasskeyIcon size={18} />
            {passkeyLoading ? 'Ожидание...' : 'Войти с Passkey'}
          </button>
        )}

        {/* Logout */}
        <LogoutBtn />
      </div>

      <style>{`
        @keyframes lock-shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-5px); }
          80%       { transform: translateX(5px); }
        }
      `}</style>
    </div>
  )
}

function LogoutBtn() {
  const { logout } = useAuthStore()
  const [confirm, setConfirm] = useState(false)
  if (confirm) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setConfirm(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13 }}>
          Отмена
        </button>
        <button onClick={logout} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '8px 16px', color: '#FCA5A5', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Выйти
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={() => setConfirm(true)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 500 }}
      onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
    >
      Выйти из аккаунта
    </button>
  )
}

function PasskeyIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="9" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12.5 13.5L15 11L18 14L21 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19.5C4 17.5 5.8 16 8 16s4 1.5 4 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
