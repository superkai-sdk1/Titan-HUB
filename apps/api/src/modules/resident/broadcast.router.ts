/**
 * Рассылки клиентам из панели: лента в приложении Titan Resident + push +
 * (по желанию) сообщение от бота кошелька.
 *
 * Права: владелец — любая аудитория; сотрудник — только выбранным клиентам
 * (написать конкретному человеку), массовые рассылки — за владельцем.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  profiles, clientBroadcasts, appDevices,
  eq, and, lt, gt, inArray, isNull, desc, sql, type Database,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { deliverToClients } from '../notifications/client.js'
import type { AppEnv } from '../../types.js'

export const broadcastRouter = new Hono<AppEnv>()
broadcastRouter.use('*', requireAuth)
broadcastRouter.use('*', requireRole('owner', 'staff'))

const Audience = z.object({
  audience: z.enum(['all', 'tier', 'debtors', 'depositors', 'profiles']),
  tier: z.string().max(40).optional(),
  profileIds: z.array(z.string().uuid()).max(500).optional(),
})
type AudienceInput = z.infer<typeof Audience>

async function resolveAudience(db: Database, a: AudienceInput): Promise<string[]> {
  const base = and(eq(profiles.role, 'client'), isNull(profiles.deletedAt))
  let where
  switch (a.audience) {
    case 'all': where = base; break
    case 'tier': where = and(base, eq(profiles.clientTier, a.tier ?? '')); break
    case 'debtors': where = and(base, lt(profiles.balance, '0')); break
    case 'depositors': where = and(base, gt(profiles.balance, '0')); break
    case 'profiles':
      if (!a.profileIds?.length) return []
      where = and(base, inArray(profiles.id, a.profileIds))
      break
  }
  const rows = await db.select({ id: profiles.id }).from(profiles).where(where)
  return rows.map((r) => r.id)
}

// Предпросмотр аудитории: сколько получат и по каким каналам.
broadcastRouter.post('/audience', zValidator('json', Audience), async (c) => {
  const db = c.var.db
  const ids = await resolveAudience(db, c.req.valid('json'))
  if (!ids.length) return c.json({ recipients: 0, withApp: 0, withTelegram: 0 })
  const [app] = await db.select({ n: sql<number>`count(distinct ${appDevices.profileId})::int` }).from(appDevices)
    .where(and(inArray(appDevices.profileId, ids), eq(appDevices.app, 'client')))
  const [tg] = await db.select({ n: sql<number>`count(*)::int` }).from(profiles)
    .where(and(inArray(profiles.id, ids), sql`${profiles.tgId} IS NOT NULL`, eq(profiles.walletNotifyEnabled, true)))
  return c.json({ recipients: ids.length, withApp: Number(app?.n ?? 0), withTelegram: Number(tg?.n ?? 0) })
})

broadcastRouter.post('/', zValidator('json', Audience.extend({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1000),
  channels: z.object({ push: z.boolean().default(true), telegram: z.boolean().default(false) }).default({ push: true, telegram: false }),
})), async (c) => {
  const db = c.var.db
  const user = c.get('user')
  const b = c.req.valid('json')
  if (user.role !== 'owner' && b.audience !== 'profiles') {
    return c.json({ error: 'Массовые рассылки доступны только владельцу' }, 403)
  }
  const ids = await resolveAudience(db, b)
  if (!ids.length) return c.json({ error: 'Нет получателей' }, 400)

  const [row] = await db.insert(clientBroadcasts).values({
    title: b.title, body: b.body, audience: b.audience === 'tier' ? `tier:${b.tier ?? ''}` : b.audience,
    channels: b.channels, recipientsCount: ids.length, sentBy: user.sub,
  }).returning()
  if (!row) return c.json({ error: 'Не удалось создать рассылку' }, 500)

  // Доставка идёт в фоне: Telegram шлётся с паузами, ответ панели не ждёт.
  void deliverToClients(ids, {
    kind: 'news', title: b.title, body: b.body, meta: { screen: 'notifications', broadcastId: row.id }, broadcastId: row.id,
  }, { push: b.channels.push, telegram: b.channels.telegram }, db)
    .then((r) => db.update(clientBroadcasts)
      .set({ recipientsCount: r.recipients, pushCount: r.push, telegramCount: r.telegram })
      .where(eq(clientBroadcasts.id, row.id)))
    .catch((err) => console.error('[broadcast] delivery failed:', err))

  return c.json({ id: row.id, recipients: ids.length }, 201)
})

broadcastRouter.get('/', async (c) => {
  const db = c.var.db
  const rows = await db.select({
    id: clientBroadcasts.id, title: clientBroadcasts.title, body: clientBroadcasts.body,
    audience: clientBroadcasts.audience, channels: clientBroadcasts.channels,
    recipientsCount: clientBroadcasts.recipientsCount, pushCount: clientBroadcasts.pushCount,
    telegramCount: clientBroadcasts.telegramCount, createdAt: clientBroadcasts.createdAt,
    sentBy: profiles.nickname,
  }).from(clientBroadcasts)
    .leftJoin(profiles, eq(profiles.id, clientBroadcasts.sentBy))
    .orderBy(desc(clientBroadcasts.createdAt))
    .limit(50)
  return c.json({ broadcasts: rows })
})
