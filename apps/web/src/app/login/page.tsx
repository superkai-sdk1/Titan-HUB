'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { api, ApiError } from '@/lib/api'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | 'login'        // Nickname + password, passkey button
  | 'pin-setup'    // Set 4-digit PIN after first login
  | 'passkey-setup'// Offer to register a passkey

// ─── Utils ────────────────────────────────────────────────────────────────────

function isWebAuthnSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const { setAuth, token, user, _hasHydrated } = useAuthStore()

  useEffect(() => {
    if (!_hasHydrated) return
    if (token) router.replace(user?.role === 'tablet' ? '/tablet' : '/pos')
  }, [token, user, _hasHydrated, router])

  const [screen, setScreen] = useState<Screen>('login')
  const [pendingAuth, setPendingAuth] = useState<{ token: string; user: any } | null>(null)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [webAuthnSupported] = useState(isWebAuthnSupported)

  function afterLogin(token: string, user: any, opts?: { needsPinSetup?: boolean; hasPasskey?: boolean }) {
    setHasPasskey(opts?.hasPasskey ?? false)
    if (opts?.needsPinSetup) {
      setPendingAuth({ token, user })
      setScreen('pin-setup')
    } else {
      setAuth(token, user)
      router.replace(user?.role === 'tablet' ? '/tablet' : '/pos')
    }
  }

  function afterPinSetup() {
    if (!pendingAuth) return
    // Offer passkey if WebAuthn supported and user doesn't have one
    if (webAuthnSupported && !hasPasskey) {
      setScreen('passkey-setup')
    } else {
      finishSetup()
    }
  }

  function finishSetup() {
    if (!pendingAuth) return
    setAuth(pendingAuth.token, pendingAuth.user)
    router.replace(pendingAuth.user?.role === 'tablet' ? '/tablet' : '/pos')
  }

  if (screen === 'pin-setup') {
    return <PinSetupScreen pendingAuth={pendingAuth!} onDone={afterPinSetup} onSkip={afterPinSetup} />
  }

  if (screen === 'passkey-setup') {
    return <PasskeySetupScreen pendingAuth={pendingAuth!} onDone={finishSetup} onSkip={finishSetup} />
  }

  return <LoginScreen onLogin={afterLogin} webAuthnSupported={webAuthnSupported} />
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({
  onLogin,
  webAuthnSupported,
}: {
  onLogin: (token: string, user: any, opts?: { needsPinSetup?: boolean; hasPasskey?: boolean }) => void
  webAuthnSupported: boolean
}) {
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState('')
  const nickRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nickRef.current?.focus() }, [])

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname || !password) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ token: string; user: any; needsPinSetup?: boolean; hasPasskey?: boolean }>(
        '/auth/login/password',
        { nickname, password }
      )
      onLogin(res.token, res.user, { needsPinSetup: res.needsPinSetup, hasPasskey: res.hasPasskey })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Неверный никнейм или пароль')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasskey() {
    setPasskeyLoading(true)
    setError('')
    try {
      // Discoverable credential — no userId needed
      const { options, challengeId } = await api.post<{ options: any; challengeId: string }>(
        '/auth/passkey/authenticate/options',
        {}
      )
      const response = await startAuthentication({ optionsJSON: options })
      const res = await api.post<{ token: string; user: any }>(
        '/auth/passkey/authenticate/verify',
        { challengeId, response }
      )
      onLogin(res.token, res.user, { needsPinSetup: false })
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') return // user cancelled
      setError(e instanceof ApiError ? e.message : 'Ошибка Passkey. Попробуйте пароль.')
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.18) 0%, transparent 70%), #0b0912',
      padding: '20px 16px',
    }}>
      {/* Ambient blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '-10%', left: '20%', width: 400, height: 400,
          borderRadius: '50%', background: 'rgba(139,92,246,0.08)', filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '15%', width: 350, height: 350,
          borderRadius: '50%', background: 'rgba(76,215,246,0.06)', filter: 'blur(80px)',
        }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 20, marginBottom: 16,
            background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
            boxShadow: '0 0 40px rgba(139,92,246,0.4), 0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L29 10.5V21.5L16 29L3 21.5V10.5L16 3Z" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.12)" />
              <path d="M16 9L23 13.5V20.5L16 25L9 20.5V13.5L16 9Z" fill="rgba(255,255,255,0.28)" />
            </svg>
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 900, fontStyle: 'italic', margin: '0 0 6px',
            background: 'linear-gradient(135deg, #A78BFA, #4cd7f6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            TITAN HUB
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, letterSpacing: '0.04em' }}>
            Система управления заведением
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 28,
          padding: '36px 32px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px', textAlign: 'center' }}>
            Вход в систему
          </p>

          <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Nickname field */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Никнейм
              </label>
              <div style={{ position: 'relative' }}>
                <span className="material-symbols-outlined" style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 18, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
                }}>person</span>
                <input
                  ref={nickRef}
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  autoComplete="username"
                  placeholder="Введите никнейм"
                  style={{
                    width: '100%', paddingLeft: 44, paddingRight: 16, paddingTop: 13, paddingBottom: 13,
                    borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)',
                    fontSize: 15, outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Пароль
              </label>
              <div style={{ position: 'relative' }}>
                <span className="material-symbols-outlined" style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 18, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
                }}>lock</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  style={{
                    width: '100%', paddingLeft: 44, paddingRight: 48, paddingTop: 13, paddingBottom: 13,
                    borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)',
                    fontSize: 15, outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.3)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {showPass ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 12,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#FCA5A5', fontSize: 13,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>error</span>
                {error}
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={loading || !nickname || !password}
              style={{
                marginTop: 4, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: (loading || !nickname || !password)
                  ? 'rgba(255,255,255,0.07)'
                  : 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                color: (loading || !nickname || !password) ? 'rgba(255,255,255,0.3)' : '#fff',
                fontWeight: 700, fontSize: 15, letterSpacing: '0.03em',
                transition: 'all 0.2s',
                boxShadow: (loading || !nickname || !password) ? 'none' : '0 4px 20px rgba(139,92,246,0.35)',
              }}
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          {/* Passkey divider + button */}
          {webAuthnSupported && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>или</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>

              <button
                onClick={handlePasskey}
                disabled={passkeyLoading}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: passkeyLoading ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              >
                <PasskeyIcon size={20} />
                {passkeyLoading ? 'Ожидание...' : 'Войти с Passkey / биометрией'}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.06em' }}>
          TITAN HUB · v2.0
        </p>
      </div>
    </div>
  )
}

