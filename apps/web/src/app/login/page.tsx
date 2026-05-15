'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
      <div
        className="bg-mesh"
        style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
      >
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div className="glass-l1" style={{ borderRadius: 32, padding: '48px 40px' }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
              color: 'var(--on-surface-variant)', textAlign: 'center', marginBottom: 8,
            }}>
              TITAN HUB
            </p>
            <h2 style={{
              fontSize: 24, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase',
              textAlign: 'center', marginBottom: 4,
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              УСТАНОВИТЕ PIN
            </h2>
            <p style={{ color: 'var(--on-surface-variant)', textAlign: 'center', marginBottom: 32, fontSize: 13 }}>
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
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-mesh"
      style={{
        minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px', position: 'relative',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div
          className="glass-l1"
          style={{ borderRadius: 32, padding: '48px 40px', boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(139,92,246,0.06)' }}
        >

          {/* Logo + title */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 8px 32px rgba(139,92,246,0.4)',
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M18 4L32 12V24L18 32L4 24V12L18 4Z" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.15)" />
                <path d="M18 10L26 15V25L18 30L10 25V15L18 10Z" fill="rgba(255,255,255,0.25)" />
              </svg>
            </div>
            <h1 style={{
              fontSize: 24, fontWeight: 900, fontStyle: 'italic', margin: 0,
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 16px rgba(139,92,246,0.5))',
            }}>
              TITAN HUB
            </h1>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 13, margin: '6px 0 0' }}>
              ВХОД В СИСТЕМУ
            </p>
          </div>

          {/* Tab switcher */}
          <div className="glass-l2" style={{ borderRadius: 14, padding: 4, display: 'flex', marginBottom: 28 }}>
            {(['pin', 'password'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                  background: tab === t ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'transparent',
                  color: tab === t ? '#fff' : 'var(--on-surface-variant)',
                  boxShadow: tab === t ? '0 4px 12px rgba(139,92,246,0.3)' : 'none',
                }}
              >
                {t === 'pin' ? 'PIN' : 'ПАРОЛЬ'}
              </button>
            ))}
          </div>

          {tab === 'pin' ? (
            <div>
              <PinDots value={pin} error={pinError} shakeKey={shakeKey.current} />
              <PinPad onPress={appendPin} onDelete={deletePin} disabled={loading} />
            </div>
          ) : (
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
                  background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                  color: '#fff', fontSize: 13, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                  opacity: (loading || !nickname || !password) ? 0.5 : 1,
                  transition: 'opacity 0.2s, transform 0.1s',
                }}
              >
                {loading ? 'ВХОД...' : 'ВОЙТИ'}
              </button>
            </form>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', textAlign: 'center', marginTop: 12, fontSize: 13 }}>
              {error}
            </p>
          )}

          {/* Footer row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(204,195,216,0.35)' }}>
              v 2.0
            </span>
            {tab === 'pin' && (
              <button
                onClick={() => { setTab('password'); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A78BFA', fontSize: 12, fontWeight: 500 }}
              >
                Забыли PIN?
              </button>
            )}
          </div>
        </div>

        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center', marginTop: 16,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(204,195,216,0.25)',
        }}>
          v 2.0 · build 2506
        </p>
      </div>
    </div>
  )
}

function PinDots({ value, error, shakeKey = 0 }: { value: string; error: boolean; shakeKey?: number }) {
  return (
    <div
      key={shakeKey}
      className={error ? 'shake' : ''}
      style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 32 }}
    >
      {Array.from({ length: 4 }).map((_, i) => {
        const filled = value.length > i
        return (
          <div
            key={i}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: error ? 'var(--danger)' : filled ? '#8B5CF6' : 'transparent',
              border: `2px solid ${error ? 'var(--danger)' : filled ? '#8B5CF6' : 'rgba(255,255,255,0.15)'}`,
              boxShadow: filled && !error ? '0 0 12px rgba(139,92,246,0.6)' : error ? '0 0 12px rgba(251,113,133,0.6)' : 'none',
              transition: 'all 0.15s',
              transform: filled ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        )
      })}
    </div>
  )
}

function PinPad({ onPress, onDelete, disabled }: { onPress: (d: string) => void; onDelete: () => void; disabled?: boolean }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => k === '⌫' ? onDelete() : onPress(k)}
            className="glass-l2"
            style={{
              aspectRatio: '1/1', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer', background: 'rgba(255,255,255,0.04)',
              color: 'var(--on-surface)', fontSize: 22, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: disabled ? 0.5 : 1,
              backdropFilter: 'blur(8px)',
              transition: 'background 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.9)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {k}
          </button>
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
        fontSize: active ? 10 : 14,
        fontWeight: active ? 700 : 400,
        color: focused ? '#A78BFA' : 'var(--on-surface-variant)',
        letterSpacing: active ? '0.06em' : 0,
        textTransform: active ? 'uppercase' : 'none',
        transition: 'all 0.2s',
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
        className="glass-l2"
        style={{
          width: '100%',
          paddingTop: active ? 22 : 14,
          paddingBottom: active ? 8 : 14,
          paddingLeft: 16, paddingRight: 16,
          borderRadius: 14,
          border: `1px solid ${focused ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          color: 'var(--on-surface)', fontSize: 15, outline: 'none',
          transition: 'border-color 0.2s',
          boxShadow: focused ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none',
        }}
      />
    </div>
  )
}
