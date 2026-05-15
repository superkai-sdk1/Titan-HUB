import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, checks, checkItems, checkItemModifiers, checkPayments, checkDiscounts,
  inventory, profiles, spaces, certificates, bonusHistory, transactions, modifiers as modifiersTable,
  appSettings,
  eq, and, inArray, desc, sql, isNull,
} from '@titan/database'
import { requireAuth } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'
import { Redis } from 'ioredis'

function publishEvent(event: string, data: unknown) {
  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  redis.publish('titan:updates', JSON.stringify({ event, data, ts: Date.now() }))
    .finally(() => redis.disconnect())
    .catch(() => {})
}

const AddItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  modifierIds: z.array(z.string().uuid()).default([]),
})

const PaySchema = z.object({
  payments: z.array(z.object({
    method: z.enum(['cash', 'card', 'transfer', 'bonus', 'deposit', 'debt', 'split', 'certificate']),
    amount: z.number().positive(),
  })).min(1),
  certificateCode: z.string().optional(),
  bonusAmount: z.number().min(0).optional(),
  playerId: z.string().uuid().optional(),
  note: z.string().optional(),
})

const OpenCheckSchema = z.object({
  spaceId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  guestNames: z.array(z.string()).default([]),
  note: z.string().optional(),
})

export const posRouter = new Hono<AppEnv>()
posRouter.use('*', requireAuth)

async function getCheckWithItems(checkId: string) {
  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check) return null
  const items = await db
    .select({ checkItem: checkItems, item: inventory })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .where(eq(checkItems.checkId, checkId))
  const payments = await db.select().from(checkPayments).where(eq(checkPayments.checkId, checkId))
  const discountRows = await db.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))

  // Получаем hourlyRate пространства для live-расчёта аренды на фронте
  let spaceHourlyRate: string | null = null
  if (check.spaceId) {
    const [space] = await db.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
    spaceHourlyRate = space?.hourlyRate ?? null
  }

  return { ...check, items, payments, discounts: discountRows, spaceHourlyRate }
}

async function recalcCheckTotal(checkId: string) {
  const items = await db.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  const discountRows = await db.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
  const itemsTotal = items.reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)
  const discountTotal = discountRows.reduce((s, d) => s + parseFloat(d.amount), 0)
  const total = Math.max(0, itemsTotal - discountTotal)
  await db.update(checks).set({
    totalAmount: String(total),
    discountTotal: String(discountTotal),
  }).where(eq(checks.id, checkId))
  return total
}

posRouter.get('/players/search', async (c) => {
  const q = c.req.query('q') ?? ''
  if (!q.trim()) return c.json({ players: [] })
  const term = `%${q.toLowerCase()}%`

  const playerFields = {
    id: profiles.id,
    nickname: profiles.nickname,
    clientTier: profiles.clientTier,
    balance: profiles.balance,
    bonusPoints: profiles.bonusPoints,
    photoUrl: profiles.photoUrl,
  }
  const baseWhere = and(eq(profiles.role, 'client'), isNull(profiles.deletedAt))

  const [byNick, byTags] = await Promise.all([
    db.select(playerFields).from(profiles)
      .where(and(baseWhere, sql`lower(${profiles.nickname}) like ${term}`))
      .limit(20),
    db.select(playerFields).from(profiles)
      .where(and(baseWhere, sql`exists (
        select 1 from unnest(${profiles.searchTags}) as tag
        where lower(tag) like ${term}
      )`))
      .limit(20),
  ])

  // Дедупликация: byNick приоритетнее, потом byTags без дублей
  const seen = new Set<string>()
  const players = [...byNick, ...byTags].filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).slice(0, 20)

  return c.json({ players })
})

posRouter.get('/spaces', async (c) => {
  const rows = await db.select().from(spaces).where(eq(spaces.isActive, true))
  return c.json({ spaces: rows })
})

posRouter.get('/players/:id', async (c) => {
  const [player] = await db.select({
    id: profiles.id,
    nickname: profiles.nickname,
    clientTier: profiles.clientTier,
    balance: profiles.balance,
    bonusPoints: profiles.bonusPoints,
    photoUrl: profiles.photoUrl,
    linkedSpaceId: profiles.linkedSpaceId,
  }).from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!player) return c.json({ error: 'Not found' }, 404)
  return c.json({ player })
})

