import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, inventory, stockMovements, supplies, supplyItems, checks, checkItems, revisions, revisionItems, profiles, eq, asc, isNull, and, gte, desc, sum, inArray } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const inventoryRouter = new Hono<AppEnv>()

// Себестоимость/маржа чувствительны — весь склад только для owner/staff.
inventoryRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// GET /api/inventory — управление остатками. Возвращает активные И неактивные
// позиции (исключая только мягко удалённые deletedAt != null): скрытая из меню
// позиция всё ещё нуждается в учёте остатков/ревизии. Порядок — как в меню
// (sortOrder, затем имя). Эндпоинт за requireAuth (только персонал), поэтому
// costPrice здесь допустим.
inventoryRouter.get('/', async (c) => {
  const rows = await db
    .select()
    .from(inventory)
    .where(isNull(inventory.deletedAt))
    .orderBy(asc(inventory.sortOrder), asc(inventory.name))
  return c.json({ items: rows })
})

// ─── Ревизии (история инвентаризаций) ────────────────────────────────────────
// Регистрируются ДО '/:id/stats', чтобы '/revisions/...' не перехватывался.

// GET /api/inventory/revisions — список ревизий, новые сверху, со сводкой.
inventoryRouter.get('/revisions', async (c) => {
  const rows = await db.select().from(revisions).orderBy(desc(revisions.createdAt)).limit(100)
  const ids = rows.map(r => r.id)
  const items = ids.length
    ? await db.select().from(revisionItems).where(inArray(revisionItems.revisionId, ids))
    : []
  const authorIds = [...new Set(rows.map(r => r.createdBy).filter((x): x is string => !!x))]
  const authors = authorIds.length
    ? await db.select({ id: profiles.id, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.id, authorIds))
    : []
  const authorOf = new Map(authors.map(a => [a.id, a.nickname]))

  const list = rows.map(r => {
    let positions = 0, surplusValue = 0, shortageValue = 0
    for (const it of items) {
      if (it.revisionId !== r.id) continue
      positions++
      const diff = it.actual - it.expected
      const cost = parseFloat(String(it.costPrice)) || 0
      if (diff > 0) surplusValue += diff * cost
      else if (diff < 0) shortageValue += -diff * cost
    }
    return {
      id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt,
      author: r.createdBy ? authorOf.get(r.createdBy) ?? null : null,
      positions, surplusValue, shortageValue,
    }
  })
  return c.json({ revisions: list })
})

// GET /api/inventory/revisions/:id — детали ревизии с позициями (в порядке добавления).
inventoryRouter.get('/revisions/:id', async (c) => {
  const id = c.req.param('id')
  const [rev] = await db.select().from(revisions).where(eq(revisions.id, id))
  if (!rev) return c.json({ error: 'Not found' }, 404)
  const items = await db.select().from(revisionItems).where(eq(revisionItems.revisionId, id)).orderBy(asc(revisionItems.sortOrder))
  let author: string | null = null
  if (rev.createdBy) {
    const [a] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, rev.createdBy))
    author = a?.nickname ?? null
  }
  return c.json({ revision: { ...rev, author }, items })
})

// POST /api/inventory/revisions — провести новую ревизию.
// Каждая позиция: лочим остаток FOR UPDATE, фиксируем expected = текущий остаток,
// ставим actual, пишем движение склада. Всё атомарно — либо вся ревизия, либо ничего.
inventoryRouter.post(
  '/revisions',
  zValidator('json', z.object({
    items: z.array(z.object({
      itemId: z.string().uuid(),
      actual: z.number().int().min(0),
    })).min(1).max(500),
  })),
  async (c) => {
    const { items } = c.req.valid('json')
    const user = c.get('user')
    // Дубли позиций недопустимы — остатки нельзя перемешивать.
    const seen = new Set<string>()
    for (const it of items) {
      if (seen.has(it.itemId)) return c.json({ error: 'Дублирующаяся позиция в ревизии' }, 400)
      seen.add(it.itemId)
    }

    const result = await db.transaction(async (tx) => {
      const [rev] = await tx.insert(revisions).values({ createdBy: user.sub }).returning()
      for (let i = 0; i < items.length; i++) {
        const { itemId, actual } = items[i]
        const [item] = await tx.select().from(inventory).where(and(eq(inventory.id, itemId), isNull(inventory.deletedAt))).for('update')
        if (!item) throw new Error(`item ${itemId} not found`)
        const expected = item.stockQuantity ?? 0
        const delta = actual - expected
        if (delta !== 0) {
          await tx.update(inventory).set({ stockQuantity: actual, updatedAt: new Date() }).where(eq(inventory.id, itemId))
          await tx.insert(stockMovements).values({ itemId, delta, newQuantity: actual, reason: 'Ревизия', createdBy: user.sub })
        }
        await tx.insert(revisionItems).values({
          revisionId: rev.id, itemId, name: item.name,
          expected, actual,
          costPrice: String(parseFloat(String(item.costPrice ?? 0)) || 0),
          sortOrder: i,
        })
      }
      return rev
    })
    return c.json({ revision: result }, 201)
  }
)

