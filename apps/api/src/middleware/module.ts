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