posRouter.get('/checks', async (c) => {
  const shift = await getCurrentShift()
  if (!shift) return c.json({ checks: [] })
  const spaceId = c.req.query('spaceId')
  const whereClause = spaceId
    ? and(eq(checks.shiftId, shift.id), inArray(checks.status, ['open']), eq(checks.spaceId, spaceId))
    : and(eq(checks.shiftId, shift.id), inArray(checks.status, ['open']))
  const rows = await db
    .select()
    .from(checks)
    .where(whereClause)
    .orderBy(desc(checks.createdAt))
  // attach item count
  const enriched = await Promise.all(rows.map(async (ch) => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkItems)
      .where(eq(checkItems.checkId, ch.id))
    return { ...ch, itemCount: count }
  }))
  return c.json({ checks: enriched })
})

posRouter.post('/checks', zValidator('json', OpenCheckSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const shift = await getCurrentShift()
  if (!shift) return c.json({ error: 'No open shift' }, 400)

  const [check] = await db.insert(checks).values({
    staffId: user.sub,
    shiftId: shift.id,
    status: 'open',
    ...body,
    // Устанавливаем время начала аренды если передан spaceId
    spaceStartAt: body.spaceId ? new Date() : undefined,
  }).returning()
  publishEvent('check:created', { checkId: check.id, shiftId: shift.id })
  return c.json({ check }, 201)
})

posRouter.get('/checks/:id', async (c) => {
  const data = await getCheckWithItems(c.req.param('id'))
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({ check: data })
})

posRouter.patch('/checks/:id', zValidator('json', z.object({
  spaceId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  guestNames: z.array(z.string()).optional(),
  note: z.string().optional(),
  linkedEventId: z.string().uuid().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const [check] = await db.update(checks).set(body).where(eq(checks.id, c.req.param('id'))).returning()
  if (!check) return c.json({ error: 'Not found' }, 404)
  return c.json({ check })
})

posRouter.delete('/checks/:id', async (c) => {
  const [check] = await db
    .update(checks)
    .set({ status: 'cancelled' })
    .where(and(eq(checks.id, c.req.param('id')), eq(checks.status, 'open')))
    .returning()
  if (!check) return c.json({ error: 'Not found or already closed' }, 400)
  publishEvent('check:deleted', { checkId: check.id })
  return c.json({ ok: true })
})

posRouter.post('/checks/:id/items', zValidator('json', AddItemSchema), async (c) => {
  const { itemId, quantity, modifierIds } = c.req.valid('json')
  const checkId = c.req.param('id')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  const [item] = await db.select().from(inventory).where(eq(inventory.id, itemId))
  if (!item) return c.json({ error: 'Item not found' }, 404)

  // Deduct stock if tracked
  if (item.trackStock && item.stockQuantity < quantity) {
    return c.json({ error: 'Insufficient stock' }, 400)
  }
  if (item.trackStock) {
    await db.update(inventory).set({ stockQuantity: item.stockQuantity - quantity }).where(eq(inventory.id, itemId))
  }

  const [checkItem] = await db.insert(checkItems).values({
    checkId,
    itemId,
    quantity,
    priceAtTime: item.price,
  }).returning()

  // Add modifiers
  if (modifierIds.length) {
    const modRows = await db.select().from(modifiersTable).where(inArray(modifiersTable.id, modifierIds))
    if (modRows.length) {
      await db.insert(checkItemModifiers).values(modRows.map(m => ({
        checkItemId: checkItem.id,
        modifierId: m.id,
        priceAtTime: m.price,
      })))
    }
  }

  await recalcCheckTotal(checkId)
  publishEvent('check:updated', { checkId })
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data }, 201)
})

