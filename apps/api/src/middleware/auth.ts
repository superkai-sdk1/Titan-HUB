import { createMiddleware } from 'hono/factory'
import { createHash } from 'crypto'
import { verifyToken } from '@titan/auth'
import type { JwtPayload } from '@titan/auth'
import { getSharedRedis } from '../lib/redis.js'

type Variables = { user: JwtPayload }

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const requireAuth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  // SSE: одноразовый короткоживущий тикет (?ticket=) вместо полного JWT в URL.
  // Выдаётся /auth/sse-ticket по Bearer, живёт 60с, потребляется здесь однократно.
  const ticket = c.req.query('ticket')
  if (ticket) {
    try {
      const raw = await getSharedRedis().getdel(`sse:${ticket}`)
      if (!raw) return c.json({ error: 'Invalid ticket' }, 401)
      c.set('user', JSON.parse(raw) as JwtPayload)
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
