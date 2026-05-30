/**
 * Глобальный rate limit через Redis.
 * - Anonymous (без auth): 120 запросов / минута / IP
 * - Authenticated: 600 запросов / минута / userId
 *
 * Использует Sliding Window (key с TTL).
 */
import { createMiddleware } from 'hono/factory'
import { Redis } from 'ioredis'
import { verifyToken } from '@titan/auth'

const ANON_LIMIT = parseInt(process.env['RATELIMIT_ANON'] ?? '120')
const AUTH_LIMIT = parseInt(process.env['RATELIMIT_AUTH'] ?? '600')
const WINDOW_SECONDS = 60

// Один shared Redis для middleware (lazy)
let redisInstance: Redis | null = null
function getRedis() {
  if (!redisInstance) {
    redisInstance = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    redisInstance.on('error', () => {})  // не падать при недоступности Redis
  }
  return redisInstance
}

export const rateLimit = createMiddleware(async (c, next) => {
  // Пропускаем SSE-стримы (долгие connections, не должны попадать в лимит)
  if (c.req.path.includes('/notifications/stream')) return next()
  if (c.req.header('accept')?.includes('text/event-stream')) return next()
  // Пропускаем health-check
  if (c.req.path === '/health' || c.req.path === '/api/health') return next()

  let key: string
  let limit: number

  // Определяем identifier: userId или IP.
  // Токен берём из Authorization: Bearer ИЛИ из ?token= (requireAuth тоже
  // принимает query-token для EventSource/wallet-ссылок). Без этого token-in-query
  // запросы валятся в общий per-IP bucket и фактически не лимитируются по аккаунту.
  const auth = c.req.header('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : c.req.query('token')
  let userId: string | null = null
  if (token) {
    try {
      const payload = await verifyToken(token)
      userId = payload.sub
    } catch {}
  }

  if (userId) {
    key = `rl:user:${userId}`
    limit = AUTH_LIMIT
  } else {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? c.req.header('x-real-ip')
      ?? 'unknown'
    key = `rl:ip:${ip}`
    limit = ANON_LIMIT
  }

  try {
    const redis = getRedis()
    const current = await redis.incr(key)
    if (current === 1) {
      await redis.expire(key, WINDOW_SECONDS)
    }
    if (current > limit) {
      const ttl = await redis.ttl(key)
      c.header('Retry-After', String(ttl))
      return c.json({
        error: 'Too many requests',
        retryAfter: ttl,
      }, 429)
    }
  } catch {
    // Если Redis недоступен — пропускаем (fail-open)
  }

  await next()
})
