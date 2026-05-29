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
// Все операции с клиентами — только персонал/владелец (PII, балансы, история).
// Клиентский кошелёк (роль client) обслуживается отдельным self-эндпоинтом.
clientsRouter.use('*', requireRole('owner', 'staff'))

clientsRouter.get('/', async (c) => {
  const search = c.req.query('search')
  const filter = c.req.query('filter')
  const page = Number(c.req.query('page') ?? 1)
  const limit = 30
  const offset = (page - 1) * limit

  // debtors filter — clients with negative balance
  if (filter === 'debtors') {
    const clients = await db
      .select()
      .from(profiles)
      .where(and(
        eq(profiles.role, 'client'),
        isNull(profiles.deletedAt),
        sql`${profiles.balance}::numeric < 0`,
      ))
      .orderBy(sql`${profiles.balance}::numeric asc`)
    const safe = clients.map(({ pin, passwordHash, ...c }) => c)
    return c.json({ clients: safe, total: safe.length, page: 1, limit: safe.length })
  }

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
  description: z.string().min(3, 'Причина обязательна (минимум 3 символа)').optional(),
  reason: z.string().min(3, 'Причина обязательна (минимум 3 символа)').optional(),
})), async (c) => {
  const { amount, description, reason } = c.req.valid('json')
  const note = description ?? reason
  if (!note) {
    return c.json({ error: 'Необходимо указать причину изменения баланса (description или reason)' }, 400)
  }
  const user = c.get('user')
  const [client] = await db.select().from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!client) return c.json({ error: 'Not found' }, 404)

  // Лимит долга из app_settings (max_client_debt)
  const newBalance = parseFloat(client.balance) + amount
  if (amount < 0) {
    const maxDebtRow = await db.execute(sql`SELECT value FROM app_settings WHERE key = 'max_client_debt'`)
    const maxDebt = parseFloat(((maxDebtRow as any).rows?.[0]?.value ?? (maxDebtRow as any)[0]?.value) ?? '5000')
    if (newBalance < -maxDebt) {
      return c.json({ error: `Превышен лимит долга (${maxDebt}₽). Запрошенный баланс: ${newBalance.toFixed(2)}₽` }, 400)
    }
  }

  // Атомарное обновление баланса с условием равенства старого значения (optimistic lock)
  const updateResult = await db.execute(sql`
    UPDATE profiles
    SET balance = ${String(newBalance)}
    WHERE id = ${client.id} AND balance = ${client.balance}
    RETURNING balance
  `)
  const rows = (updateResult as any).rows ?? updateResult
  if (!rows || rows.length === 0) {
    return c.json({ error: 'Баланс был изменён другим запросом. Повторите попытку.' }, 409)
  }

  await db.insert(transactions).values({
    type: amount >= 0 ? 'deposit' : 'withdrawal',
    amount: String(Math.abs(amount)),
    playerId: client.id,
    createdBy: user.sub,
    description: note,
  })

  return c.json({ balance: newBalance })
})

clientsRouter.post('/:id/bonus', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number(),
  reason: z.string().min(3, 'Причина обязательна (минимум 3 символа)'),
})), async (c) => {
  const { amount, reason } = c.req.valid('json')
  const user = c.get('user')
  const [client] = await db.select().from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!client) return c.json({ error: 'Not found' }, 404)

  // Атомарный апдейт: при списании проверяем достаточность через условие в SQL
  let updateResult: any
  if (amount < 0) {
    updateResult = await db.execute(sql`
      UPDATE profiles
      SET bonus_points = bonus_points + ${amount}
      WHERE id = ${client.id} AND bonus_points >= ${Math.abs(amount)}
      RETURNING bonus_points
    `)
  } else {
    updateResult = await db.execute(sql`
      UPDATE profiles
      SET bonus_points = bonus_points + ${amount}
      WHERE id = ${client.id}
      RETURNING bonus_points
    `)
  }
  const rows = updateResult.rows ?? updateResult
  if (!rows || rows.length === 0) {
    return c.json({ error: 'Insufficient bonus points' }, 400)
  }
  const newBonus = parseFloat(String(rows[0].bonus_points ?? rows[0].bonusPoints ?? 0))

  await db.insert(bonusHistory).values({
    profileId: client.id,
    amount: String(amount),
    balanceAfter: String(newBonus),
    reason: `[${user.nickname ?? user.sub}] ${reason}`,
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
