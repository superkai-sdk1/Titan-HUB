import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'
import { computeSubscriptionStatus } from '../lib/subscription.js'

// ─────────────────────────────────────────────────────────────────────────────
// requireActiveSubscription — энфорсмент подписки на КЛУБ-ПОДДОМЕНЕ.
//
// club=null (основной/служебный домен, синглтон-БД) → пропускаем БЕЗУСЛОВНО:
// одно-клубный режим ведёт себя как раньше, основной домен не затронут.
//
// Заблокированному клубу (expired/suspended/none) отдаём 402 на ВСЁ клубное API,
// КРОМЕ allowlist: /api/health* (liveness/readiness) и /api/club* (фронту нужно
// прочитать свой статус, чтобы показать экран «продлите подписку») + /api/superadmin*
// (контур платформы). Грейс/expiring — НЕ блок (баннер рисует фронт по /club/context).
// ─────────────────────────────────────────────────────────────────────────────
function isAllowlisted(path: string): boolean {
  return (
    path === '/api/health' ||
    path.startsWith('/api/health/') ||
    path.startsWith('/api/club') ||
    path.startsWith('/api/internal') ||
    path.startsWith('/api/superadmin')
  )
}

export const requireActiveSubscription = createMiddleware<AppEnv>(async (c, next) => {
  const club = c.var.club
  if (!club) return next()
  if (isAllowlisted(c.req.path)) return next()

  const status = computeSubscriptionStatus(club, Date.now())
  if (status.blocked) {
    return c.json(
      { error: 'subscription_required', state: status.state, paidUntil: status.paidUntil },
      402,
    )
  }
  return next()
})
