import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, notifications, userNotificationSettings, tgLinkRequests, profiles, spaces, checks, eq, and, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { Redis } from 'ioredis'
import { randomInt } from 'crypto'
import type { AppEnv } from '../../types.js'

const NOTIF_CHANNEL = 'titan:staff-notifications'

function getNotifRedis() {
  return new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', { lazyConnect: true })
}

async function publishStaffNotification(payload: {
  type: string
  title: string
  body: string
  meta?: Record<string, unknown>
}) {
  // Persist в БД (без userId — broadcast для всех staff)
  const [row] = await db.insert(notifications).values({
    type: payload.type,
    title: payload.title,
    body: payload.body,
    meta: payload.meta ?? {},
  }).returning()

  // Publish в Redis для SSE
  const redis = getNotifRedis()
  try {
    await redis.connect()
    await redis.publish(NOTIF_CHANNEL, JSON.stringify({
      id: row!.id,
      type: row!.type,
      title: row!.title,
      body: row!.body,
      meta: row!.meta,
      createdAt: row!.createdAt,
    }))
  } finally {
    redis.disconnect()
  }
  return row
}

export const notificationsRouter = new Hono<AppEnv>()
notificationsRouter.use('*', requireAuth)

// ── SSE-стрим для staff/owner ────────────────────────────────────────────
notificationsRouter.get('/stream', requireRole('owner', 'staff'), async (c) => {
  return streamSSE(c, async (stream) => {
    const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
    let closed = false

    await redis.subscribe(NOTIF_CHANNEL).catch(() => {})

    redis.on('message', async (channel, message) => {
      if (closed || channel !== NOTIF_CHANNEL) return
      try {
        await stream.writeSSE({ data: message })
      } catch {}
    })

    const hb = setInterval(() => {
      if (closed) return
      stream.writeSSE({ event: 'ping', data: '1' }).catch(() => {})
    }, 25_000)

    stream.onAbort(() => {
      closed = true
      clearInterval(hb)
      redis.unsubscribe(NOTIF_CHANNEL).catch(() => {})
      redis.disconnect()
    })

    // Держать соединение открытым до отмены
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (closed) { clearInterval(check); resolve() }
      }, 1000)
    })
  })
})

// ── POST /staff-call — планшет вызывает персонал ─────────────────────────
notificationsRouter.post(
  '/staff-call',
  requireRole('tablet', 'staff', 'owner'),
  zValidator('json', z.object({
    spaceId: z.string().uuid().optional(),
    message: z.string().max(200).optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')

    let resolvedSpaceId = body.spaceId
    if (!resolvedSpaceId) {
      const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.sub))
      resolvedSpaceId = profile?.linkedSpaceId ?? undefined
    }

    let spaceName = 'Неизвестная зона'
    if (resolvedSpaceId) {
      const [space] = await db.select().from(spaces).where(eq(spaces.id, resolvedSpaceId))
      spaceName = space?.name ?? spaceName
    }

    const notification = await publishStaffNotification({
      type: 'staff_call',
      title: `Вызов: ${spaceName}`,
      body: body.message ?? 'Гость запросил помощь',
      meta: { spaceId: resolvedSpaceId, fromTabletId: user.sub },
    })

    return c.json({ ok: true, notification }, 201)
  },
)

// ── POST /request-bill — планшет запрашивает счёт ────────────────────────
notificationsRouter.post(
  '/request-bill',
  requireRole('tablet', 'staff', 'owner'),
  zValidator('json', z.object({
    checkId: z.string().uuid(),
  })),
  async (c) => {
    const user = c.get('user')
    const { checkId } = c.req.valid('json')

    const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
    if (!check) return c.json({ error: 'Check not found' }, 404)

    let spaceName = ''
    if (check.spaceId) {
      const [space] = await db.select().from(spaces).where(eq(spaces.id, check.spaceId))
      spaceName = space?.name ?? ''
    }

    const notification = await publishStaffNotification({
      type: 'request_bill',
      title: spaceName ? `Запрос счёта: ${spaceName}` : 'Запрос счёта',
      body: `Сумма: ${parseFloat(check.totalAmount).toLocaleString('ru')} ₽`,
      meta: { checkId, spaceId: check.spaceId, fromTabletId: user.sub },
    })

    return c.json({ ok: true, notification }, 201)
  },
)

notificationsRouter.get('/', async (c) => {
  const user = c.get('user')
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.sub))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
  return c.json({ notifications: rows })
})

notificationsRouter.put('/:id/read', async (c) => {
  const user = c.get('user')
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, user.sub)))
  return c.json({ ok: true })
})

notificationsRouter.put('/read-all', async (c) => {
  const user = c.get('user')
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, user.sub))
  return c.json({ ok: true })
})

notificationsRouter.get('/settings', async (c) => {
  const user = c.get('user')
  const [settings] = await db.select().from(userNotificationSettings).where(eq(userNotificationSettings.userId, user.sub))
  return c.json({ settings: settings ?? null })
})

notificationsRouter.put('/settings', zValidator('json', z.object({
  types: z.record(z.object({ enabled: z.boolean(), channel: z.string() })),
})), async (c) => {
  const user = c.get('user')
  const { types } = c.req.valid('json')
  const [existing] = await db.select().from(userNotificationSettings).where(eq(userNotificationSettings.userId, user.sub))
  if (existing) {
    await db.update(userNotificationSettings).set({ types, updatedAt: new Date() }).where(eq(userNotificationSettings.userId, user.sub))
  } else {
    await db.insert(userNotificationSettings).values({ userId: user.sub, types })
  }
  return c.json({ ok: true })
})

notificationsRouter.post('/tg-link', async (c) => {
  const user = c.get('user')
  // Generate a 6-digit code stored as tgId pending (crypto-random)
  const code = String(randomInt(100000, 1000000))
  await db.insert(tgLinkRequests).values({
    profileId: user.sub,
    tgId: code,
    status: 'pending',
  })
  return c.json({ code })
})
