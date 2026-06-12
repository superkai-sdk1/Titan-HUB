'use client'
// ─── /superadmin — корневая страница панели суперадмина платформы ──────────────
//
// Контур ОТДЕЛЬНЫЙ от клубной авторизации: свой токен (titan_sa_token), свой
// API-клиент (saApi). Клубный auth.store здесь не используется.
//
// Поток на маунте:
//   1) GET /auth/bootstrap-status → needsBootstrap.
//   2) Если есть saToken — пробуем показать панель (GET /clubs внутри панели);
//      на 401 панель сообщит onUnauthorized → покажем экран входа.
//   3) Нет токена → экран входа (bootstrap или login, в зависимости от статуса).
import { useEffect, useState } from 'react'
import { saApi, getSaToken, clearSaToken } from '@/lib/superadminApi'
import type { BootstrapStatus } from './types'
import { SuperadminAuth } from './SuperadminAuth'
import { SuperadminPanel } from './SuperadminPanel'
import { SaSpinner } from './ui'

type View =
  | { kind: 'loading' }
  | { kind: 'auth'; needsBootstrap: boolean }
  | { kind: 'panel' }

export default function SuperadminPage() {
  const [view, setView] = useState<View>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const status = await saApi.get<BootstrapStatus>('/auth/bootstrap-status')
        if (!alive) return
        // Если требуется bootstrap — всегда ведём на экран создания суперадмина
        // (даже если в localStorage завалялся протухший токен).
        if (status.needsBootstrap) {
          setView({ kind: 'auth', needsBootstrap: true })
          return
        }
        // Платформа настроена. Есть токен — пробуем сразу панель; нет — вход.
        if (getSaToken()) {
          setView({ kind: 'panel' })
        } else {
          setView({ kind: 'auth', needsBootstrap: false })
        }
      } catch {
        if (!alive) return
        // Не смогли получить статус (сеть/401). Безопасный дефолт — экран входа
        // без bootstrap. saApi уже почистил токен, если был 401.
        setView({ kind: 'auth', needsBootstrap: false })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function logout() {
    clearSaToken()
    setView({ kind: 'auth', needsBootstrap: false })
  }

  // 401 при работе панели — токен протух: чистим и возвращаем на вход.
  function onUnauthorized() {
    clearSaToken()
    setView({ kind: 'auth', needsBootstrap: false })
  }

  if (view.kind === 'loading') {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.15) 0%, transparent 70%), #0b0912',
        }}
      >
        <SaSpinner />
      </div>
    )
  }

  if (view.kind === 'auth') {
    return (
      <SuperadminAuth
        needsBootstrap={view.needsBootstrap}
        onAuthed={() => setView({ kind: 'panel' })}
      />
    )
  }

  return <SuperadminPanel onLogout={logout} onUnauthorized={onUnauthorized} />
}