// PATCH /api/inventory/revisions/:id — корректировка проведённой ревизии.
// НЕ перезаписывает остаток: применяет к ТЕКУЩЕМУ остатку дельту между новым и
// старым фактом (движения после ревизии сохраняются). Снапшот expected не трогаем —
// динамика «ожидалось/факт на момент ревизии» остаётся честной.
inventoryRouter.patch(
  '/revisions/:id',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({
    items: z.array(z.object({
      id: z.string().uuid(),          // id строки ревизии (revision_items.id)
      actual: z.number().int().min(0),
    })).min(1).max(500),
  })),
  async (c) => {
    const revId = c.req.param('id')
    const { items } = c.req.valid('json')
    const user = c.get('user')

    const applied = await db.transaction(async (tx) => {
      const [rev] = await tx.select().from(revisions).where(eq(revisions.id, revId)).for('update')
      if (!rev) return null
      const changes: { name: string; from: number; to: number; stockDelta: number }[] = []
      for (const ch of items) {
        const [ri] = await tx.select().from(revisionItems).where(and(eq(revisionItems.id, ch.id), eq(revisionItems.revisionId, revId))).for('update')
        if (!ri) throw new Error(`revision item ${ch.id} not found`)
        const deltaChange = ch.actual - ri.actual
        if (deltaChange === 0) continue
        const [item] = await tx.select().from(inventory).where(eq(inventory.id, ri.itemId)).for('update')
        if (!item) throw new Error(`inventory ${ri.itemId} not found`)
        // Текущий остаток корректируем на дельту правки; ниже нуля не уходим —
        // фактический применённый сдвиг честно фиксируем в движении.
        const cur = item.stockQuantity ?? 0
        const newQty = Math.max(0, cur + deltaChange)
        const appliedDelta = newQty - cur
        if (appliedDelta !== 0) {
          await tx.update(inventory).set({ stockQuantity: newQty, updatedAt: new Date() }).where(eq(inventory.id, ri.itemId))
          await tx.insert(stockMovements).values({ itemId: ri.itemId, delta: appliedDelta, newQuantity: newQty, reason: 'Корректировка ревизии', createdBy: user.sub })
        }
        await tx.update(revisionItems).set({ actual: ch.actual }).where(eq(revisionItems.id, ri.id))
        changes.push({ name: ri.name, from: ri.actual, to: ch.actual, stockDelta: appliedDelta })
      }
      if (changes.length) await tx.update(revisions).set({ updatedAt: new Date() }).where(eq(revisions.id, revId))
      return changes
    })

    if (applied === null) return c.json({ error: 'Not found' }, 404)
    return c.json({ changes: applied })
  }
)

