'use client'
// ─── Экран входа суперадмина (bootstrap / login / регистрация пасскея) ────────
//
// Зеркалит passkey-церемонию клубного логина (apps/web/src/app/login/page.tsx):
//   • startRegistration({ optionsJSON }) для создания пасскея;
//   • startAuthentication({ optionsJSON }) для входа по пасскею;
//   • тело verify = результат церемонии напрямую (бэкенд делает c.req.json()).
//
// Контур ОТДЕЛЬНЫЙ: токен пишем через setSaToken (ключ titan_sa_token),
// клубный auth.store не трогаем.
import { useState, useRef, useEffect } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { Icon } from '@/components/Icon'
import { saApi, setSaToken, SaApiError } from '@/lib/superadminApi'
import type {
  BootstrapResult,
  LoginPasswordResult,
  LoginPasskeyVerifyResult,
  PasskeyRegisterVerifyResult,
  PublicKeyCredentialCreationOptionsJSON,
} from './types'
import { SaField, SaInput, SaPrimaryButton, SaErrorBanner } from './ui'

// На вход даём needsBootstrap (из bootstrap-status). По завершении церемонии
// (получен полноценный токен и панель доступна) дёргаем onAuthed.
type Step = 'bootstrap' | 'password' | 'passkey-register'

export function SuperadminAuth({
  needsBootstrap,
  onAuthed,
}: {
  needsBootstrap: boolean
  onAuthed: () => void
}) {
  const [step, setStep] = useState<Step>(needsBootstrap ? 'bootstrap' : 'password')

  return (
    <AuthLayout>
      {step === 'bootstrap' && <BootstrapForm onNext={() => setStep('passkey-register')} />}
      {step === 'password' && (
        <PasswordForm onAuthed={onAuthed} onNeedRegister={() => setStep('passkey-register')} />
      )}
      {step === 'passkey-register' && <PasskeyRegisterStep onDone={onAuthed} />}
    </AuthLayout>
  )
}

// ─── Шаг 1а: создание суперадмина (bootstrap) ─────────────────────────────────

function BootstrapForm({ onNext }: { onNext: () => void }) {
  const [login, setLogin] = useState('superadmin')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Пароль не короче 8 символов')
      return
    }
    setLoading(true)
    setError('')
    try {
      // POST /auth/bootstrap → { token, needsPasskey:true }. Сохраняем короткий
      // токен — он нужен для следующего шага (регистрация пасскея).
      const res = await saApi.post<BootstrapResult>('/auth/bootstrap', { login, password })
      setSaToken(res.token)
      onNext()
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось создать суперадмина')
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormShell
      icon="person"
      title="Создать суперадмина"
      subtitle="Платформа ещё не настроена. Задайте логин и пароль первого суперадмина."
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SaField label="Логин">
          <SaInput value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="superadmin" />
        </SaField>
        <SaField label="Пароль" hint="Минимум 8 символов">
          <div style={{ position: 'relative' }}>
            <SaInput
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Новый пароль"
              style={{ paddingRight: 46 }}
            />
            <PwToggle show={show} onToggle={() => setShow((v) => !v)} />
          </div>
        </SaField>
        {error && <SaErrorBanner message={error} />}
        <SaPrimaryButton type="submit" loading={loading} disabled={!login || !password}>
          {loading ? 'Создание…' : 'Создать и продолжить'}
        </SaPrimaryButton>
      </form>
    </FormShell>
  )
}

// ─── Шаг 1б: вход по логину+паролю ────────────────────────────────────────────

function PasswordForm({ onAuthed, onNeedRegister }: { onAuthed: () => void; onNeedRegister: () => void }) {
  const [login, setLogin] = useState('superadmin')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loginRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loginRef.current?.focus()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!login || !password) return
    setLoading(true)
    setError('')
    try {
      // Ответ — один из двух вариантов:
      const res = await saApi.post<LoginPasswordResult>('/auth/login/password', { login, password })

      if (res.token && !res.challengeId) {
        // Пароль верный, пасскеев ещё нет → сохраняем короткий токен и идём
        // регистрировать пасскей (обязательный второй фактор).
        setSaToken(res.token)
        onNeedRegister()
        return
      }

      if (res.challengeId && res.options) {
        // Есть пасскеи → второй фактор. Запускаем церемонию аутентификации,
        // тело verify = { challengeId, response: <результат церемонии> }.
        const response = await startAuthentication({ optionsJSON: res.options })
        const verified = await saApi.post<LoginPasskeyVerifyResult>('/auth/login/passkey/verify', {
          challengeId: res.challengeId,
          response,
        })
        setSaToken(verified.token)
        onAuthed()
        return
      }

      setError('Неожиданный ответ сервера')
    } catch (e: unknown) {
      const name = (e as { name?: string } | undefined)?.name
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // Пользователь отменил системный диалог пасскея — тихо выходим.
        setError('')
      } else {
        setError(e instanceof SaApiError ? e.message : 'Неверный логин или пароль')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormShell icon="lock" title="Вход суперадмина" subtitle="Панель управления клубами платформы">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SaField label="Логин">
          <SaInput ref={loginRef} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="superadmin" />
        </SaField>
        <SaField label="Пароль">
          <div style={{ position: 'relative' }}>
            <SaInput
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Ваш пароль"
              style={{ paddingRight: 46 }}
            />
            <PwToggle show={show} onToggle={() => setShow((v) => !v)} />
          </div>
        </SaField>
        {error && <SaErrorBanner message={error} />}
        <SaPrimaryButton type="submit" loading={loading} disabled={!login || !password}>
          {loading ? 'Вход…' : 'Войти'}
        </SaPrimaryButton>
      </form>
    </FormShell>
  )
}

