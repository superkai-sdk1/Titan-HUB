import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, inventory, stockMovements, eq, asc, isNull } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const inventoryRouter = new Hono<AppEnv>()

inventoryRouter.use('*', requireAuth)

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
