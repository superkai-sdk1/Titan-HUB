import { Hono } from 'hono'
import type { AppEnv } from '../../types.js'
import { computeSubscriptionStatus } from '../../lib/subscription.js'

// ─────────────────────────────────────────────────────────────────────────────
// Публичный контекст клуба для фронта. БЕЗ requireAuth и НЕ гейтится подпиской
// (allowlist в requireActiveSubscription) — фронт читает его на загрузке, чтобы:
//   • показать экран «продлите подписку» (subscription.blocked) даже на
//     заблокированном клубе;
//   • показать баннер грейса/скорого окончания;
//   • скрыть выключенные модули в меню (modules).
//
// На основном/служебном домене club=null → { club:null } (одно-клубный режим:
// фронт энфорсмент не применяет).
// ─────────────────────────────────────────────────────────────────────────────
export const clubRouter = new Hono<AppEnv>()

clubRouter.get('/context', (c) => {
  const club = c.var.club
  if (!club) {
    return c.json({ club: null, subscription: null, modules: {} })
  }
  const subscription = computeSubscriptionStatus(club, Date.now())
  return c.json({
    club: { slug: club.slug, name: club.name },
    subscription,
    modules: club.modules ?? {},
  })
})
