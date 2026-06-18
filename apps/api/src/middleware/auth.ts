import { createMiddleware } from 'hono/factory'
import { createHash } from 'crypto'
import { verifyToken } from '@titan/auth'
import type { JwtPayload } from '@titan/auth'
import type { ClubContext } from '../types.js'
import { getSharedRedis } from '../lib/redis.js'

// requireAuth читает не только user, но и club (его кладёт tenantContext ПЕРЕД
// этим middleware) — чтобы сверить привязку токена/тикета к клубу поддомена.
type Variables = { user: JwtPayload; club: ClubContext | null }

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const requireAuth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  // clubId клуба ТЕКУЩЕГО домена (по Host). null — основной/служебный домен.
  // К нему привязываем токен/тикет, чтобы артефакт одного клуба нельзя было
  // переиграть на поддомене другого (database-per-club).
  const domainClubId = c.var.club?.id ?? null

  // SSE: одноразовый короткоживущий тикет (?ticket=) вместо полного JWT в URL.
  // Выдаётся /auth/sse-ticket по Bearer, живёт 60с, потребляется здесь однократно.
  const ticket = c.req.query('ticket')
  if (ticket) {
    try {
      const raw = await getSharedRedis().getdel(`sse:${ticket}`)
      if (!raw) return c.json({ error: 'Invalid ticket' }, 401)
      const ticketUser = JSON.parse(raw) as JwtPayload
      // СТРОГАЯ привязка к клубу: тикет мятится на правильном домене и живёт 60с,
      // поэтому легитимный тикет ВСЕГДА несёт clubId своего домена. Несовпадение =
      // попытка переиграть тикет клуба A на поддомене клуба B → 401. Грейса нет:
      // легаси-тикетов не существует (TTL 60с, все выпущены уже с clubId).
      const ticketClubId = (ticketUser as { clubId?: string | null }).clubId ?? null
      if (ticketClubId !== domainClubId) {
        return c.json({ error: 'Invalid ticket' }, 401)
      }
      c.set('user', ticketUser)
      await next()
      return
    } catch {
      return c.json({ error: 'Invalid ticket' }, 401)
    }
  }

  // Bearer-токен в Authorization-заголовке ИЛИ в ?token=... query param
  // (?token= — легаси-путь SSE; новый клиент использует ?ticket= выше).
  let token: string | null = null
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7)
  } else {
    const qToken = c.req.query('token')
    if (qToken) token = qToken
  }

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let user: JwtPayload
  try {
    user = await verifyToken(token)
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }

  // Суперадмин-токен (scope='superadmin') НЕ принимается клубными роутами —
  // контуры строго разделены (см. modules/superadmin/superadmin-token.ts).
  if ((user as unknown as { scope?: string }).scope === 'superadmin') {
    return c.json({ error: 'Invalid token' }, 401)
  }

  // ── Привязка JWT к клубу (database-per-club) ────────────────────────────────
  // Матрица допуска (token.clubId × domain.clubId):
  //   token.clubId === undefined  → ЛЕГАСИ-токен (выпущен до фикса): ПРОПУСКАЕМ
  //       с warn (грейс на время дожития старых токенов, до 30д). СУЖАЕТСЯ позже:
  //       когда легаси-токены истекут — заменить грейс на 401 (см. план аудита).
  //   token.clubId === domain.clubId → допускаем (включая null===null = основной
  //       домен: токен основного домена работает только на основном домене).
  //   token.clubId !== domain.clubId → 401 (токен клуба A на поддомене клуба B,
  //       клубный токен на основном домене, токен основного домена на поддомене).
  const tokenClubId = (user as { clubId?: string | null }).clubId
  if (tokenClubId === undefined) {
    console.warn(
      `[auth] Легаси-JWT без clubId (sub=${user.sub}) на домене club=${domainClubId ?? 'main'} — пропущен по грейсу`,
    )
  } else if (tokenClubId !== domainClubId) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  // Проверка отзыва токена (logout/блокировка). Best-effort: если Redis
  // недоступен — пропускаем (fail-open), чтобы не ронять авторизацию.
  try {
    const revoked = await getSharedRedis().get(`revoked:${tokenHash(token)}`)
    if (revoked) return c.json({ error: 'Token revoked' }, 401)
  } catch { /* fail-open */ }

  c.set('user', user)
  await next()
})

export const requireRole = (...roles: string[]) =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
