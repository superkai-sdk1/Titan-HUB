import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { Redis } from 'ioredis'
import { timingSafeEqual } from 'node:crypto'
import { db, checks, checkPayments, transactions, profiles, bonusHistory, appSettings, eq, inArray } from '@titan/database'

function publishEvent(event: string, data: unknown) {
  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  redis.publish('titan:updates', JSON.stringify({ event, data, ts: Date.now() }))
    .finally(() => redis.disconnect())
    .catch(() => {})
}

// Сравнение строк за постоянное время (защита от timing-атак).
function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export const plategaRouter = new Hono<AppEnv>()

plategaRouter.post('/webhook', async (c) => {
  const merchantOk = safeEqual(c.req.header('X-MerchantId'), process.env['PLATEGA_MERCHANT_ID'])
  const secretOk = safeEqual(c.req.header('X-Secret'), process.env['PLATEGA_SECRET'])
  if (!merchantOk || !secretOk) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Bad request' }, 400)

  const transactionId = body['id'] as string | undefined
  const status = body['status'] as string | undefined
  const checkId = body['payload'] as string | undefined

  // Сумма, заявленная провайдером (для сверки). Может прийти в разных полях.
  const rawAmount = body['amount'] ?? (body['paymentDetails'] as Record<string, unknown> | undefined)?.['amount']
  const reportedAmount = rawAmount != null ? Number(rawAmount) : undefined

  if (status !== 'CONFIRMED' || !checkId) {
    // Прочие статусы просто подтверждаем получением.
    return c.json({ ok: true })
  }

  let didClose = false
  try {
    await db.transaction(async (tx) => {
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
      if (!check) throw new Error('CHECK_NOT_FOUND')

      // Идемпотентность: если чек уже не открыт — webhook уже обработан (или чек отменён).
      if (check.status !== 'open') return

      const total = parseFloat(check.totalAmount)
      // Сверка суммы (если провайдер её прислал).
      if (reportedAmount != null && !Number.isNaN(reportedAmount) && Math.abs(reportedAmount - total) > 0.01) {
        throw new Error('AMOUNT_MISMATCH')
      }

      await tx.insert(checkPayments).values({
        checkId,
        method: 'transfer',
        amount: String(total),
      })
      await tx.insert(transactions).values({
        type: 'payment',
        amount: String(total),
        checkId,
        playerId: check.playerId ?? null,
        description: `Platega SBP ${transactionId ?? ''}`.trim(),
      })
      await tx.update(checks).set({
        status: 'closed',
        paymentMethod: 'transfer',
        closedAt: new Date(),
      }).where(eq(checks.id, checkId))

      // Начисление бонусов за QR/СБП-оплату (зеркально POS /pay; раньше его делал
      // фронтовый /pay, теперь чек закрывает webhook — иначе бонусы терялись).
      if (check.playerId) {
        const settingsRows = await tx.select().from(appSettings)
          .where(inArray(appSettings.key, ['bonus_enabled', 'bonus_accrual_rate', 'bonus_min_purchase']))
        const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))
        const bonusEnabled = settings['bonus_enabled'] !== 'false'
        const accrualRate = parseFloat(settings['bonus_accrual_rate'] ?? '5') / 100
        const minPurchase = parseFloat(settings['bonus_min_purchase'] ?? '0')
        if (bonusEnabled && total >= minPurchase) {
          const earned = Math.floor(total * accrualRate)
          if (earned > 0) {
            const [p] = await tx.select().from(profiles).where(eq(profiles.id, check.playerId)).for('update')
            if (p) {
              const newBonus = parseFloat(p.bonusPoints) + earned
              await tx.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, check.playerId))
              await tx.insert(bonusHistory).values({
                profileId: check.playerId,
                amount: String(earned),
                balanceAfter: String(newBonus),
                reason: `${Math.round(accrualRate * 100)}% начисление за чек (СБП)`,
              })
            }
          }
        }
      }

      didClose = true
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'AMOUNT_MISMATCH') {
      console.error(`[platega] amount mismatch for check ${checkId} (tx ${transactionId})`)
      return c.json({ error: 'amount mismatch' }, 400)
    }
    if (msg === 'CHECK_NOT_FOUND') {
      return c.json({ error: 'check not found' }, 404)
    }
    console.error('[platega] webhook error:', err)
    return c.json({ error: 'internal error' }, 500)
  }

  if (didClose) {
    publishEvent('platega:confirmed', { transactionId, checkId })
    publishEvent('check:closed', { checkId })
  }
  return c.json({ ok: true })
})
