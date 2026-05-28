import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, refunds, checks, inventory, checkPayments, transactions, eq, desc } from '@titan/database'
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

  try {
    const refund = await db.transaction(async (tx) => {
      const [check] = await tx.select().from(checks).where(eq(checks.id, body.checkId)).for('update')
      if (!check) throw new Error('CHECK_NOT_FOUND')
      // Возврат возможен только по закрытому (оплаченному) чеку.
      if (check.status !== 'closed') throw new Error('CHECK_NOT_CLOSED')

      // Нельзя вернуть больше, чем фактически оплачено (с учётом уже сделанных возвратов).
      const payments = await tx.select().from(checkPayments).where(eq(checkPayments.checkId, body.checkId))
      const paidTotal = payments.reduce((s, p) => s + parseFloat(p.amount), 0)
      const prevRefunds = await tx.select().from(refunds).where(eq(refunds.checkId, body.checkId))
      const alreadyRefunded = prevRefunds.reduce((s, r) => s + parseFloat(r.totalAmount), 0)
      if (body.totalAmount > paidTotal - alreadyRefunded + 0.01) {
        throw new Error('REFUND_EXCEEDS_PAID')
      }

      const [r] = await tx.insert(refunds).values({
        checkId: body.checkId,
        totalAmount: String(body.totalAmount),
        refundType: body.refundType,
        reason: body.reason,
        note: body.note,
        createdBy: user.sub,
      }).returning()

      // Финансовая проводка возврата (видна в аналитике/кассе).
      await tx.insert(transactions).values({
        type: 'refund',
        amount: String(body.totalAmount),
        checkId: body.checkId,
        playerId: check.playerId ?? null,
        createdBy: user.sub,
        description: `Refund: ${body.reason}`,
      })

      // Restore stock
      for (const item of body.itemsToRestore) {
        const [inv] = await tx.select().from(inventory).where(eq(inventory.id, item.itemId))
        if (inv && inv.trackStock) {
          await tx.update(inventory)
            .set({ stockQuantity: (inv.stockQuantity ?? 0) + item.quantity })
            .where(eq(inventory.id, item.itemId))
        }
      }

      return r
    })

    return c.json({ refund }, 201)
  } catch (err: any) {
    const map: Record<string, [string, 400 | 404]> = {
      CHECK_NOT_FOUND: ['Check not found', 404],
      CHECK_NOT_CLOSED: ['Возврат возможен только по оплаченному чеку', 400],
      REFUND_EXCEEDS_PAID: ['Сумма возврата превышает оплаченную', 400],
    }
    const mapped = err?.message ? map[err.message] : undefined
    if (mapped) return c.json({ error: mapped[0] }, mapped[1])
    console.error('POST /refunds error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
})

refundsRouter.get('/:id', async (c) => {
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, c.req.param('id')))
  if (!refund) return c.json({ error: 'Not found' }, 404)
  return c.json({ refund })
})
