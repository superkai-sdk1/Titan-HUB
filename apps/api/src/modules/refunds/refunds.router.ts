import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, refunds, checks, inventory, checkItems, eq, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const RefundSchema = z.object({
  checkId: z.string().uuid(),
  totalAmount: z.number().positive(),
  refundType: z.enum(['full', 'partial']).default('full'),
  reason: z.enum(['return', 'exchange', 'discount', 'damage']).default('return'),
  note: z.string().optional(),
  itemsToRestore: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).default([]),
})

export const refundsRouter = new Hono<AppEnv>()
refundsRouter.use('*', requireAuth)

refundsRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const rows = await db.select().from(refunds).orderBy(desc(refunds.createdAt)).limit(50)
  return c.json({ refunds: rows })
})

refundsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', RefundSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  const [check] = await db.select().from(checks).where(eq(checks.id, body.checkId))
  if (!check) return c.json({ error: 'Check not found' }, 404)

  const [refund] = await db.insert(refunds).values({
    checkId: body.checkId,
    totalAmount: String(body.totalAmount),
    refundType: body.refundType,
    reason: body.reason,
    note: body.note,
    createdBy: user.sub,
  }).returning()

  // Restore stock
  for (const item of body.itemsToRestore) {
    const [inv] = await db.select().from(inventory).where(eq(inventory.id, item.itemId))
    if (inv && inv.trackStock) {
      await db.update(inventory).set({ stockQuantity: inv.stockQuantity + item.quantity }).where(eq(inventory.id, item.itemId))
    }
  }

  return c.json({ refund }, 201)
})

refundsRouter.get('/:id', async (c) => {
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, c.req.param('id')))
  if (!refund) return c.json({ error: 'Not found' }, 404)
  return c.json({ refund })
})
