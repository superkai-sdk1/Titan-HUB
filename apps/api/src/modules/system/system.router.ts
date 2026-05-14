import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, appSettings, profiles, eq, and, isNull, count } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'

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

systemRouter.patch('/settings', requireAuth, requireRole('owner'), zValidator('json', z.record(z.string())), async (c) => {
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

  // Send initial ping
  send('ping', { ts: Date.now() }).catch(() => {})

  // Keep alive every 25s
  const interval = setInterval(() => {
    send('ping', { ts: Date.now() }).catch(() => clearInterval(interval))
  }, 25000)

  c.req.raw.signal.addEventListener('abort', () => {
    clearInterval(interval)
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
