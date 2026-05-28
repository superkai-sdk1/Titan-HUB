import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, appSettings, profiles, eq, and, isNull, count } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'
import { Redis } from 'ioredis'

export const systemRouter = new Hono<AppEnv>()

systemRouter.get('/info', requireAuth, async (c) => {
  const shift = await getCurrentShift()
  const [staffCount] = await db
    .select({ total: count() })
    .from(profiles)
    .where(and(eq(profiles.role, 'staff'), isNull(profiles.deletedAt)))

  return c.json({
    version: process.env['npm_package_version'] ?? '1.0.0',
    shift: shift ?? null,
    staffCount: staffCount?.total ?? 0,
    env: process.env['NODE_ENV'],
  })
})

systemRouter.get('/settings', requireAuth, async (c) => {
  const rows = await db.select().from(appSettings)
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return c.json({ settings })
})

const SettingsSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'invalid setting key'),
    z.string().max(2000),
  )
  .refine((obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 50, {
    message: 'expected 1..50 settings keys',
  })

systemRouter.patch('/settings', requireAuth, requireRole('owner'), zValidator('json', SettingsSchema), async (c) => {
  const body = c.req.valid('json')
  for (const [key, value] of Object.entries(body)) {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, key))
    if (existing) {
      await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key))
    } else {
      await db.insert(appSettings).values({ key, value })
    }
  }
  return c.json({ ok: true })
})

// SSE endpoint for real-time updates
systemRouter.get('/update', requireAuth, async (c) => {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const send = (event: string, data: unknown) => {
    return writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }

  // Subscribe to Redis channel
  const subscriber = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  await subscriber.subscribe('titan:updates')

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      const payload = JSON.parse(message)
      send(payload.event, payload.data).catch(() => {})
    } catch {}
  })

  // Ping every 25s to keep connection alive
  const interval = setInterval(() => {
    send('ping', { ts: Date.now() }).catch(() => clearInterval(interval))
  }, 25000)

  // Send initial state
  send('connected', { ts: Date.now() }).catch(() => {})

  c.req.raw.signal.addEventListener('abort', () => {
    clearInterval(interval)
    subscriber.unsubscribe('titan:updates').catch(() => {})
    subscriber.disconnect()
    writer.close().catch(() => {})
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