// GET /api/inventory/:id/stats — карточка позиции: остаток, последняя закупка,
// продажи по дням за 30 дней (закрытые чеки, валовое количество) + агрегаты.
// Бакетим по календарю МСК (UTC+3). Идёт ДО PATCH/:id по методу — конфликта нет.
inventoryRouter.get('/:id/stats', async (c) => {
  const id = c.req.param('id')
  const [item] = await db.select().from(inventory).where(eq(inventory.id, id))
  if (!item) return c.json({ error: 'Not found' }, 404)

  const [lastSup] = await db
    .select({ date: supplies.createdAt, quantity: supplyItems.quantity, costPerUnit: supplyItems.costPerUnit })
    .from(supplyItems)
    .innerJoin(supplies, eq(supplies.id, supplyItems.supplyId))
    .where(eq(supplyItems.itemId, id))
    .orderBy(desc(supplies.createdAt))
    .limit(1)

  const since = new Date(Date.now() - 30 * 86400000)
  const rows = await db
    .select({ createdAt: checks.createdAt, quantity: checkItems.quantity, price: checkItems.priceAtTime })
    .from(checkItems)
    .innerJoin(checks, eq(checks.id, checkItems.checkId))
    .where(and(eq(checkItems.itemId, id), eq(checks.status, 'closed'), gte(checks.createdAt, since)))

  const MSK = 3 * 3600 * 1000
  const dayKey = (d: Date) => new Date(d.getTime() + MSK).toISOString().split('T')[0]
  const byDay = new Map<string, number>()
  let totalQty = 0, totalRevenue = 0
  for (const r of rows) {
    const q = Number(r.quantity) || 0
    totalQty += q
    totalRevenue += q * (parseFloat(String(r.price)) || 0)
    const k = dayKey(new Date(r.createdAt as unknown as string))
    byDay.set(k, (byDay.get(k) ?? 0) + q)
  }
  const series: { date: string; qty: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const k = new Date(Date.now() + MSK - i * 86400000).toISOString().split('T')[0]
    series.push({ date: k, qty: byDay.get(k) ?? 0 })
  }

  const [allTime] = await db
    .select({ qty: sum(checkItems.quantity) })
    .from(checkItems)
    .innerJoin(checks, eq(checks.id, checkItems.checkId))
    .where(and(eq(checkItems.itemId, id), eq(checks.status, 'closed')))

  const costPrice = parseFloat(String(item.costPrice ?? 0)) || 0
  const price = parseFloat(String(item.price ?? 0)) || 0
  const avgDaily = totalQty / 30
  return c.json({
    item: {
      id: item.id, name: item.name, stockQuantity: item.stockQuantity ?? 0,
      costPrice, price, minThreshold: item.minThreshold ?? 0, trackStock: item.trackStock,
    },
    lastSupply: lastSup ? { date: lastSup.date, quantity: Number(lastSup.quantity), costPerUnit: Number(lastSup.costPerUnit) } : null,
    sales: {
      totalQty, totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgDaily, allTimeQty: Number(allTime?.qty ?? 0), series,
    },
  })
})

// PATCH /api/inventory/:id — изменение остатка/порога с аудитом движения.
// adjustDelta — атомарная корректировка (для кнопок +/−, без гонок);
// stockQuantity — установка абсолютного значения (дельта считается от текущего).
inventoryRouter.patch(
  '/:id',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({
    stockQuantity: z.number().int().min(0).optional(),
    adjustDelta: z.number().int().optional(),
    minThreshold: z.number().int().min(0).optional(),
    trackStock: z.boolean().optional(),
    reason: z.string().optional(),
    note: z.string().optional(),
  })),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const user = c.get('user')
    const reason = body.reason ?? body.note ?? null

    const result = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventory).where(eq(inventory.id, id)).for('update')
      if (!item) return null

      const update: Record<string, unknown> = {}
      let delta: number | null = null
      let newQty = item.stockQuantity ?? 0

      if (body.adjustDelta !== undefined) {
        newQty = Math.max(0, (item.stockQuantity ?? 0) + body.adjustDelta)
        delta = newQty - (item.stockQuantity ?? 0)
        update.stockQuantity = newQty
      } else if (body.stockQuantity !== undefined) {
        newQty = body.stockQuantity
        delta = newQty - (item.stockQuantity ?? 0)
        update.stockQuantity = newQty
      }
      if (body.minThreshold !== undefined) update.minThreshold = body.minThreshold
      if (body.trackStock !== undefined) update.trackStock = body.trackStock

      if (Object.keys(update).length === 0) return item
      update.updatedAt = new Date()
      const [row] = await tx.update(inventory).set(update).where(eq(inventory.id, id)).returning()

      if (delta !== null && delta !== 0) {
        await tx.insert(stockMovements).values({
          itemId: id,
          delta,
          newQuantity: newQty,
          reason,
          createdBy: user.sub,
        })
      }
      return row
    })

    if (!result) return c.json({ error: 'Not found' }, 404)
    return c.json({ item: result })
  }
)