posRouter.patch('/checks/:id/items/:itemId', zValidator('json', z.object({ quantity: z.number().int().min(0) })), async (c) => {
  const checkId = c.req.param('id')
  const itemId = c.req.param('itemId')
  const { quantity } = c.req.valid('json')

  if (quantity === 0) {
    await db.delete(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
  } else {
    await db.update(checkItems).set({ quantity }).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
  }

  await recalcCheckTotal(checkId)
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.delete('/checks/:id/items/:itemId', async (c) => {
  const checkId = c.req.param('id')
  const itemId = c.req.param('itemId')
  await db.delete(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
  await recalcCheckTotal(checkId)
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.post('/checks/:id/discount', zValidator('json', z.object({
  name: z.string(),
  type: z.enum(['percent', 'fixed']),
  value: z.number().positive(),
  target: z.enum(['check', 'item']).default('check'),
  itemId: z.string().uuid().optional(),
})), async (c) => {
  const checkId = c.req.param('id')
  const body = c.req.valid('json')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  const baseAmount = parseFloat(check.totalAmount) + parseFloat(check.discountTotal ?? '0')
  const discountAmount = body.type === 'percent'
    ? baseAmount * (body.value / 100)
    : body.value

  await db.insert(checkDiscounts).values({
    checkId,
    name: body.name,
    type: body.type,
    value: String(body.value),
    amount: String(discountAmount),
    target: body.target,
    itemId: body.itemId,
  })

  await recalcCheckTotal(checkId)
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.post('/checks/:id/pay', zValidator('json', PaySchema), async (c) => {
  const checkId = c.req.param('id')
  const user = c.get('user')
  const body = c.req.valid('json')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  const total = parseFloat(check.totalAmount)
  const paidTotal = body.payments.reduce((s, p) => s + p.amount, 0)
  if (paidTotal < total - 0.01) {
    return c.json({ error: `Underpayment: total ${total}, paid ${paidTotal}` }, 400)
  }

  // Validate bonus payment
  if (body.bonusAmount && body.bonusAmount > 0 && body.playerId) {
    const [player] = await db.select().from(profiles).where(eq(profiles.id, body.playerId))
    if (!player || parseFloat(player.bonusPoints) < body.bonusAmount) {
      return c.json({ error: 'Insufficient bonus points' }, 400)
    }
  }

  // Validate certificate
  let cert = null
  if (body.certificateCode) {
    const [c2] = await db.select().from(certificates).where(eq(certificates.code, body.certificateCode))
    if (!c2 || c2.isUsed || parseFloat(c2.balance) < 0.01) {
      return c.json({ error: 'Invalid or used certificate' }, 400)
    }
    cert = c2
  }

  // Insert payments
  await db.insert(checkPayments).values(body.payments.map(p => ({
    checkId,
    method: p.method as any,
    amount: String(p.amount),
  })))
  publishEvent('check:paid', { checkId })

  // Deduct bonus
  if (body.bonusAmount && body.bonusAmount > 0 && body.playerId) {
    const [player] = await db.select().from(profiles).where(eq(profiles.id, body.playerId))
    if (player) {
      const newBonus = parseFloat(player.bonusPoints) - body.bonusAmount
      await db.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, body.playerId))
      await db.insert(bonusHistory).values({
        profileId: body.playerId,
        amount: String(-body.bonusAmount),
        balanceAfter: String(newBonus),
        reason: `Payment for check`,
      })
    }
  }

  // Use certificate
  if (cert) {
    const certPay = body.payments.find(p => p.method === 'certificate')
    const used = certPay?.amount ?? 0
    const newBalance = parseFloat(cert.balance) - used
    await db.update(certificates).set({
      balance: String(Math.max(0, newBalance)),
      isUsed: newBalance <= 0,
      usedBy: body.playerId ?? null,
      usedAt: new Date(),
    }).where(eq(certificates.id, cert.id))
  }

  // Record transaction
  await db.insert(transactions).values({
    type: 'payment',
    amount: String(total),
    checkId,
    playerId: body.playerId ?? null,
    createdBy: user.sub,
    description: `Check payment`,
  })

  // Close check
  const primaryMethod = body.payments.reduce((a, b) => a.amount >= b.amount ? a : b)
  const [closed] = await db.update(checks).set({
    status: 'closed',
    paymentMethod: primaryMethod.method as any,
    bonusUsed: String(body.bonusAmount ?? 0),
    certificateId: cert?.id ?? null,
    certificateUsed: cert ? String(body.payments.find(p => p.method === 'certificate')?.amount ?? 0) : '0',
    playerId: body.playerId ?? null,
    note: body.note ?? null,
    closedAt: new Date(),
  }).where(eq(checks.id, checkId)).returning()

  publishEvent('check:closed', { checkId })

  // Начисление бонусов с учётом настроек app_settings
  if (body.playerId) {
    const settingsRows = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, ['bonus_enabled', 'bonus_accrual_rate', 'bonus_min_purchase', 'bonus_accrual_on_debt']))
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]))

    const bonusEnabled = settings['bonus_enabled'] !== 'false'
    const accrualRate = parseFloat(settings['bonus_accrual_rate'] ?? '5') / 100
    const minPurchase = parseFloat(settings['bonus_min_purchase'] ?? '0')
    const accrualOnDebt = settings['bonus_accrual_on_debt'] === 'true'
    const hasDebtPayment = body.payments.some(p => p.method === 'debt')

    if (bonusEnabled && total >= minPurchase && !(hasDebtPayment && !accrualOnDebt)) {
      const bonusEarned = Math.floor(total * accrualRate)
      if (bonusEarned > 0) {
        const [player] = await db.select().from(profiles).where(eq(profiles.id, body.playerId))
        if (player) {
          const newBonus = parseFloat(player.bonusPoints) + bonusEarned
          await db.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, body.playerId))
          await db.insert(bonusHistory).values({
            profileId: body.playerId,
            amount: String(bonusEarned),
            balanceAfter: String(newBonus),
            reason: `${Math.round(accrualRate * 100)}% начисление за чек`,
          })
        }
      }
    }
  }

  return c.json({ check: closed })
})
