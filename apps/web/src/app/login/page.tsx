'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/auth.store'
import { api, ApiError } from '@/lib/api'

type Tab = 'pin' | 'password'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [tab, setTab] = useState<Tab>('pin')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [nickFocused, setNickFocused] = useState(false)
  const [passFocused, setPassFocused] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [needsPinSetup, setNeedsPinSetup] = useState(false)
  const [pendingAuth, setPendingAuth] = useState<{ token: string; user: any } | null>(null)
  const shakeKey = useRef(0)

  async function handlePinLogin(fullPin: string) {
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login/pin', { pin: fullPin })
      setAuth(res.token, res.user)
      router.replace('/pos')
    } catch (e) {
      setPinError(true)
      shakeKey.current++
      setError(e instanceof ApiError ? e.message : 'Неверный PIN')
      setPin('')
      setTimeout(() => setPinError(false), 600)
    } finally {
      setLoading(false)
    }
  }

  function appendPin(digit: string) {
    if (loading) return
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) setTimeout(() => handlePinLogin(next), 80)
  }

  function deletePin() {
    setPin(p => p.slice(0, -1))
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ token: string; user: any; needsPinSetup?: boolean }>('/auth/login/password', { nickname, password })
      if (res.needsPinSetup) {
        setPendingAuth({ token: res.token, user: res.user })
        setNeedsPinSetup(true)
      } else {
        setAuth(res.token, res.user)
        router.replace('/pos')
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetPin() {
    if (newPin.length !== 4 || !pendingAuth) return
    setLoading(true)
    try {
      useAuthStore.setState({ token: pendingAuth.token })
      await api.post('/auth/pin/set', { pin: newPin })
      setAuth(pendingAuth.token, pendingAuth.user)
      router.replace('/pos')
    } catch {
      setError('Ошибка установки PIN')
    } finally {
      setLoading(false)
    }
  }

  if (needsPinSetup) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', maxWidth: 400 }}
        >
          <div className="glass-1" style={{ borderRadius: 28, padding: '40px 32px' }}>
            <p className="label-cap" style={{ textAlign: 'center', marginBottom: 8 }}>TITAN HUB</p>
            <h2 className="drawer-title" style={{ fontSize: 24, textAlign: 'center', marginBottom: 4, background: 'linear-gradient(135deg, var(--accent), #fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              УСТАНОВИТЕ PIN
            </h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 32, fontSize: 13 }}>
              Придумайте 4-значный PIN для быстрого входа
            </p>
            <PinDots value={newPin} error={false} />
            <PinPad onPress={d => {
              if (newPin.length < 4) {
                const next = newPin + d
                setNewPin(next)
                if (next.length === 4) setTimeout(() => handleSetPin(), 200)
              }
            }} onDelete={() => setNewPin(p => p.slice(0, -1))} />
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginTop: 16, fontSize: 13 }}>{error}</p>}
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', position: 'relative' }}>
      {/* Background orbs */}
      <div style={{ position: 'fixed', top: '-10vmax', left: '-10vmax', width: '45vmax', height: '45vmax', borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)', filter: 'blur(110px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-8vmax', right: '-8vmax', width: '40vmax', height: '40vmax', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.16) 0%, transparent 70%)', filter: 'blur(110px)', pointerEvents: 'none', zIndex: 0 }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}
      >
        <div className="glass-1" style={{ borderRadius: 28, padding: '40px 32px', boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(139,92,246,0.06)' }}>

          {/* Logo + title */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'linear-gradient(135deg, #6366F1, #7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 8px 32px rgba(139,92,246,0.4)'
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M18 4L32 12V24L18 32L4 24V12L18 4Z" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.15)" />
                <path d="M18 10L26 15V25L18 30L10 25V15L18 10Z" fill="rgba(255,255,255,0.25)" />
              </svg>
            </div>
            <p className="label-cap" style={{ marginBottom: 4, letterSpacing: '0.15em' }}>TITAN HUB</p>
            <h1 className="drawer-title" style={{
              fontSize: 22, margin: 0,
              background: 'linear-gradient(135deg, var(--accent-light), #fff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              ВХОД В СИСТЕМУ
            </h1>
          </div>

          {/* Tab switcher */}
          <div className="glass-2" style={{ borderRadius: 14, padding: 4, display: 'flex', marginBottom: 28 }}>
            {(['pin', 'password'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  transition: 'all 0.2s',
                  background: tab === t ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'transparent',
                  color: tab === t ? '#fff' : 'var(--text-secondary)',
                  boxShadow: tab === t ? '0 4px 12px rgba(var(--accent-rgb),0.3)' : 'none',
                }}
              >
                {t === 'pin' ? 'PIN' : 'ПАРОЛЬ'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === 'pin' ? (
              <motion.div key="pin" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
                <PinDots value={pin} error={pinError} shakeKey={shakeKey.current} />
                <PinPad onPress={appendPin} onDelete={deletePin} disabled={loading} />
              </motion.div>
            ) : (
              <motion.div key="password" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <FloatInput
                    label="Никнейм"
                    value={nickname}
                    onChange={setNickname}
                    focused={nickFocused}
                    onFocus={() => setNickFocused(true)}
                    onBlur={() => setNickFocused(false)}
                    autoComplete="username"
                  />
                  <FloatInput
                    label="Пароль"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    focused={passFocused}
                    onFocus={() => setPassFocused(true)}
                    onBlur={() => setPassFocused(false)}
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={loading || !nickname || !password}
                    style={{
                      marginTop: 8, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                      color: '#fff', fontSize: 13, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      boxShadow: 'var(--sh-button)',
                      opacity: (loading || !nickname || !password) ? 0.5 : 1,
                      transition: 'opacity 0.2s, transform 0.1s',
                    }}
                  >
                    {loading ? 'ВХОД...' : 'ВОЙТИ'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--danger)', textAlign: 'center', marginTop: 12, fontSize: 13 }}>
              {error}
            </motion.p>
          )}

          {/* Footer row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
            <span className="label-cap" style={{ color: 'var(--text-muted)' }}>v 2.0</span>
            {tab === 'pin' && (
              <button
                onClick={() => { setTab('password'); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-accent)', fontSize: 12, fontWeight: 500 }}
              >
                Забыли PIN?
              </button>
            )}
          </div>
        </div>

        <p className="label-cap" style={{ textAlign: 'center', marginTop: 16, color: 'var(--text-muted)' }}>
          v 2.0 · build 2506
        </p>
      </motion.div>
    </div>
  )
}

function PinDots({ value, error, shakeKey = 0 }: { value: string; error: boolean; shakeKey?: number }) {
  return (
    <div
      key={shakeKey}
      className={error ? 'shake' : ''}
      style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}
    >
      {Array.from({ length: 4 }).map((_, i) => {
        const filled = value.length > i
        return (
          <motion.div
            key={i}
            animate={{
              scale: filled ? 1.15 : 1,
              backgroundColor: error ? 'var(--danger)' : filled ? 'var(--accent)' : 'transparent',
              boxShadow: filled && !error ? '0 0 12px rgba(var(--accent-rgb),0.6)' : error ? '0 0 12px rgba(251,113,133,0.6)' : 'none',
            }}
            transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              border: `2px solid ${error ? 'var(--danger)' : filled ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
            }}
          />
        )
      })}
    </div>
  )
}

function PinPad({ onPress, onDelete, disabled }: { onPress: (d: string) => void; onDelete: () => void; disabled?: boolean }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />
        return (
          <motion.button
            key={i}
            disabled={disabled}
            whileTap={{ scale: 0.9, backgroundColor: 'rgba(var(--accent-rgb),0.2)' }}
            onClick={() => k === '⌫' ? onDelete() : onPress(k)}
            style={{
              aspectRatio: '1/1', borderRadius: 18, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)', fontSize: 22, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: disabled ? 0.5 : 1,
              backdropFilter: 'blur(8px)',
              transition: 'background 0.15s',
            }}
          >
            {k}
          </motion.button>
        )
      })}
    </div>
  )
}

function FloatInput({
  label, value, onChange, type = 'text', focused, onFocus, onBlur, autoComplete
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; focused: boolean; onFocus: () => void; onBlur: () => void; autoComplete?: string
}) {
  const active = focused || value.length > 0
  return (
    <div style={{ position: 'relative' }}>
      <label style={{
        position: 'absolute', left: 16,
        top: active ? 8 : '50%',
        transform: active ? 'none' : 'translateY(-50%)',
        fontSize: active ? 10 : 14, fontWeight: active ? 700 : 400,
        color: focused ? 'var(--accent-light)' : 'var(--text-secondary)',
        letterSpacing: active ? '0.06em' : 0,
        textTransform: active ? 'uppercase' : 'none',
        transition: 'all 0.2s var(--c-spring)',
        pointerEvents: 'none', zIndex: 1,
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        style={{
          width: '100%', paddingTop: active ? 22 : 14, paddingBottom: active ? 8 : 14,
          paddingLeft: 16, paddingRight: 16,
          borderRadius: 14, border: `1px solid ${focused ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
          color: 'var(--text-primary)', fontSize: 15, outline: 'none',
          transition: 'border-color 0.2s',
          boxShadow: focused ? '0 0 0 3px rgba(var(--accent-rgb),0.15)' : 'none',
        }}
      />
    </div>
  )
}
