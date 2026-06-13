'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// ClubGate — энфорсмент подписки клуба на ФРОНТЕ (зеркалит бэкенд-middleware).
//
// На загрузке читает публичный /api/club/context:
//   • club=null (основной/служебный домен) → одно-клубный режим: ничего не делаем,
//     рендерим приложение как есть. БЕЗ блокировок/баннеров.
//   • subscription.blocked (expired/suspended/none) → ВМЕСТО приложения показываем
//     экран «продлите подписку».
//   • state grace/expiring → приложение + предупреждающий баннер сверху.
//
// FAIL-OPEN: пока контекст грузится ИЛИ если запрос упал — рендерим приложение
// (никогда не блокируем клуб из-за сетевой ошибки). Модули прокидываются в контекст
// (useClubContext) для скрытия выключенных пунктов меню.
// ─────────────────────────────────────────────────────────────────────────────

interface SubscriptionStatus {
  state: 'active' | 'expiring' | 'grace' | 'expired' | 'suspended' | 'none' | 'unknown'
  blocked: boolean
  paidUntil: string | null
  graceUntil: string | null
  daysLeft: number | null
}
interface ClubContextValue {
  loading: boolean
  club: { slug: string; name: string } | null
  subscription: SubscriptionStatus | null
  modules: Record<string, boolean>
  /** Доступен ли модуль (нет записи = доступен; одно-клубный режим = всё доступно). */
  moduleEnabled: (key: string) => boolean
}

const Ctx = createContext<ClubContextValue>({
  loading: true,
  club: null,
  subscription: null,
  modules: {},
  moduleEnabled: () => true,
})

export function useClubContext(): ClubContextValue {
  return useContext(Ctx)
}

const RUB_DAY = (n: number) => {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return 'дней'
  if (b > 1 && b < 5) return 'дня'
  if (b === 1) return 'день'
  return 'дней'
}

export function ClubGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    loading: boolean
    club: { slug: string; name: string } | null
    subscription: SubscriptionStatus | null
    modules: Record<string, boolean>
  }>({ loading: true, club: null, subscription: null, modules: {} })

  useEffect(() => {
    let alive = true
    fetch('/api/club/context', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return
        setState({
          loading: false,
          club: d?.club ?? null,
          subscription: d?.subscription ?? null,
          modules: d?.modules ?? {},
        })
      })
      .catch(() => {
        // Fail-open: сеть/ошибка → не блокируем, работаем как одно-клубный.
        if (alive) setState({ loading: false, club: null, subscription: null, modules: {} })
      })
    return () => {
      alive = false
    }
  }, [])

  const value: ClubContextValue = {
    loading: state.loading,
    club: state.club,
    subscription: state.subscription,
    modules: state.modules,
    moduleEnabled: (key) => state.modules[key] !== false,
  }

  const blocked = !!state.club && !!state.subscription?.blocked
  const sub = state.subscription

  return (
    <Ctx.Provider value={value}>
      {/* Баннер грейса/скорого окончания — поверх приложения, не блокирует работу. */}
      {!blocked && state.club && (sub?.state === 'grace' || sub?.state === 'expiring') && (
        <SubscriptionBanner state={sub.state} daysLeft={sub.daysLeft} />
      )}
      {blocked ? <SubscriptionBlocked clubName={state.club?.name} sub={sub} /> : children}
    </Ctx.Provider>
  )
}

function SubscriptionBanner({
  state,
  daysLeft,
}: {
  state: 'grace' | 'expiring'
  daysLeft: number | null
}) {
  const grace = state === 'grace'
  // grace: daysLeft отрицательное (срок вышел) → дни грейса считаем отдельно текстом.
  const text = grace
    ? 'Подписка истекла. Доступ сохранён в течение льготного периода — продлите, чтобы не потерять доступ.'
    : daysLeft != null && daysLeft >= 0
      ? `Подписка истекает через ${daysLeft} ${RUB_DAY(daysLeft)} — продлите заранее.`
      : 'Подписка скоро истекает — продлите заранее.'
  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        color: grace ? '#7c2d12' : '#78350f',
        background: grace ? 'rgba(251,146,60,0.95)' : 'rgba(253,224,71,0.95)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {text}
    </div>
  )
}

function SubscriptionBlocked({
  clubName,
  sub,
}: {
  clubName?: string
  sub: SubscriptionStatus | null
}) {
  const suspended = sub?.state === 'suspended'
  const title = suspended ? 'Доступ приостановлен' : 'Подписка истекла'
  const desc = suspended
    ? 'Доступ к заведению временно приостановлен администратором платформы.'
    : 'Срок подписки вашего заведения закончился, льготный период исчерпан.'
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: 'var(--on-surface)',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: 32,
          borderRadius: 20,
          background: 'var(--glass-l2, rgba(255,255,255,0.04))',
          border: '1px solid var(--border, rgba(255,255,255,0.08))',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{title}</h1>
        {clubName && (
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{clubName}</p>
        )}
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--on-surface-variant)' }}>{desc}</p>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--on-surface-variant)' }}>
          Свяжитесь с поддержкой Titan HUB, чтобы продлить подписку и восстановить доступ.
        </p>
        <button
          onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}
          style={{
            marginTop: 8,
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Обновить
        </button>
      </div>
    </div>
  )
}
