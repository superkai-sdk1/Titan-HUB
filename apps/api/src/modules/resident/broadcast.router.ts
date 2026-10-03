/**
 * Рассылки клиентам из панели: лента в приложении Titan Resident + push +
 * (по желанию) сообщение от бота кошелька.
 *
 * Права: владелец — любая аудитория; сотрудник — только выбранным клиентам
 * (написать конкретному человеку), массовые рассылки — за владельцем.
 *
 * Аудитория «по опросу» — последний опрос чата в Telegram (бот опросов): кто выбрал
 * отмеченные варианты и/или кто из участников чата не проголосовал. Голос
 * сопоставляется с клиентом по привязанному Telegram (profiles.tg_id).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  profiles, clientBroadcasts, appDevices,
  eq, and, lt, gt, inArray, isNull, isNotNull, desc, asc, sql, type Database,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { deliverToClients } from '../notifications/client.js'
import { lastPollForChat, listLastPolls, voteMapOfPoll } from '../../lib/pollState.js'
import { listRosterForChat } from '../../lib/roster.js'
import { readPollConfigs } from '../../lib/polls.js'
import type { AppEnv } from '../../types.js'

export const broadcastRouter = new Hono<AppEnv>()
broadcastRouter.use('*', requireAuth)
broadcastRouter.use('*', requireRole('owner', 'staff'))

const PollTarget = z.object({
  chatId: z.string().min(1).max(40),
  /** Индексы вариантов последнего опроса чата. */
  options: z.array(z.number().int().min(0).max(11)).max(12).default([]),
  /** Участники чата, не проголосовавшие в этом опросе. */
  notVoted: z.boolean().default(false),
})
type PollTargetInput = z.infer<typeof PollTarget>

const Audience = z.object({
  audience: z.enum(['all', 'tier', 'debtors', 'depositors', 'profiles', 'poll']),
  tier: z.string().max(40).optional(),
  profileIds: z.array(z.string().uuid()).max(500).optional(),
  poll: PollTarget.optional(),
})
type AudienceInput = z.infer<typeof Audience>

// Клиенты клуба — как в списке клиентов кассы: владельцы и сотрудники тоже играют
// и входят в Titan Resident, поэтому получают рассылки наравне со всеми.
const CLIENT_ROLES = ['client', 'staff', 'owner']
const clientBase = () => and(inArray(profiles.role, CLIENT_ROLES), isNull(profiles.deletedAt))

/** Telegram id людей, попавших под выбор в последнем опросе чата. */
async function pollTgIds(db: Database, t: PollTargetInput): Promise<string[]> {
  const last = await lastPollForChat(db, t.chatId)
  if (!last) return []
  const votes = await voteMapOfPoll(db, last.pollId)
  const want = new Set(t.options)
  const out = new Set<string>()
  for (const [tgId, ids] of Object.entries(votes)) {
    if (ids.some((i) => want.has(i))) out.add(tgId)
  }
  if (t.notVoted) {
    for (const u of await listRosterForChat(db, t.chatId)) {
      if (!(u.tgId in votes)) out.add(u.tgId)
    }
  }
  return [...out]
}

async function resolveAudience(db: Database, a: AudienceInput): Promise<string[]> {
  const base = clientBase()
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
    case 'poll': {
      if (!a.poll) return []
      const tgIds = await pollTgIds(db, a.poll)
      if (!tgIds.length) return []
      where = and(base, inArray(profiles.tgId, tgIds))
      break
    }
  }
  const rows = await db.select({ id: profiles.id }).from(profiles).where(where)
  return rows.map((r) => r.id)
}

/** Название опроса для панели: заголовок регулярного опроса этого чата. */
async function pollTitles(db: Database): Promise<Map<string, string>> {
  const configs = await readPollConfigs(db)
  const out = new Map<string, string>()
  for (const cfg of configs) {
    if (cfg.chatId && cfg.title && (!out.has(cfg.chatId) || cfg.enabled)) out.set(cfg.chatId, cfg.title)
  }
  return out
}

/** Подпись аудитории в журнале рассылок. */
async function audienceLabel(db: Database, a: AudienceInput): Promise<string> {
  if (a.audience === 'tier') return `tier:${a.tier ?? ''}`
  if (a.audience !== 'poll' || !a.poll) return a.audience
  const title = (await pollTitles(db)).get(a.poll.chatId) ?? 'Опрос'
  const last = await lastPollForChat(db, a.poll.chatId)
  const picked = a.poll.options.map((i) => last?.options?.[i]).filter(Boolean) as string[]
  if (a.poll.notVoted) picked.push('не голосовали')
  return `poll:${title}${picked.length ? ` · ${picked.join(', ')}` : ''}`
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
    title: b.title, body: b.body, audience: await audienceLabel(db, b),
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

// Клиенты для выборочной отправки: у кого есть приложение и Telegram.
broadcastRouter.get('/recipients', async (c) => {
  const db = c.var.db
  const rows = await db.select({
    id: profiles.id, nickname: profiles.nickname, fullName: profiles.fullName,
    photoUrl: sql<string | null>`coalesce(${profiles.photoUrl}, ${profiles.tgPhotoUrl}, ${profiles.gomafiaPhotoUrl})`,
    clientTier: profiles.clientTier,
    hasTelegram: sql<boolean>`(${profiles.tgId} IS NOT NULL AND ${profiles.walletNotifyEnabled} IS NOT FALSE)`,
    hasApp: sql<boolean>`EXISTS (SELECT 1 FROM app_devices d WHERE d.profile_id = ${profiles.id} AND d.app = 'client')`,
  }).from(profiles)
    .where(clientBase())
    .orderBy(asc(sql`lower(${profiles.nickname})`))
  return c.json({ clients: rows })
})

// Последние опросы чатов: сколько голосов у каждого варианта и сколько из них —
// клиенты с привязанным Telegram (только им может уйти рассылка).
broadcastRouter.get('/polls', async (c) => {
  const db = c.var.db
  const [polls, titles] = await Promise.all([listLastPolls(db), pollTitles(db)])
  const linked = await db.select({ tgId: profiles.tgId }).from(profiles)
    .where(and(clientBase(), isNotNull(profiles.tgId)))
  const clientTg = new Set(linked.map((r) => r.tgId!))

  const out = await Promise.all(polls.map(async (p) => {
    const votes = await voteMapOfPoll(db, p.pollId)
    const options = (p.options ?? []).map((label, index) => {
      const voters = Object.entries(votes).filter(([, ids]) => ids.includes(index)).map(([tgId]) => tgId)
      return { index, label, votes: voters.length, clients: voters.filter((t) => clientTg.has(t)).length }
    })
    const silent = (await listRosterForChat(db, p.chatId)).filter((u) => !(u.tgId in votes))
    return {
      chatId: p.chatId,
      title: titles.get(p.chatId) ?? 'Опрос',
      postedAt: p.postedAt,
      totalVotes: Object.keys(votes).length,
      options,
      notVoted: { people: silent.length, clients: silent.filter((u) => clientTg.has(u.tgId)).length },
    }
  }))
  out.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
  return c.json({ polls: out })
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
