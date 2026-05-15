import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, inventory, eq, and, desc } from '@titan/database'
import { requireAuth } from '../../middleware/auth.js'

export const inventoryRouter = new Hono<AppEnv>()

inventoryRouter.use('*', requireAuth)

// GET /api/inventory
inventoryRouter.get('/', async (c) => {
  const rows = await db.select().from(inventory).orderBy(desc(inventory.name))
  return c.json({ items: rows })
})

// PATCH /api/inventory/:id — update stock quantity
inventoryRouter.patch(
  '/:id',
  zValidator('json', z.object({
    stockQuantity: z.number().int().min(0).optional(),
    minThreshold: z.number().int().min(0).optional(),
    trackStock: z.boolean().optional(),
    note: z.string().optional(), // UI sends note but we don't store it yet
  })),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const update: Record<string, unknown> = {}
    if (body.stockQuantity !== undefined) update.stockQuantity = body.stockQuantity
    if (body.minThreshold !== undefined) update.minThreshold = body.minThreshold
    if (body.trackStock !== undefined) update.trackStock = body.trackStock

    const [row] = await db.update(inventory).set(update).where(eq(inventory.id, id)).returning()
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ item: row })
  }
)
