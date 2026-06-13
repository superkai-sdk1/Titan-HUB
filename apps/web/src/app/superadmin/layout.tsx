'use client'
// ─── Layout / auth-гейт панели суперадмина для всех /superadmin/* ──────────────
//
// Контур ОТДЕЛЬНЫЙ от клубной авторизации: свой токен (titan_sa_token), свой
// API-клиент (saApi). Клубный auth.store здесь не используется.
//
// Поток на маунте (перенесён из старого page.tsx):
//   1) GET /auth/bootstrap-status → needsBootstrap.
//   2) Если needsBootstrap ИЛИ нет saToken → экран входа (SuperadminAuth).
//   3) Иначе → шелл (шапка + <main>{children}</main>).
//
// Контекст SaAuthContext.signalUnauthorized() позволяет страницам переключить
// на экран входа при SaApiError.status===401 (saApi уже почистил токен сам).
import { createContext, useContext, useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { saApi, getSaToken, clearSaToken } from '@/lib/superadminApi'
import type { BootstrapStatus } from './types'
import { SuperadminAuth } from './SuperadminAuth'
import { SaButton, SaSpinner } from './ui'

// Фон-обёртка панели (общая для всех состояний).
const SHELL_BG =
  'radial-gradient(ellipse 90% 50% at 50% -10%, rgba(139,92,246,0.12) 0%, transparent 70%), #15121b'

type Phase =
  | { kind: 'loading' }
  | { kind: 'auth'; needsBootstrap: boolean }
  | { kind: 'shell' }

// ─── Контекст 401 ──────────────────────────────────────────────────────────────

const SaAuthContext = createContext<{ signalUnauthorized: () => void }>({
  signalUnauthorized: () => {},
})

// Хук для страниц: вызвать в catch при SaApiError.status===401 → покажет вход.
export function useSaUnauthorized(): () => void {
  return useContext(SaAuthContext).signalUnauthorized
}

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const status = await saApi.get<BootstrapStatus>('/auth/bootstrap-status')
        if (!alive) return
        // Если требуется bootstrap — всегда ведём на экран создания суперадмина
        // (даже если в localStorage завалялся протухший токен).
        if (status.needsBootstrap) {
          setPhase({ kind: 'auth', needsBootstrap: true })
          return
        }
        // Платформа настроена. Есть токен — показываем шелл; нет — вход.
        setPhase(getSaToken() ? { kind: 'shell' } : { kind: 'auth', needsBootstrap: false })
      } catch {
        if (!alive) return
        // Не смогли получить статус (сеть/401). Безопасный дефолт — экран входа
        // без bootstrap. saApi уже почистил токен, если был 401.
        setPhase({ kind: 'auth', needsBootstrap: false })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function logout() {
    clearSaToken()
    setPhase({ kind: 'auth', needsBootstrap: false })
  }

  // 401 при работе страниц — токен протух: чистим и возвращаем на вход.
  function signalUnauthorized() {
    clearSaToken()
    setPhase({ kind: 'auth', needsBootstrap: false })
  }

  if (phase.kind === 'loading') {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: SHELL_BG,
        }}
      >
        <SaSpinner />
      </div>
    )
  }

  if (phase.kind === 'auth') {
    return (
      <SuperadminAuth
        needsBootstrap={phase.needsBootstrap}
        onAuthed={() => setPhase({ kind: 'shell' })}
      />
    )
  }

  return (
    <SaAuthContext.Provider value={{ signalUnauthorized }}>
      <div style={{ minHeight: '100dvh', background: SHELL_BG, color: '#e8dfee' }}>
        {/* Шапка */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(21,18,27,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '16px 20px',
          }}
        >
          <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 0 24px rgba(139,92,246,0.35)',
              }}
            >
              <Icon name="store" size={20} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Суперадмин</h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Платформа TITAN</p>
            </div>
            <SaButton variant="secondary" icon="logout" onClick={logout}>
              Выйти
            </SaButton>
          </div>
        </header>

        {/* Контент страниц */}
        <main style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 20px 64px' }}>{children}</main>
      </div>
    </SaAuthContext.Provider>
  )
}