// ─── Шаг 2: регистрация пасскея (есть короткий saToken) ───────────────────────

function PasskeyRegisterStep({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function register() {
    setLoading(true)
    setError('')
    try {
      // saToken уже в localStorage — saApi подставит Authorization сам.
      const options = await saApi.post<PublicKeyCredentialCreationOptionsJSON>('/auth/passkey/register/options', {})
      const attResp = await startRegistration({ optionsJSON: options })
      // ВАЖНО: тело verify = результат startRegistration() ЦЕЛИКОМ.
      await saApi.post<PasskeyRegisterVerifyResult>('/auth/passkey/register/verify', attResp)
      setDone(true)
      setTimeout(onDone, 1000)
    } catch (e: unknown) {
      const name = (e as { name?: string } | undefined)?.name
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // Отмена системного диалога — остаёмся на шаге, даём повторить.
        setLoading(false)
        return
      }
      setError(e instanceof SaApiError ? e.message : 'Не удалось зарегистрировать Passkey')
      setLoading(false)
    }
  }

  return (
    <FormShell
      icon="fingerprint"
      title="Регистрация Passkey"
      subtitle="Привяжите Face ID / Touch ID или ключ безопасности — это обязательный второй фактор для входа."
    >
      {done ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              margin: '0 auto 12px',
              background: 'rgba(52,211,153,0.15)',
              border: '2px solid #34D399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check_circle" size={34} color="#34D399" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#34D399', margin: 0 }}>Passkey зарегистрирован!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 88,
                height: 88,
                borderRadius: 24,
                background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(76,215,246,0.1))',
                border: '1px solid rgba(139,92,246,0.25)',
              }}
            >
              <Icon name="fingerprint" size={44} color="#A78BFA" />
            </div>
          </div>
          {error && <SaErrorBanner message={error} />}
          <SaPrimaryButton onClick={register} loading={loading} icon="fingerprint">
            {loading ? 'Регистрация…' : 'Зарегистрировать Passkey'}
          </SaPrimaryButton>
        </div>
      )}
    </FormShell>
  )
}

// ─── Обёртки/хелперы вида ──────────────────────────────────────────────────────

function PwToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.3)',
        padding: 4,
      }}
    >
      <Icon name={show ? 'visibility_off' : 'visibility'} size={18} />
    </button>
  )
}

function FormShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 14,
            marginBottom: 14,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(76,215,246,0.1))',
            border: '1px solid rgba(139,92,246,0.3)',
          }}
        >
          <Icon name={icon} size={26} color="#A78BFA" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.95)', margin: '0 0 6px' }}>{title}</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

// Полноэкранная обёртка экрана входа (фикс-фон, центрирование) — как LoginLayout.
function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.18) 0%, transparent 70%), #0b0912',
        padding: '20px 16px',
      }}
    >
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(139,92,246,0.08)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: 350, height: 350, borderRadius: '50%', background: 'rgba(76,215,246,0.06)', filter: 'blur(80px)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 16,
              marginBottom: 12,
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              boxShadow: '0 0 40px rgba(139,92,246,0.4)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L29 10.5V21.5L16 29L3 21.5V10.5L16 3Z" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.12)" />
              <path d="M16 9L23 13.5V20.5L16 25L9 20.5V13.5L16 9Z" fill="rgba(255,255,255,0.28)" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 900,
              margin: '0 0 4px',
              background: 'linear-gradient(135deg, #A78BFA, #4cd7f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            TITAN PLATFORM
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Панель суперадмина</p>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 28,
            padding: '32px 28px',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
