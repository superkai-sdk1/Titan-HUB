import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, checks, checkItems, checkItemModifiers, checkPayments, checkDiscounts,
  inventory, profiles, spaces, certificates, bonusHistory, transactions, modifiers as modifiersTable,
  appSettings, events, discounts, clientDiscountRules,
  eq, and, inArray, desc, sql, isNull,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'
import { accrueBonusLot, spendBonusLots, getBonusExpiryDays } from '../../lib/bonusLots.js'
import { Redis } from 'ioredis'

function publishEvent(event: string, data: unknown) {
  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  redis.publish('titan:updates', JSON.stringify({ event, data, ts: Date.now() }))
    .finally(() => redis.disconnect())
    .catch(() => {})
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Единый расчёт суммы чека: позиции + модификаторы − скидки.
// Скидки пересчитываются от ТЕКУЩИХ позиций (не доверяем сохранённому amount),
// иначе изменение/удаление позиции оставит «застывшую» скидку.
function computeTotals(
  items: { id: string; priceAtTime: string; quantity: number }[],
  mods: { checkItemId: string; priceAtTime: string }[],
  discountRows: { type: string; value: string; target: string; itemId: string | null }[],
) {
  const qtyByItem = new Map(items.map(i => [i.id, i.quantity]))
  const itemsTotal = items.reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)
  const modsTotal = mods.reduce((s, m) => s + parseFloat(m.priceAtTime) * (qtyByItem.get(m.checkItemId) ?? 1), 0)
  const gross = itemsTotal + modsTotal
  let discountTotal = 0
  for (const d of discountRows) {
    let base = gross
    if (d.target === 'item' && d.itemId) {
      const it = items.find(i => i.id === d.itemId)
      base = it ? parseFloat(it.priceAtTime) * it.quantity : 0
    }
    discountTotal += d.type === 'percent' ? base * (parseFloat(d.value) / 100) : Math.min(parseFloat(d.value), base)
  }
  discountTotal = Math.min(discountTotal, gross)
  return { gross: round2(gross), discountTotal: round2(discountTotal), total: round2(Math.max(0, gross - discountTotal)) }
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
  linkedEventId: z.string().uuid().optional(),
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

  // Модификаторы по позициям (для отображения и корректной суммы на фронте)
  const checkItemIds = items.map(i => i.checkItem.id)
  const itemMods = checkItemIds.length
    ? await db.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, checkItemIds))
    : []
  const modsByItem = new Map<string, typeof itemMods>()
  for (const m of itemMods) {
    const arr = modsByItem.get(m.checkItemId) ?? []
    arr.push(m)
    modsByItem.set(m.checkItemId, arr)
  }
  const itemsWithMods = items.map(i => ({ ...i, modifiers: modsByItem.get(i.checkItem.id) ?? [] }))

  // Получаем hourlyRate пространства для live-расчёта аренды на фронте
  let spaceHourlyRate: string | null = null
  if (check.spaceId) {
    const [space] = await db.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
    spaceHourlyRate = space?.hourlyRate ?? null
  }

  // Имя для заголовка чека: ник привязанного клиента либо первый из гостей.
  // (раньше деталь не отдавала guestName — заголовок всегда показывал «Гость»).
  let guestName: string | null = null
  if (check.playerId) {
    const [player] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, check.playerId))
    guestName = player?.nickname ?? null
  } else if (check.guestNames && check.guestNames.length > 0) {
    guestName = check.guestNames[0] ?? null
  }

  return { ...check, items: itemsWithMods, payments, discounts: discountRows, spaceHourlyRate, guestName }
}

// Авто-скидки из справочника `discounts` (isActive && isAuto) применяются к чеку
// при каждом пересчёте. Правила:
//   • discount.itemId  → target='item' на эту позицию, если она есть в чеке
//                        и её количество ≥ minQuantity.
//   • discount.clientId→ общая скидка на чек, только если playerId чека совпадает.
//   • без itemId/clientId → общая скидка на чек.
// Прежде применённые авто-строки (discountId IS NOT NULL) удаляются и
// пересоздаются, чтобы суммы оставались верными при изменении позиций и не
// плодились дубли. Ручные скидки (discountId IS NULL из /discount) не трогаем.
// База/сумма считаются тем же правилом, что и computeTotals / ручная скидка.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbOrTx = typeof db | Tx

