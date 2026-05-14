import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, profiles, transactions, bonusHistory,
  eq, and, isNull, ilike, or, desc, sql,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { hashPassword } from '@titan/auth'

const CreateClientSchema = z.object({
  nickname: z.string().min(2),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  clientTier: z.enum(['guest', 'resident', 'student']).default('guest'),
  password: z.string().optional(),
  tgId: z.string().optional(),
  tgUsername: z.string().optional(),
  searchTags: z.array(z.string()).default([]),
})

const UpdateClientSchema = z.object({
  nickname: z.string().min(2).optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  clientTier: z.enum(['guest', 'resident', 'student']).optional(),
  photoUrl: z.string().optional(),
  searchTags: z.array(z.string()).optional(),
  isResident: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
})

export const clientsRouter = new Hono<AppEnv>()
clientsRouter.use('*', requireAuth)

clientsRouter.get('/', async (c) => {
  const search = c.req.query('search')
  const page = Number(c.req.query('page') ?? 1)
  const limit = 30
  const offset = (page - 1) * limit

  const where = and(
    eq(profiles.role, 'client'),
    isNull(profiles.deletedAt),
    search
      ? or(
          ilike(profiles.nickname, `%${search}%`),
          ilike(profiles.phone ?? '', `%${search}%`),
        )
      : undefined,
  )

  const clients = await db
    .select()
    .from(profiles)
    .where(where)
    .orderBy(desc(profiles.createdAt))
    .limit(limit)
    .offset(offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(profiles)
    .where(where)

  return c.json({ clients, total, page, limit })
})

clientsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', CreateClientSchema), async (c) => {
  const body = c.req.valid('json')
  const passwordHash = body.password ? await hashPassword(body.password) : undefined
  const [client] = await db.insert(profiles).values({
    nickname: body.nickname,
    role: 'client',
    phone: body.phone,
    birthday: body.birthday,
    clientTier: body.clientTier,
    tgId: body.tgId,
    tgUsername: body.tgUsername,
    searchTags: body.searchTags,
    passwordHash,
  }).returning()
  const { pin, passwordHash: _, ...safe } = client
  return c.json({ client: safe }, 201)
})

clientsRouter.get('/:id', async (c) => {
  const [client] = await db.select().from(profiles).where(and(eq(profiles.id, c.req.param('id')), isNull(profiles.deletedAt)))
  if (!client) return c.json({ error: 'Not found' }, 404)
  const { pin, passwordHash, ...safe } = client
  return c.json({ client: safe })
})

clientsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', UpdateClientSchema), async (c) => {
  const body = c.req.valid('json')
  const update: Record<string, any> = { ...body }
  if (body.deletedAt !== undefined) update.deletedAt = body.deletedAt ? new Date(body.deletedAt) : null

  const [client] = await db.update(profiles).set(update).where(eq(profiles.id, c.req.param('id'))).returning()
  if (!client) return c.json({ error: 'Not found' }, 404)
  const { pin, passwordHash, ...safe } = client
  return c.json({ client: safe })
})

clientsRouter.delete('/:id', requireRole('owner'), async (c) => {
  await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.id, c.req.param('id')))
  return c.json({ ok: true })
})

clientsRouter.get('/:id/transactions', async (c) => {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.playerId, c.req.param('id')))
    .orderBy(desc(transactions.createdAt))
    .limit(50)
  return c.json({ transactions: rows })
})

clientsRouter.post('/:id/balance', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number(),
  description: z.string().optional(),
})), async (c) => {
  const { amount, description } = c.req.valid('json')
  const user = c.get('user')
  const [client] = await db.select().from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!client) return c.json({ error: 'Not found' }, 404)

  const newBalance = parseFloat(client.balance) + amount
  if (newBalance < 0) return c.json({ error: 'Insufficient balance' }, 400)

  await db.update(profiles).set({ balance: String(newBalance) }).where(eq(profiles.id, client.id))
  await db.insert(transactions).values({
    type: amount >= 0 ? 'deposit' : 'withdrawal',
    amount: String(Math.abs(amount)),
    playerId: client.id,
    createdBy: user.sub,
    description,
  })

  return c.json({ balance: newBalance })
})

clientsRouter.post('/:id/bonus', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number(),
  reason: z.string().optional(),
})), async (c) => {
  const { amount, reason } = c.req.valid('json')
  const [client] = await db.select().from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!client) return c.json({ error: 'Not found' }, 404)

  const newBonus = parseFloat(client.bonusPoints) + amount
  if (newBonus < 0) return c.json({ error: 'Insufficient bonus points' }, 400)

  await db.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, client.id))
  await db.insert(bonusHistory).values({
    profileId: client.id,
    amount: String(amount),
    balanceAfter: String(newBonus),
    reason,
  })

  return c.json({ bonusPoints: newBonus })
})

clientsRouter.get('/:id/bonus-history', async (c) => {
  const rows = await db
    .select()
    .from(bonusHistory)
    .where(eq(bonusHistory.profileId, c.req.param('id')))
    .orderBy(desc(bonusHistory.createdAt))
    .limit(50)
  return c.json({ history: rows })
})
