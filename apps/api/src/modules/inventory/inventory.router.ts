import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, inventory, stockMovements, supplies, supplyItems, checks, checkItems, eq, asc, isNull, and, gte, desc, sum } from '@titan/database'
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
