import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, notifications, userNotificationSettings, tgLinkRequests, eq, and, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import type { AppEnv } from '../../types.js'

export const notificationsRouter = new Hono<AppEnv>()
notificationsRouter.use('*', requireAuth)

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
  // Generate a 6-digit code stored as tgId pending
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await db.insert(tgLinkRequests).values({
    profileId: user.sub,
    tgId: code,
    status: 'pending',
  })
  return c.json({ code })
})
