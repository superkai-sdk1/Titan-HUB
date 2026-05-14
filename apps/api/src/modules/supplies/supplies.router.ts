import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, supplies, supplyItems, inventory, eq, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const SupplySchema = z.object({
  note: z.string().optional(),
  paymentMethod: z.string().default('cash'),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().positive(),
    costPerUnit: z.number().min(0),
  })).min(1),
})

export const suppliesRouter = new Hono<AppEnv>()
suppliesRouter.use('*', requireAuth)

suppliesRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const rows = await db.select().from(supplies).orderBy(desc(supplies.createdAt)).limit(50)
  return c.json({ supplies: rows })
})

suppliesRouter.post('/', requireRole('owner', 'staff'), zValidator('json', SupplySchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const totalCost = body.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)

  const [supply] = await db.insert(supplies).values({
    note: body.note,
    paymentMethod: body.paymentMethod,
    totalCost: String(totalCost),
    createdBy: user.sub,
  }).returning()

  await db.insert(supplyItems).values(body.items.map(i => ({
    supplyId: supply.id,
    itemId: i.itemId,
    quantity: String(i.quantity),
    costPerUnit: String(i.costPerUnit),
  })))

  // Update stock
  for (const item of body.items) {
    const [inv] = await db.select().from(inventory).where(eq(inventory.id, item.itemId))
    if (inv) {
      await db.update(inventory).set({
        stockQuantity: inv.stockQuantity + Math.floor(item.quantity),
        updatedAt: new Date(),
      }).where(eq(inventory.id, item.itemId))
    }
  }

  return c.json({ supply }, 201)
})

suppliesRouter.get('/:id', async (c) => {
  const [supply] = await db.select().from(supplies).where(eq(supplies.id, c.req.param('id')))
  if (!supply) return c.json({ error: 'Not found' }, 404)
  const items = await db
    .select({ supplyItem: supplyItems, item: inventory })
    .from(supplyItems)
    .leftJoin(inventory, eq(inventory.id, supplyItems.itemId))
    .where(eq(supplyItems.supplyId, supply.id))
  return c.json({ supply, items })
})