async function applyAutoDiscounts(exec: DbOrTx, checkId: string) {
  const [check] = await exec.select().from(checks).where(eq(checks.id, checkId))
  if (!check) return

  const items = await exec.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  // База для check-скидок — сумма позиций (без модификаторов, как у ручной /discount).
  const itemsSum = items.reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)

  // Удаляем ранее применённые авто-скидки (по наличию discountId) перед пересчётом.
  await exec.delete(checkDiscounts).where(
    and(eq(checkDiscounts.checkId, checkId), sql`${checkDiscounts.discountId} IS NOT NULL`),
  )

  const toInsert: (typeof checkDiscounts.$inferInsert)[] = []
  const applied = new Set<string>() // дедуп по id скидки (auto + tier не задвоить)

  function pushDiscount(d: typeof discounts.$inferSelect) {
    if (applied.has(d.id)) return
    applied.add(d.id)
    if (d.itemId) {
      // Скидка на конкретную позицию: к каждой строке этого товара, прошедшей minQuantity.
      const minQty = d.minQuantity ?? 1
      for (const it of items.filter(i => i.itemId === d.itemId && i.quantity >= minQty)) {
        const base = parseFloat(it.priceAtTime) * it.quantity
        const amount = d.type === 'percent'
          ? base * (parseFloat(d.value) / 100)
          : Math.min(parseFloat(d.value), base)
        if (amount <= 0) continue
        toInsert.push({
          checkId, discountId: d.id, name: d.name, type: d.type,
          value: String(d.value), amount: String(round2(amount)),
          target: 'item', itemId: it.id,
        })
      }
    } else {
      const base = itemsSum
      const amount = d.type === 'percent'
        ? base * (parseFloat(d.value) / 100)
        : Math.min(parseFloat(d.value), base)
      if (amount <= 0) return
      toInsert.push({
        checkId, discountId: d.id, name: d.name, type: d.type,
        value: String(d.value), amount: String(round2(amount)),
        target: 'check', itemId: null,
      })
    }
  }

  // 1. Авто-скидки (isAuto). Общая скидка с clientId — только для совпадающего клиента.
  const autoRows = await exec.select().from(discounts)
    .where(and(eq(discounts.isActive, true), eq(discounts.isAuto, true)))
  for (const d of autoRows) {
    if (!d.itemId && d.clientId && d.clientId !== check.playerId) continue
    pushDiscount(d)
  }

  // 2. Скидки по тиру: активное правило для тира клиента → связанная активная скидка
  //    (применяется в силу правила, независимо от флага isAuto самой скидки).
  //    Если на тир настроено НЕСКОЛЬКО активных правил — применяем ТОЛЬКО ОДНО,
  //    с максимальным эффектом (а не стопку), чтобы скидки не складывались сверх
  //    замысла. Эффект оцениваем на сумме позиций (check-level база).
  if (check.playerId) {
    const [player] = await exec.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, check.playerId))
    if (player?.tier) {
      const tierRows = await exec.select({ d: discounts })
        .from(clientDiscountRules)
        .innerJoin(discounts, eq(discounts.id, clientDiscountRules.discountId))
        .where(and(
          eq(clientDiscountRules.isActive, true),
          eq(clientDiscountRules.clientTier, player.tier),
          eq(discounts.isActive, true),
        ))
      const effect = (d: typeof discounts.$inferSelect) => {
        const base = d.itemId
          ? items.filter(i => i.itemId === d.itemId).reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)
          : itemsSum
        return d.type === 'percent' ? base * (parseFloat(d.value) / 100) : Math.min(parseFloat(d.value), base)
      }
      const best = tierRows.map(r => r.d).filter(d => !applied.has(d.id))
        .sort((a, b) => effect(b) - effect(a))[0]
      if (best) pushDiscount(best)
    }
  }

  if (toInsert.length) await exec.insert(checkDiscounts).values(toInsert)
}

async function recalcCheckTotal(checkId: string, exec: DbOrTx = db) {
  // Сначала пересчитываем авто-скидки от текущих позиций, затем итог.
  await applyAutoDiscounts(exec, checkId)
  const items = await exec.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  const ids = items.map(i => i.id)
  const mods = ids.length
    ? await exec.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ids))
    : []
  const discountRows = await exec.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
  const { discountTotal, total } = computeTotals(items, mods, discountRows)
  await exec.update(checks).set({
    totalAmount: String(total),
    discountTotal: String(discountTotal),
  }).where(eq(checks.id, checkId))
  return total
}

// Аренда зоны на момент now (или до spaceEndAt): ceil(минуты/60) × ставка.
// Тем же правилом считают /pay и вебхук Platega — держать синхронно.
async function computeRentalForCheck(exec: DbOrTx, check: typeof checks.$inferSelect): Promise<number> {
  if (!check.spaceId || !check.spaceStartAt) return 0
  const [space] = await exec.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
  if (!space?.hourlyRate) return 0
  const endMs = check.spaceEndAt ? new Date(check.spaceEndAt).getTime() : Date.now()
  const mins = Math.max(0, (endMs - new Date(check.spaceStartAt).getTime()) / 60000)
  return Math.ceil(mins / 60) * parseFloat(space.hourlyRate)
}

// Авторитетный итог чека к оплате = позиции+модификаторы−скидки + аренда.
// Используется для QR (сумма НЕ берётся с клиента) и сверки.
async function computeCheckGrandTotal(exec: DbOrTx, check: typeof checks.$inferSelect): Promise<number> {
  const items = await exec.select().from(checkItems).where(eq(checkItems.checkId, check.id))
  const ids = items.map(i => i.id)
  const mods = ids.length
    ? await exec.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ids))
    : []
  const discountRows = await exec.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, check.id))
  const { total: itemsTotal } = computeTotals(items, mods, discountRows)
  const rental = await computeRentalForCheck(exec, check)
  return round2(itemsTotal + rental)
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

