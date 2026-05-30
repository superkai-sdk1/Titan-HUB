import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { Redis } from 'ioredis'
import { timingSafeEqual } from 'node:crypto'
import {
  db, checks, checkItems, checkItemModifiers, checkDiscounts, spaces,
  checkPayments, transactions, profiles, bonusHistory, appSettings,
  eq, inArray,
} from '@titan/database'
import { accrueBonusLot, getBonusExpiryDays } from '../../lib/bonusLots.js'
import { round2, computeRental } from '../../lib/money.js'

// Единый расчёт суммы чека: позиции + модификаторы − скидки.
// ВАЖНО: логика — копия computeTotals из pos.router.ts (тот файл нам не принадлежит,
// helper переиспользовать нельзя). Держать синхронно с pos.router.ts.
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

      // Авторитетная сумма считается тем же правилом, что и pos.router.ts /pay:
      // позиции + модификаторы − скидки + аренда зоны. totalAmount НЕ включает
      // аренду, поэтому раньше webhook ошибочно ловил AMOUNT_MISMATCH по аренде.
      const itemRows = await tx.select().from(checkItems).where(eq(checkItems.checkId, checkId))
      const ciIds = itemRows.map((i) => i.id)
      const modRows = ciIds.length
        ? await tx.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ciIds))
        : []
      const discRows = await tx.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
      const { total: itemsTotal } = computeTotals(itemRows, modRows, discRows)

      // Аренда зоны: ceil(минуты/60) × ставка. Конец — заданный spaceEndAt либо
      // момент подтверждения (живой счётчик). Идентично pos.router.ts /pay.
      let rental = 0
      if (check.spaceId && check.spaceStartAt) {
        const [space] = await tx.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
        rental = computeRental(check.spaceStartAt, check.spaceEndAt, space?.hourlyRate, Date.now())
      }
      // База события (фиксированная стоимость мероприятия) входит в авторитетный
      // итог так же, как в pos.router.ts computeCheckGrandTotal. Раньше webhook её
      // не учитывал → QR-оплата event-чека падала с AMOUNT_MISMATCH.
      const eventBase = parseFloat(check.eventBaseAmount ?? '0') || 0
      const total = round2(itemsTotal + rental + eventBase)

      // Сверка суммы (если провайдер её прислал). Допускаем переплату до +8% —
      // это опциональная эквайринговая надбавка, которую заплатил клиент (см.
      // /checks/:id/qr surcharge8). Надбавка НЕ является выручкой магазина:
      // ниже чек закрывается и платёж пишется по БАЗОВОМУ total (товары),
      // поэтому сверка смен/выручка остаются корректными. Недоплата
      // (reportedAmount < total) по-прежнему отклоняется.
      if (reportedAmount != null && !Number.isNaN(reportedAmount)) {
        const tooLow = reportedAmount < total - 0.01
        const tooHigh = reportedAmount > round2(total * 1.08) + 1
        if (tooLow || tooHigh) {
          throw new Error('AMOUNT_MISMATCH')
        }
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
        totalAmount: String(total),
        // Фиксируем конец аренды при закрытии (зеркало pos.router.ts close).
        spaceEndAt: check.spaceEndAt ?? (check.spaceId ? new Date() : undefined),
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
              // Лот для сгорания бонусов: expiresAt = now + bonus_expiry_days (либо null).
              // Зеркало pos.router.ts /pay — иначе СБП-бонусы никогда не сгорают.
              const expiryDays = await getBonusExpiryDays(tx)
              await accrueBonusLot(tx, check.playerId, earned, expiryDays)
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