// ─── PIN Setup Screen ─────────────────────────────────────────────────────────

function PinSetupScreen({
  pendingAuth,
  onDone,
  onSkip,
}: {
  pendingAuth: { token: string; user: any }
  onDone: () => void
  onSkip: () => void
}) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleInput(v: string) {
    setError(false)
    if (step === 'enter') {
      setPin(v)
      if (v.length === 4) setTimeout(() => setStep('confirm'), 200)
    } else {
      setConfirm(v)
      if (v.length === 4) {
        setTimeout(async () => {
          if (v !== pin) {
            setError(true)
            setTimeout(() => { setPin(''); setConfirm(''); setStep('enter'); setError(false) }, 700)
            return
          }
          // Save PIN
          setLoading(true)
          try {
            useAuthStore.setState({ token: pendingAuth.token })
            await api.post('/auth/pin/set', { pin })
            onDone()
          } catch {
            setError(true)
          } finally {
            setLoading(false)
          }
        }, 200)
      }
    }
  }

  const displayPin = step === 'enter' ? pin : confirm

  return (
    <SetupLayout
      icon="pin"
      title="Установите PIN"
      subtitle="4-значный PIN для быстрого входа после блокировки экрана"
      step={1}
      totalSteps={2}
    >
      <PinDots value={displayPin} error={error} />
      <PinPad onChange={handleInput} value={displayPin} loading={loading} />

      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
          {step === 'enter' ? 'Введите PIN' : 'Повторите PIN для подтверждения'}
        </p>
        {error && step === 'confirm' && (
          <p style={{ fontSize: 12, color: '#FCA5A5', margin: 0 }}>PIN-коды не совпадают</p>
        )}
      </div>

      <SkipBtn label="Пропустить — настрою позже" onClick={onSkip} />
    </SetupLayout>
  )
}

// ─── Passkey Setup Screen ──────────────────────────────────────────────────────