posRouter.get('/players/:id', requireRole('owner', 'staff', 'tablet'), async (c) => {
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
  const eventId = c.req.query('eventId')
  const conditions: any[] = [
    eq(checks.shiftId, shift.id),
    inArray(checks.status, ['open']),
  ]
  if (spaceId) conditions.push(eq(checks.spaceId, spaceId))
  if (eventId) conditions.push(eq(checks.linkedEventId, eventId))
  const whereClause = and(...(conditions as [any, ...any[]]))
  const rows = await db
    .select()
    .from(checks)
    .where(whereClause)
    .orderBy(desc(checks.createdAt))
  // attach item count + player nickname
  const enriched = await Promise.all(rows.map(async (ch) => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkItems)
      .where(eq(checkItems.checkId, ch.id))

    let guestName: string | null = null
    if (ch.playerId) {
      const [player] = await db
        .select({ nickname: profiles.nickname })
        .from(profiles)
        .where(eq(profiles.id, ch.playerId))
      guestName = player?.nickname ?? null
    } else if (ch.guestNames && ch.guestNames.length > 0) {
      guestName = ch.guestNames[0]
    }

    // Аренда: имя зоны + ставка (нужно планшету для live-таймера и карточкам POS)
    let spaceName: string | null = null
    let spaceHourlyRate: string | null = null
    if (ch.spaceId) {
      const [sp] = await db
        .select({ name: spaces.name, hourlyRate: spaces.hourlyRate })
        .from(spaces)
        .where(eq(spaces.id, ch.spaceId))
      spaceName = sp?.name ?? null
      spaceHourlyRate = sp?.hourlyRate ?? null
    }

    return { ...ch, itemCount: count, guestName, spaceName, spaceHourlyRate, hasRental: !!ch.spaceId }
  }))
  return c.json({ checks: enriched })
})

posRouter.post('/checks', requireRole('owner', 'staff'), zValidator('json', OpenCheckSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const shift = await getCurrentShift()
  if (!shift) return c.json({ error: 'No open shift' }, 400)

  // Проверка лимита гостей события, если чек привязывается к нему
  if (body.linkedEventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, body.linkedEventId))
    if (!ev) return c.json({ error: 'Linked event not found' }, 404)
    if (ev.status === 'cancelled' || ev.status === 'completed') {
      return c.json({ error: 'Невозможно прикрепить чек к завершённому или отменённому событию' }, 400)
    }
    if (ev.maxGuests != null && (ev.attendeesCount ?? 0) >= ev.maxGuests) {
      return c.json({ error: `Превышен лимит гостей мероприятия (${ev.maxGuests})` }, 400)
    }
  }

  const [check] = await db.insert(checks).values({
    staffId: user.sub,
    shiftId: shift.id,
    status: 'open',
    ...body,
    // Устанавливаем время начала аренды если передан spaceId
    spaceStartAt: body.spaceId ? new Date() : undefined,
  }).returning()

  // Инкрементим attendeesCount события если чек привязан
  if (body.linkedEventId) {
    await db.update(events)
      .set({ attendeesCount: sql`${events.attendeesCount} + 1` })
      .where(eq(events.id, body.linkedEventId))
  }

  publishEvent('check:created', { checkId: check!.id, shiftId: shift.id })
  return c.json({ check }, 201)
})

// Недавно закрытые чеки — для выбора при оформлении возврата.
// Должен идти ДО /checks/:id, иначе "closed" перехватится как id.
posRouter.get('/checks/closed', requireRole('owner', 'staff'), async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 30) || 30, 50)
  const rows = await db.select().from(checks)
    .where(eq(checks.status, 'closed'))
    .orderBy(desc(checks.closedAt))
    .limit(limit)
  const enriched = await Promise.all(rows.map(async (ch) => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkItems)
      .where(eq(checkItems.checkId, ch.id))
    let guestName: string | null = null
    if (ch.playerId) {
      const [p] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, ch.playerId))
      guestName = p?.nickname ?? null
    } else if (ch.guestNames && ch.guestNames.length > 0) {
      guestName = ch.guestNames[0]
    }
    return { id: ch.id, totalAmount: ch.totalAmount, closedAt: ch.closedAt, paymentMethod: ch.paymentMethod, itemCount: count, guestName }
  }))
  return c.json({ checks: enriched })
})

posRouter.get('/checks/:id', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const data = await getCheckWithItems(c.req.param('id'))
  if (!data) return c.json({ error: 'Not found' }, 404)
  // IDOR-защита для планшета: планшет видит только чеки СВОЕЙ зоны
  // (linkedSpaceId), а не любой чек по id. owner/staff — без ограничений.
  const user = c.get('user')
  if (user.role === 'tablet') {
    const [me] = await db.select({ spaceId: profiles.linkedSpaceId }).from(profiles).where(eq(profiles.id, user.sub))
    if (!me?.spaceId || data.spaceId !== me.spaceId) return c.json({ error: 'Forbidden' }, 403)
  }
  return c.json({ check: data })
})

