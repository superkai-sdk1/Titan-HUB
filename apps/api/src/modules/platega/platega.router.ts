import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { Redis } from 'ioredis'

function publishEvent(event: string, data: unknown) {
  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  redis.publish('titan:updates', JSON.stringify({ event, data, ts: Date.now() }))
    .finally(() => redis.disconnect())
    .catch(() => {})
}

export const plategaRouter = new Hono<AppEnv>()

plategaRouter.post('/webhook', async (c) => {
  const incomingMerchantId = c.req.header('X-MerchantId')
  const incomingSecret = c.req.header('X-Secret')
  if (
    !incomingMerchantId || incomingMerchantId !== process.env['PLATEGA_MERCHANT_ID'] ||
    !incomingSecret || incomingSecret !== process.env['PLATEGA_SECRET']
  ) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json() as Record<string, unknown>
  const transactionId = body['id'] as string | undefined
  const status = body['status'] as string | undefined
  const checkId = body['payload'] as string | undefined

  if (status === 'CONFIRMED' && checkId) {
    publishEvent('platega:confirmed', { transactionId, checkId })
  }

  return c.json({ ok: true })
})
