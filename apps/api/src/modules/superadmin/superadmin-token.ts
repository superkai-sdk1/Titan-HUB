// ─────────────────────────────────────────────────────────────────────────────
// СУПЕРАДМИН-JWT — ОТДЕЛЬНЫЙ контур авторизации платформы (control-plane), не
// пересекающийся с клубными токенами. Ключевое отличие от клубного JWT
// (packages/auth/src/jwt.ts): обязательный клейм `scope: 'superadmin'`.
//
// ПОЧЕМУ это безопасно «в обе стороны»:
//  • Клубный requireAuth (apps/api/src/middleware/auth.ts) проверяет токен тем же
//    секретом, поэтому суперадмин-токен пройдёт ПОДПИСЬ. ЧТОБЫ клубные роуты его
//    НЕ принимали, в клубный verifyToken/requireAuth нужно добавить отказ при
//    наличии scope==='superadmin' (см. отчёт — это правка, которую делает владелец).
//  • Здесь, наоборот, verifySuperadminToken ТРЕБУЕТ scope==='superadmin' и бросает
//    на любом другом токене — поэтому обычный клубный JWT суперадмин-роуты не пустит.
//
// Подпись — через jose напрямую (тем же JWT_SECRET, что и клубные токены), чтобы
// не тащить лишних секретов: разделение контуров обеспечивает именно клейм scope,
// а не отдельный ключ. Секрет обязателен и стойкий (≥32 символов).
// ─────────────────────────────────────────────────────────────────────────────

import { createMiddleware } from 'hono/factory'
import { signJwt, verifyJwt } from '@titan/auth'

// Маркер контура. Любой токен без него отвергается verifySuperadminToken.
export const SUPERADMIN_SCOPE = 'superadmin' as const

export interface SuperadminJwtPayload {
  // id суперадмина (superadmins.id)
  sub: string
  login: string
  // ОБЯЗАТЕЛЬНЫЙ маркер контура — отличает от клубного JWT.
  scope: typeof SUPERADMIN_SCOPE
  iat?: number
  exp?: number
}

/**
 * Выпустить суперадмин-токен. По умолчанию TTL короче клубного (12h): control-
 * plane чувствителен. Для шага «дойти до регистрации пасскея» сразу после
 * bootstrap используется ещё более короткий TTL (см. expiresIn в роутере).
 */
export async function signSuperadminToken(
  payload: Omit<SuperadminJwtPayload, 'iat' | 'exp' | 'scope'>,
  expiresIn?: string,
): Promise<string> {
  return signJwt({ ...payload, scope: SUPERADMIN_SCOPE }, expiresIn ?? '12h')
}

/**
 * Проверить суперадмин-токен. Бросает, если подпись/срок невалидны ИЛИ если
 * scope !== 'superadmin' (т.е. обычный клубный JWT сюда не пройдёт).
 */
export async function verifySuperadminToken(token: string): Promise<SuperadminJwtPayload> {
  const payload = await verifyJwt(token)
  if (payload['scope'] !== SUPERADMIN_SCOPE) {
    throw new Error('Not a superadmin token')
  }
  return payload as unknown as SuperadminJwtPayload
}

// Тип переменных контекста для суперадмин-роутов.
export type SuperadminEnv = { Variables: { superadmin: SuperadminJwtPayload } }

/**
 * Middleware: требует валидный суперадмин-Bearer. Кладёт payload в
 * c.set('superadmin', ...). Иначе — 401 (единый ответ, без деталей).
 */
export const requireSuperadmin = createMiddleware<SuperadminEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  let payload: SuperadminJwtPayload
  try {
    payload = await verifySuperadminToken(token)
  } catch {
    // Единый ответ: не раскрываем, токен ли просрочен, подделан или это клубный JWT.
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('superadmin', payload)
  await next()
})