posRouter.patch('/checks/:id', requireRole('owner', 'staff'), zValidator('json', z.object({
  spaceId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  guestNames: z.array(z.string()).optional(),
  note: z.string().optional(),
  linkedEventId: z.string().uuid().optional(),
  // Время аренды зоны: ISO-строки. spaceEndAt=null → снова «открытая» аренда
  // (живой счётчик до момента оплаты).
  spaceStartAt: z.string().datetime().optional(),
  spaceEndAt: z.string().datetime().nullable().optional(),
})), async (c) => {
  const checkId = c.req.param('id')
  const { spaceStartAt, spaceEndAt, ...rest } = c.req.valid('json')
  const update: Record<string, any> = { ...rest }
  if (spaceStartAt !== undefined) update.spaceStartAt = new Date(spaceStartAt)
  if (spaceEndAt !== undefined) update.spaceEndAt = spaceEndAt === null ? null : new Date(spaceEndAt)
  const [updated] = await db.update(checks).set(update).where(eq(checks.id, checkId)).returning()
  if (!updated) return c.json({ error: 'Not found' }, 404)
  publishEvent('check:updated', { checkId })
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.delete('/checks/:id', requireRole('owner', 'staff'), async (c) => {
  const checkId = c.req.param('id')
  const check = await db.transaction(async (tx) => {
    const [ch] = await tx
      .update(checks)
      .set({ status: 'cancelled' })
      .where(and(eq(checks.id, checkId), eq(checks.status, 'open')))
      .returning()
    if (!ch) return null

    // Возвращаем списанный сток по всем учётным позициям отменённого чека
    const lines = await tx.select({ itemId: checkItems.itemId, quantity: checkItems.quantity })
      .from(checkItems).where(eq(checkItems.checkId, checkId))
    for (const ln of lines) {
      await tx.update(inventory)
        .set({ stockQuantity: sql`${inventory.stockQuantity} + ${ln.quantity}` })
        .where(and(eq(inventory.id, ln.itemId), eq(inventory.trackStock, true)))
    }

    // Декрементим attendeesCount, если чек был привязан к событию
    if (ch.linkedEventId) {
      await tx.update(events)
        .set({ attendeesCount: sql`GREATEST(${events.attendeesCount} - 1, 0)` })
        .where(eq(events.id, ch.linkedEventId))
    }
    return ch
  })
  if (!check) return c.json({ error: 'Not found or already closed' }, 400)

  publishEvent('check:deleted', { checkId: check.id })
  return c.json({ ok: true })
})

posRouter.post('/checks/:id/items', requireRole('owner', 'staff', 'tablet'), zValidator('json', AddItemSchema), async (c) => {
  const { itemId, quantity, modifierIds } = c.req.valid('json')
  const checkId = c.req.param('id')

  // Атомарная транзакция: проверка чека + блокировка stock + списание + insert позиции
  try {
    const checkItem = await db.transaction(async (tx) => {
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId))
      if (!check || check.status !== 'open') {
        throw new Error('CHECK_NOT_OPEN')
      }

      // SELECT ... FOR UPDATE блокирует строку до конца транзакции
      const itemRows = await tx.execute(
        sql`SELECT id, price, track_stock as "trackStock", stock_quantity as "stockQuantity"
            FROM inventory WHERE id = ${itemId} FOR UPDATE`
      )
      const item: any = (itemRows as any).rows?.[0] ?? (itemRows as any)[0]
      if (!item) throw new Error('ITEM_NOT_FOUND')

      // Атомарная проверка стока в условиях блокировки
      if (item.trackStock && (item.stockQuantity ?? 0) < quantity) {
        throw new Error('INSUFFICIENT_STOCK')
      }
      if (item.trackStock) {
        await tx.update(inventory)
          .set({ stockQuantity: sql`${inventory.stockQuantity} - ${quantity}` })
          .where(eq(inventory.id, itemId))
      }

      // Мерж с существующей строкой того же товара БЕЗ модификаторов: повторное
      // добавление увеличивает количество (а не плодит дубли) — иначе авто-скидки
      // с minQuantity по одной строке не срабатывают. Позиции с модификаторами
      // различаются составом → всегда отдельная строка.
      if (!modifierIds.length) {
        const existing = await tx
          .select({ id: checkItems.id, quantity: checkItems.quantity })
          .from(checkItems)
          .leftJoin(checkItemModifiers, eq(checkItemModifiers.checkItemId, checkItems.id))
          .where(and(
            eq(checkItems.checkId, checkId),
            eq(checkItems.itemId, itemId),
            isNull(checkItemModifiers.id),
          ))
          .limit(1)
        if (existing.length && existing[0]) {
          const [merged] = await tx.update(checkItems)
            .set({ quantity: sql`${checkItems.quantity} + ${quantity}` })
            .where(eq(checkItems.id, existing[0].id))
            .returning()
          return merged
        }
      }

      const [insertedItem] = await tx.insert(checkItems).values({
        checkId,
        itemId,
        quantity,
        priceAtTime: String(item.price),
      }).returning()

      // Add modifiers within same transaction
      if (modifierIds.length) {
        const modRows = await tx.select().from(modifiersTable).where(inArray(modifiersTable.id, modifierIds))
        if (modRows.length) {
          await tx.insert(checkItemModifiers).values(modRows.map(m => ({
            checkItemId: insertedItem!.id,
            modifierId: m.id,
            priceAtTime: m.price,
          })))
        }
      }

      return insertedItem
    })

    if (!checkItem) return c.json({ error: 'Failed to add item' }, 500)

    await recalcCheckTotal(checkId)
    publishEvent('check:updated', { checkId })
    const data = await getCheckWithItems(checkId)
    return c.json({ check: data }, 201)
  } catch (err: any) {
    if (err.message === 'CHECK_NOT_OPEN') return c.json({ error: 'Check not open' }, 400)
    if (err.message === 'ITEM_NOT_FOUND') return c.json({ error: 'Item not found' }, 404)
    if (err.message === 'INSUFFICIENT_STOCK') return c.json({ error: 'Insufficient stock' }, 400)
    console.error('POST /checks/:id/items error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
})

posRouter.patch('/checks/:id/items/:itemId', requireRole('owner', 'staff', 'tablet'), zValidator('json', z.object({ quantity: z.number().int().min(0) })), async (c) => {
  const checkId = c.req.param('id')
  const itemId = c.req.param('itemId')
  const { quantity } = c.req.valid('json')

  try {
    await db.transaction(async (tx) => {
      const [ci] = await tx.select().from(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      if (!ci) throw new Error('ITEM_NOT_FOUND')
      // delta > 0 → возвращаем на склад; delta < 0 → дополнительно списываем
      const delta = ci.quantity - quantity
      if (delta !== 0) {
        const rows: any = await tx.execute(
          sql`SELECT track_stock as "trackStock", stock_quantity as "stockQuantity" FROM inventory WHERE id = ${ci.itemId} FOR UPDATE`
        )
        const inv: any = rows.rows?.[0] ?? rows[0]
        if (inv?.trackStock) {
          if (delta < 0 && (inv.stockQuantity ?? 0) + delta < 0) throw new Error('INSUFFICIENT_STOCK')
          await tx.update(inventory)
            .set({ stockQuantity: sql`${inventory.stockQuantity} + ${delta}` })
            .where(eq(inventory.id, ci.itemId))
        }
      }
      if (quantity === 0) {
        await tx.delete(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      } else {
        await tx.update(checkItems).set({ quantity }).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      }
    })
  } catch (err: any) {
    if (err.message === 'ITEM_NOT_FOUND') return c.json({ error: 'Item not found' }, 404)
    if (err.message === 'INSUFFICIENT_STOCK') return c.json({ error: 'Insufficient stock' }, 400)
    console.error('PATCH /checks/:id/items/:itemId error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }

  await recalcCheckTotal(checkId)
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.delete('/checks/:id/items/:itemId', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const checkId = c.req.param('id')
  const itemId = c.req.param('itemId')
  await db.transaction(async (tx) => {
    const [ci] = await tx.select().from(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
    if (!ci) return
    // Возвращаем списанный сток для учётных товаров
    await tx.update(inventory)
      .set({ stockQuantity: sql`${inventory.stockQuantity} + ${ci.quantity}` })
      .where(and(eq(inventory.id, ci.itemId), eq(inventory.trackStock, true)))
    await tx.delete(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
  })
  await recalcCheckTotal(checkId)
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.post('/checks/:id/discount', requireRole('owner', 'staff'), zValidator('json', z.object({
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

  // Считаем сумму позиций (без скидок) как базу — иначе процентные скидки
  // применённые последовательно дают каскадный эффект (10% + 10% != 19%).
  const items = await db.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  const itemsSum = items.reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)

  // Для itemDiscount базой служит цена позиции, для check — общая сумма позиций
  let baseAmount = itemsSum
  if (body.target === 'item' && body.itemId) {
    const [targetItem] = items.filter(i => i.id === body.itemId)
    if (targetItem) {
      baseAmount = parseFloat(targetItem.priceAtTime) * targetItem.quantity
    }
  }

  const discountAmount = body.type === 'percent'
    ? baseAmount * (body.value / 100)
    : Math.min(body.value, baseAmount)  // fixed скидка не может быть больше базы

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

// Снятие ручной скидки с чека. Только ручные строки (discountId IS NULL) —
// авто/тир-скидки пересоздаются recalcCheckTotal и удалять их вручную нельзя.
posRouter.delete('/checks/:id/discount/:discountRowId', requireRole('owner', 'staff'), async (c) => {
  const checkId = c.req.param('id')
  const rowId = c.req.param('discountRowId')
  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)
  await db.delete(checkDiscounts).where(
    and(eq(checkDiscounts.id, rowId), eq(checkDiscounts.checkId, checkId), isNull(checkDiscounts.discountId)),
  )
  await recalcCheckTotal(checkId)
  const data = await getCheckWithItems(checkId)
  return c.json({ check: data })
})

posRouter.post('/checks/:id/qr', requireRole('owner', 'staff'), async (c) => {
  const checkId = c.req.param('id')
  const merchantId = process.env['PLATEGA_MERCHANT_ID']
  const secret = process.env['PLATEGA_SECRET']
  if (!merchantId || !secret) return c.json({ error: 'Platega не настроен' }, 503)

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  // Сумма QR считается на СЕРВЕРЕ из чека (позиции−скидки+аренда), а НЕ берётся
  // с клиента — иначе можно выставить QR на произвольную сумму. Сначала
  // пересчитываем авто/тир-скидки, затем берём авторитетный итог.
  await recalcCheckTotal(checkId)
  const amount = await computeCheckGrandTotal(db, check)
  if (amount < 0.01) return c.json({ error: 'Сумма чека равна нулю' }, 400)

  const createRes = await fetch('https://app.platega.io/transaction/process', {
    method: 'POST',
    headers: { 'X-MerchantId': merchantId, 'X-Secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 2,
      paymentDetails: { amount, currency: 'RUB' },
      description: `Titan POS чек ${checkId.slice(0, 8)}`,
      payload: checkId,
    }),
  })

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '')
    console.error('Platega create error:', createRes.status, errText)
    return c.json({ error: 'Ошибка создания платежа' }, 502)
  }

  const createData = await createRes.json() as Record<string, unknown>
  const transactionId = createData['transactionId'] as string
  const redirectUrl = createData['redirect'] as string | undefined

  // GET /h2h/{id} — специальный endpoint Platega для получения СБП QR
  let qrString: string | undefined
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 700))
    const h2hRes = await fetch(`https://app.platega.io/h2h/${transactionId}`, {
      headers: { 'X-MerchantId': merchantId, 'X-Secret': secret },
    })
    if (!h2hRes.ok) {
      console.error('Platega h2h error:', h2hRes.status, await h2hRes.text().catch(() => ''))
      return c.json({ error: 'Ошибка получения QR от Platega', redirectUrl, transactionId }, 502)
    }
    const h2hData = await h2hRes.json() as Record<string, unknown>
    qrString = h2hData['qr'] as string | undefined
    if (qrString) break
  }

  if (!qrString) return c.json({ error: 'Platega не вернул QR для СБП', redirectUrl, transactionId }, 502)

  // Рендерим СБП-строку как QR-изображение
  const QRCode = await import('qrcode')
  const svgString = await QRCode.toString(qrString, { type: 'svg', width: 280, margin: 1 })
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`

  return c.json({ transactionId, qrDataUrl, expiresIn: createData['expiresIn'] as string | undefined })
})

posRouter.get('/checks/:id/qr/:transactionId/status', requireRole('owner', 'staff'), async (c) => {
  const transactionId = c.req.param('transactionId')
  const merchantId = process.env['PLATEGA_MERCHANT_ID']
  const secret = process.env['PLATEGA_SECRET']
  if (!merchantId || !secret) return c.json({ error: 'Platega не настроен' }, 503)

  const res = await fetch(`https://app.platega.io/transaction/${transactionId}`, {
    headers: { 'X-MerchantId': merchantId, 'X-Secret': secret },
  })
  if (!res.ok) return c.json({ error: 'Platega error' }, 502)
  const data = await res.json() as Record<string, unknown>

  return c.json({ status: data['status'] as string, expiresIn: data['expiresIn'] as string | undefined })
})

posRouter.post('/checks/:id/pay', requireRole('owner', 'staff'), zValidator('json', PaySchema), async (c) => {
  const checkId = c.req.param('id')
  const user = c.get('user')
  const body = c.req.valid('json')

  try {
    // Вся денежная мутация — в одной транзакции. Любой throw откатывает всё.
    // Строки чека / клиента / сертификата блокируются FOR UPDATE против гонок.
    const closed = await db.transaction(async (tx) => {
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
      if (!check || check.status !== 'open') throw new Error('CHECK_NOT_OPEN')

      // Авторитетная сумма: пересчитываем из позиций+модификаторов−скидок в транзакции
      // (не доверяем totalAmount — он мог устареть и не включать модификаторы).
      // Сначала пересобираем авто-скидки от текущих позиций (на случай, если
      // позиции менялись без recalc) — иначе оплата прошла бы без авто-скидки.
      await applyAutoDiscounts(tx, checkId)
      const itemRows = await tx.select().from(checkItems).where(eq(checkItems.checkId, checkId))
      const ciIds = itemRows.map(i => i.id)
      const modRowsForTotal = ciIds.length
        ? await tx.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ciIds))
        : []
      const discRows = await tx.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
      const { total: itemsTotal } = computeTotals(itemRows, modRowsForTotal, discRows)

      // Аренда зоны («живой счётчик») считается на сервере на момент оплаты
      // тем же правилом, что и на фронте: ceil(минуты/60) × ставка.
      let rental = 0
      if (check.spaceId && check.spaceStartAt) {
        const [space] = await tx.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
        if (space?.hourlyRate) {
          // Конец аренды: заданный вручную spaceEndAt либо момент оплаты (живой счётчик).
          const endMs = check.spaceEndAt ? new Date(check.spaceEndAt).getTime() : Date.now()
          const mins = Math.max(0, (endMs - new Date(check.spaceStartAt).getTime()) / 60000)
          rental = Math.ceil(mins / 60) * parseFloat(space.hourlyRate)
        }
      }
      const total = round2(itemsTotal + rental)

      // Суммы по способам оплаты
      const sumBy = (m: string) => body.payments.filter(p => p.method === m).reduce((s, p) => s + p.amount, 0)
      const sentPaid = round2(body.payments.reduce((s, p) => s + p.amount, 0))
      const depositSent = round2(sumBy('deposit'))
      const bonusSent = round2(sumBy('bonus'))
      const certSent = round2(sumBy('certificate'))
      const debtAmount = round2(sumBy('debt'))

      // Недоплата
      if (sentPaid < total - 0.01) throw new Error('UNDERPAYMENT')
      // Безналичные тендеры (всё кроме наличных) не могут превышать сумму чека —
      // защита от «отрицательной сдачи» и переоплаты бонусом/депозитом/картой.
      const nonCash = body.payments.filter(p => p.method !== 'cash')
      const nonCashSum = round2(nonCash.reduce((s, p) => s + p.amount, 0))
      if (nonCashSum > total + 0.01) throw new Error('OVERPAYMENT')
      // Бонус-тендер обязан совпадать с bonusAmount (иначе «оплата» бонусом без списания).
      if (Math.abs((body.bonusAmount ?? 0) - bonusSent) > 0.01) throw new Error('BONUS_MISMATCH')
      // Бонусы списываются только с клиента: без playerId списание не произойдёт
      // (ниже на :643), а тендер закроет чек → «бесплатная» оплата. Запрещаем.
      if (bonusSent > 0.005 && !body.playerId) throw new Error('BONUS_NO_PLAYER')

      // Лимит оплаты бонусами: owner задаёт bonus_max_spend (% от суммы чека) в
      // настройках. Бонус-тендер не может превышать этот процент авторитетного total.
      if (bonusSent > 0.005) {
        const [maxSpendRow] = await tx.select().from(appSettings).where(eq(appSettings.key, 'bonus_max_spend'))
        const parsed = parseFloat(maxSpendRow?.value ?? '')
        const maxSpendPct = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 50
        const maxBonus = round2(total * (maxSpendPct / 100))
        if (bonusSent > maxBonus + 0.01) throw new Error('BONUS_LIMIT')
      }

      // Validate + lock certificate
      let cert = null
      if (body.certificateCode) {
        const [c2] = await tx.select().from(certificates)
          .where(eq(certificates.code, body.certificateCode)).for('update')
        if (!c2 || c2.isUsed || parseFloat(c2.balance) < 0.01) throw new Error('INVALID_CERT')
        if (certSent > parseFloat(c2.balance) + 0.01) throw new Error('CERT_INSUFFICIENT')
        cert = c2
      } else if (certSent > 0.005) {
        throw new Error('INVALID_CERT')
      }

      // Lock player row once (депозит, долг, списание и начисление бонусов)
      let player = null
      if (body.playerId) {
        const [p] = await tx.select().from(profiles).where(eq(profiles.id, body.playerId)).for('update')
        player = p ?? null
      }

      // Оплата депозитом: списание предоплаченного баланса клиента (не уходит в минус)
      if (depositSent > 0.005) {
        if (!body.playerId || !player) throw new Error('DEPOSIT_NO_PLAYER')
        const bal = parseFloat(player.balance)
        if (bal + 0.01 < depositSent) throw new Error('INSUFFICIENT_DEPOSIT')
        const nb = round2(bal - depositSent)
        await tx.update(profiles).set({ balance: String(nb) }).where(eq(profiles.id, body.playerId))
        await tx.insert(transactions).values({
          type: 'withdrawal',
          amount: String(depositSent),
          checkId,
          playerId: body.playerId,
          createdBy: user.sub,
          description: 'Оплата депозитом за чек',
        })
        player = { ...player, balance: String(nb) }
      }

      // Оплата в долг: проверка лимита + списание баланса клиента в минус
      if (debtAmount > 0) {
        if (!body.playerId || !player) throw new Error('DEBT_NO_PLAYER')
        const maxDebtRow = await tx.select().from(appSettings).where(eq(appSettings.key, 'max_client_debt'))
        const maxDebt = parseFloat(maxDebtRow[0]?.value ?? '5000')
        const newBalance = round2(parseFloat(player.balance) - debtAmount)
        if (newBalance < -maxDebt) throw new Error('DEBT_LIMIT')
        await tx.update(profiles).set({ balance: String(newBalance) }).where(eq(profiles.id, body.playerId))
        await tx.insert(transactions).values({
          type: 'withdrawal',
          amount: String(debtAmount),
          checkId,
          playerId: body.playerId,
          createdBy: user.sub,
          description: 'Долг за чек',
        })
        player = { ...player, balance: String(newBalance) }
      }

      // Списание бонусов
      if (body.bonusAmount && body.bonusAmount > 0 && body.playerId) {
        if (!player || parseFloat(player.bonusPoints) < body.bonusAmount) throw new Error('INSUFFICIENT_BONUS')
        const newBonus = round2(parseFloat(player.bonusPoints) - body.bonusAmount)
        await tx.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, body.playerId))
        await tx.insert(bonusHistory).values({
          profileId: body.playerId,
          amount: String(-body.bonusAmount),
          balanceAfter: String(newBonus),
          reason: 'Payment for check',
        })
        // Списываем из лотов (FIFO по сроку сгорания) — параллельный учёт для expiry.
        await spendBonusLots(tx, body.playerId, body.bonusAmount)
        player = { ...player, bonusPoints: String(newBonus) }
      }

      // Нормализуем платежи: записанная сумма == total (наличные = total − безнал),
      // чтобы переплата/сдача не попадала в выручку и кассу.
      const cashRequired = round2(Math.max(0, total - nonCashSum))
      const normalizedPayments: { method: string; amount: number }[] = nonCash.map(p => ({ method: p.method, amount: round2(p.amount) }))
      if (cashRequired > 0.005) normalizedPayments.push({ method: 'cash', amount: cashRequired })
      if (normalizedPayments.length === 0) normalizedPayments.push({ method: 'cash', amount: total })

      await tx.insert(checkPayments).values(normalizedPayments.map(p => ({
        checkId,
        method: p.method as any,
        amount: String(p.amount),
      })))

      // Списание сертификата
      if (cert) {
        const newCertBalance = round2(parseFloat(cert.balance) - certSent)
        await tx.update(certificates).set({
          balance: String(Math.max(0, newCertBalance)),
          isUsed: newCertBalance <= 0.005,
          // Кто погасил: клиент чека, иначе сотрудник, закрывший чек (user.sub —
          // валидный profile id), чтобы не оставлять usedBy пустым при анонимном чеке.
          usedBy: body.playerId ?? user.sub,
          usedAt: new Date(),
        }).where(eq(certificates.id, cert.id))
      }

      // Финансовая проводка оплаты (на полную сумму, включая аренду)
      await tx.insert(transactions).values({
        type: 'payment',
        amount: String(total),
        checkId,
        playerId: body.playerId ?? null,
        createdBy: user.sub,
        description: 'Check payment',
      })

      // Закрытие чека
      const primaryMethod = normalizedPayments.reduce((a, b) => a.amount >= b.amount ? a : b)
      const [closedCheck] = await tx.update(checks).set({
        status: 'closed',
        paymentMethod: primaryMethod.method as any,
        totalAmount: String(total),
        bonusUsed: String(body.bonusAmount ?? 0),
        certificateId: cert?.id ?? null,
        certificateUsed: cert ? String(certSent) : '0',
        playerId: body.playerId ?? null,
        note: body.note ?? null,
        spaceEndAt: check.spaceEndAt ?? (check.spaceId ? new Date() : undefined),
        closedAt: new Date(),
      }).where(eq(checks.id, checkId)).returning()

      // Начисление бонусов с учётом настроек app_settings (на полную сумму, включая аренду)
      if (body.playerId && player) {
        const settingsRows = await tx.select().from(appSettings)
          .where(inArray(appSettings.key, ['bonus_enabled', 'bonus_accrual_rate', 'bonus_min_purchase', 'bonus_accrual_on_debt']))
        const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]))

        const bonusEnabled = settings['bonus_enabled'] !== 'false'
        const accrualRate = parseFloat(settings['bonus_accrual_rate'] ?? '5') / 100
        const minPurchase = parseFloat(settings['bonus_min_purchase'] ?? '0')
        const accrualOnDebt = settings['bonus_accrual_on_debt'] === 'true'

        if (bonusEnabled && total >= minPurchase && !(debtAmount > 0 && !accrualOnDebt)) {
          const bonusEarned = Math.floor(total * accrualRate)
          if (bonusEarned > 0) {
            const newBonus = round2(parseFloat(player.bonusPoints) + bonusEarned)
            await tx.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, body.playerId))
            await tx.insert(bonusHistory).values({
              profileId: body.playerId,
              amount: String(bonusEarned),
              balanceAfter: String(newBonus),
              reason: `${Math.round(accrualRate * 100)}% начисление за чек`,
            })
            // Лот для сгорания бонусов: expiresAt = now + bonus_expiry_days (либо null).
            const expiryDays = await getBonusExpiryDays(tx)
            await accrueBonusLot(tx, body.playerId, bonusEarned, expiryDays)
          }
        }
      }

      return closedCheck
    })

    publishEvent('check:paid', { checkId })
    publishEvent('check:closed', { checkId })
    return c.json({ check: closed })
  } catch (err: any) {
    const map: Record<string, [string, 400]> = {
      CHECK_NOT_OPEN: ['Check not open', 400],
      UNDERPAYMENT: ['Недостаточная сумма оплаты', 400],
      OVERPAYMENT: ['Сумма безналичной оплаты превышает чек', 400],
      INVALID_CERT: ['Invalid or used certificate', 400],
      CERT_INSUFFICIENT: ['Недостаточно средств на сертификате', 400],
      DEBT_NO_PLAYER: ['Для оплаты в долг нужно выбрать клиента', 400],
      DEBT_LIMIT: ['Превышен лимит долга клиента', 400],
      DEPOSIT_NO_PLAYER: ['Для оплаты депозитом нужно выбрать клиента', 400],
      INSUFFICIENT_DEPOSIT: ['Недостаточно средств на депозите клиента', 400],
      INSUFFICIENT_BONUS: ['Недостаточно бонусных баллов', 400],
      BONUS_MISMATCH: ['Несовпадение суммы бонусов', 400],
      BONUS_NO_PLAYER: ['Для списания бонусов нужно выбрать клиента', 400],
      BONUS_LIMIT: ['Сумма бонусов превышает допустимый лимит оплаты', 400],
    }
    const mapped = err?.message ? map[err.message] : undefined
    if (mapped) return c.json({ error: mapped[0] }, mapped[1])
    console.error('POST /checks/:id/pay error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
})