function PasskeySetupScreen({
  pendingAuth,
  onDone,
  onSkip,
}: {
  pendingAuth: { token: string; user: any }
  onDone: () => void
  onSkip: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleRegister() {
    setLoading(true)
    setError('')
    try {
      useAuthStore.setState({ token: pendingAuth.token })
      const options = await api.post<any>('/auth/passkey/register/options', {})
      const response = await startRegistration({ optionsJSON: options })
      await api.post('/auth/passkey/register/verify', response)
      setDone(true)
      setTimeout(onDone, 1200)
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') { setLoading(false); return }
      setError(e instanceof ApiError ? e.message : 'Ошибка регистрации Passkey')
      setLoading(false)
    }
  }

  return (
    <SetupLayout
      icon="fingerprint"
      title="Добавить биометрию"
      subtitle="Входите без пароля с помощью Face ID, Touch ID или ключа безопасности"
      step={2}
      totalSteps={2}
    >
      {done ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
            background: 'rgba(16,185,129,0.15)', border: '2px solid #10B981',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 38, color: '#10B981', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#10B981', margin: 0 }}>Passkey добавлен!</p>
        </div>
      ) : (
        <>
          {/* Passkey visual */}
          <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 96, height: 96, borderRadius: 28,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(76,215,246,0.1))',
              border: '1px solid rgba(139,92,246,0.25)',
              marginBottom: 0,
            }}>
              <PasskeyIcon size={48} />
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontWeight: 700, fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 24px rgba(139,92,246,0.35)',
              opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>fingerprint</span>
            {loading ? 'Регистрация...' : 'Добавить Passkey'}
          </button>

          <SkipBtn label="Пропустить — войти в систему" onClick={onSkip} />
        </>
      )}
    </SetupLayout>
  )
}

// ─── Shared Setup Layout ──────────────────────────────────────────────────────

function SetupLayout({
  icon, title, subtitle, step, totalSteps, children,
}: {
  icon: string
  title: string
  subtitle: string
  step: number
  totalSteps: number
  children: React.ReactNode
}) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.15) 0%, transparent 70%), #0b0912',
      padding: '20px 16px',
    }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(139,92,246,0.07)', filter: 'blur(80px)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              width: i + 1 === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i + 1 <= step
                ? 'linear-gradient(135deg, #8B5CF6, #4cd7f6)'
                : 'rgba(255,255,255,0.12)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 28, padding: '36px 28px',
          backdropFilter: 'blur(20px)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: 16, marginBottom: 16,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(76,215,246,0.1))',
              border: '1px solid rgba(139,92,246,0.3)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#A78BFA', fontVariationSettings: "'FILL' 1" }}>
                {icon}
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)', margin: '0 0 8px' }}>{title}</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Pin Dots ─────────────────────────────────────────────────────────────────

function PinDots({ value, error }: { value: string; error: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 28 }}>
      {[0, 1, 2, 3].map(i => {
        const filled = i < value.length
        return (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: filled ? (error ? '#EF4444' : '#8B5CF6') : 'transparent',
            border: `2px solid ${filled ? (error ? '#EF4444' : '#8B5CF6') : 'rgba(255,255,255,0.2)'}`,
            boxShadow: filled && !error ? '0 0 14px rgba(139,92,246,0.7)' : filled && error ? '0 0 14px rgba(239,68,68,0.6)' : 'none',
            transition: 'all 0.15s',
            transform: filled ? 'scale(1.2)' : 'scale(1)',
          }} />
        )
      })}
    </div>
  )
}

// ─── Pin Pad ──────────────────────────────────────────────────────────────────

function PinPad({ onChange, value, loading }: { onChange: (v: string) => void; value: string; loading?: boolean }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  function press(k: string) {
    if (loading) return
    if (k === '⌫') { onChange(value.slice(0, -1)); return }
    if (value.length >= 4) return
    onChange(value + k)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />
        const isDel = k === '⌫'
        return (
          <button
            key={i}
            onClick={() => press(k)}
            disabled={!!loading}
            style={{
              aspectRatio: '1/1', borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.08)',
              background: isDel ? 'transparent' : 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)', fontSize: isDel ? 20 : 24, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.1s', opacity: loading ? 0.5 : 1,
            }}
            onMouseDown={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.2)'; e.currentTarget.style.transform = 'scale(0.92)' }}
            onMouseUp={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            {k}
          </button>
        )
      })}
    </div>
  )
}

// ─── Skip Button ──────────────────────────────────────────────────────────────

function SkipBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <button
        onClick={onClick}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 500 }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
      >
        {label}
      </button>
    </div>
  )
}

// ─── Passkey Icon ─────────────────────────────────────────────────────────────

function PasskeyIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="9" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12.5 13.5L15 11L18 14L21 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19.5C4 17.5 5.8 16 8 16s4 1.5 4 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
