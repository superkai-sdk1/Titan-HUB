import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, refunds, checks, inventory, checkItems, checkPayments, transactions, profiles, bonusHistory, certificates, eq, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

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
      if (paidTotal <= 0) throw new Error('NOTHING_TO_REFUND')
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

      // Доля возврата — для пропорционального отката безналичных тендеров
      // (несколько частичных возвратов в сумме откатят тендер полностью).
      const fraction = Math.min(1, body.totalAmount / paidTotal)
      const depositPaid = payments.filter(p => p.method === 'deposit').reduce((s, p) => s + parseFloat(p.amount), 0)
      const bonusRedeemed = parseFloat(check.bonusUsed ?? '0')
      const certUsed = parseFloat(check.certificateUsed ?? '0')

      // Возврат депозита и списанных бонусов клиенту
      if (check.playerId && (depositPaid > 0 || bonusRedeemed > 0)) {
        const [player] = await tx.select().from(profiles).where(eq(profiles.id, check.playerId)).for('update')
        if (player) {
          let bal = parseFloat(player.balance)
          let bonus = parseFloat(player.bonusPoints)
          const depBack = round2(depositPaid * fraction)
          const bonusBack = Math.round(bonusRedeemed * fraction)
          if (depBack > 0) {
            bal = round2(bal + depBack)
            await tx.insert(transactions).values({
              type: 'deposit', amount: String(depBack), checkId: body.checkId,
              playerId: check.playerId, createdBy: user.sub, description: 'Возврат на депозит',
            })
          }
          if (bonusBack > 0) {
            bonus = round2(bonus + bonusBack)
            await tx.insert(bonusHistory).values({
              profileId: check.playerId, amount: String(bonusBack), balanceAfter: String(bonus),
              reason: 'Возврат списанных бонусов',
            })
          }
          await tx.update(profiles).set({ balance: String(bal), bonusPoints: String(bonus) }).where(eq(profiles.id, check.playerId))
        }
      }

      // Возврат средств на сертификат
      if (check.certificateId && certUsed > 0) {
        const back = round2(certUsed * fraction)
        if (back > 0) {
          const [cert] = await tx.select().from(certificates).where(eq(certificates.id, check.certificateId)).for('update')
          if (cert) {
            const nb = round2(parseFloat(cert.balance) + back)
            await tx.update(certificates).set({ balance: String(nb), isUsed: nb <= 0.005 }).where(eq(certificates.id, cert.id))
          }
        }
      }

      // Restore stock — только по фактически проданным позициям и не больше проданного.
      const soldRows = await tx.select().from(checkItems).where(eq(checkItems.checkId, body.checkId))
      const soldByItem = new Map<string, number>()
      for (const s of soldRows) soldByItem.set(s.itemId, (soldByItem.get(s.itemId) ?? 0) + s.quantity)
      for (const item of body.itemsToRestore) {
        const qty = Math.min(item.quantity, soldByItem.get(item.itemId) ?? 0)
        if (qty <= 0) continue
        const [inv] = await tx.select().from(inventory).where(eq(inventory.id, item.itemId)).for('update')
        if (inv && inv.trackStock) {
          await tx.update(inventory)
            .set({ stockQuantity: (inv.stockQuantity ?? 0) + qty })
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
      NOTHING_TO_REFUND: ['По чеку нет оплат для возврата', 400],
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
