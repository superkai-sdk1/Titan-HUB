import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// requireModule(key) — фиче-гейт модуля на КЛУБ-ПОДДОМЕНЕ.
//
// 403, только если модуль ЯВНО выключен суперадмином (club_modules.enabled=false).
// Отсутствие записи о модуле ИЛИ одно-клубный режим (club=null) → доступен
// (fail-open per-module): случайно не бьёт клуб без полной матрицы флагов и не
// меняет поведение на основном домене.
// ─────────────────────────────────────────────────────────────────────────────
export function requireModule(moduleKey: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const club = c.var.club
    if (!club) return next()
    if (club.modules?.[moduleKey] === false) {
      return c.json({ error: 'module_disabled', module: moduleKey }, 403)
    }
    return next()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tai (ИИ-функции: ассистент, прогнозы смены, предчеки, предугадывание позиций) —
// ПЛАТНЫЙ модуль 'ai'. В отличие от requireModule (fail-open), здесь fail-CLOSED
// для клубов-арендаторов: доступно ТОЛЬКО при ЯВНО включённом модуле 'ai'
// (подписка 399 ₽/мес включается суперадмином). На основном домене (club=null —
// инстанс оператора/флагман) — открыто, чтобы не ломать текущее использование.
// ─────────────────────────────────────────────────────────────────────────────
export function aiAllowed(club: { modules?: Record<string, boolean> } | null | undefined): boolean {
  if (!club) return true
  return club.modules?.['ai'] === true
}
export function requireAiPaid() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (aiAllowed(c.var.club)) return next()
    return c.json({ error: 'ai_subscription_required', module: 'ai' }, 403)
  })
}
