/**
 * Общий расчёт и закрытие чека по подтверждённой СБП-оплате эквайера.
 *
 * Это провайдеро-независимая выжимка логики Platega-вебхука (platega.router.ts):
 * сверка авторитетной суммы (товары+модификаторы−скидки+аренда+база события),
 * учёт чаевых и эквайринговой надбавки 8%, идемпотентное закрытие, начисление
 * бонусов с лотом сгорания. Platega НАМЕРЕННО не трогаем (живой денежный путь);
 * новые эквайеры используют этот общий код, поэтому ошибка здесь не затрагивает
 * рабочий Platega.
 *
 * Вызывается ВНУТРИ db.transaction(...) вызывающего вебхука: бросает
 * AMOUNT_MISMATCH / CHECK_NOT_FOUND, которые роутер мапит в 400/404.
 */
import {
  checks, checkItems, checkItemModifiers, checkDiscounts, spaces,
  checkPayments, transactions, profiles, bonusHistory, appSettings,
  eq, inArray,
} from '@titan/database'
import { accrueBonusLot, getBonusExpiryDays } from '../../lib/bonusLots.js'
import { round2, computeRental, computeTotals } from '../../lib/money.js'

export type SettleResult = 'closed' | 'noop'

export interface SettleArgs {
  checkId: string
  /** Авторитетная сумма из API провайдера (рубли). undefined → доверяем чеку. */
  verifiedAmount?: number
  transactionId?: string
  /** Префикс описания транзакции, например 'Т-Банк СБП'. */
  descriptionPrefix: string
}

// Минимальный тип транзакции drizzle, чтобы не тянуть весь Database generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any

/**
 * Закрывает открытый чек как оплаченный СБП. Возвращает 'closed' при закрытии,
 * 'noop' если чек уже закрыт/отменён (идемпотентность повторного вебхука).
 */
export async function settleCheckPayment(tx: Tx, args: SettleArgs): Promise<SettleResult> {
  const { checkId, verifiedAmount, transactionId, descriptionPrefix } = args

  const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
  if (!check) throw new Error('CHECK_NOT_FOUND')
  // Идемпотентность: чек уже не открыт — вебхук уже обработан (или чек отменён).
  if (check.status !== 'open') return 'noop'

  // Авторитетная сумма — то же правило, что и pos.router.ts /pay:
  // позиции + модификаторы − скидки + аренда зоны + база события.
  const itemRows = await tx.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  const ciIds = itemRows.map((i: { id: string }) => i.id)
  const modRows = ciIds.length
    ? await tx.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ciIds))
    : []
  const discRows = await tx.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
  const { total: itemsTotal } = computeTotals(itemRows, modRows, discRows)

  let rental = 0
  if (check.spaceId && check.spaceStartAt) {
    const [space] = await tx.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
    rental = computeRental(check.spaceStartAt, check.spaceEndAt, space?.hourlyRate, Date.now())
  }
  const eventBase = parseFloat(check.eventBaseAmount ?? '0') || 0
  const total = round2(itemsTotal + rental + eventBase)

  // Чаевые, запрошенные при генерации QR. Гость платит total + tip (опц. ×1.08).
  const requestedTip = parseFloat(check.tipAmount ?? '0') || 0
  const expectedWithTip = round2(total + requestedTip)

  // Сверка суммы: допускаем переплату до +8% (эквайринговая надбавка клиента),
  // недоплату (< товары) отклоняем.
  if (verifiedAmount != null && !Number.isNaN(verifiedAmount)) {
    const tooLow = verifiedAmount < total - 0.01
    const tooHigh = verifiedAmount > round2(expectedWithTip * 1.08) + 1
    if (tooLow || tooHigh) throw new Error('AMOUNT_MISMATCH')
  }

  // Фактически уплаченные чаевые (если сумма неизвестна — доверяем запрошенным).
  const tipPaid = requestedTip > 0 && (verifiedAmount == null || Number.isNaN(verifiedAmount) || verifiedAmount >= expectedWithTip - 1)
    ? requestedTip
    : 0

  // Надбавку 8% доплачивает клиент сверх товаров+чаевых.
  const surchargePaid = verifiedAmount != null && !Number.isNaN(verifiedAmount)
    ? verifiedAmount >= round2(expectedWithTip * 1.08) - 1
    : parseFloat(check.acquiringSurcharge ?? '0') > 0
  const acquiringSurcharge = surchargePaid ? round2(expectedWithTip * 0.08) : 0

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
    description: `${descriptionPrefix} ${transactionId ?? ''}`.trim(),
  })
  await tx.update(checks).set({
    status: 'closed',
    paymentMethod: 'transfer',
    totalAmount: String(total),
    tipAmount: String(tipPaid),
    acquiringSurcharge: String(acquiringSurcharge),
    spaceEndAt: check.spaceEndAt ?? (check.spaceId ? new Date() : undefined),
    closedAt: new Date(),
  }).where(eq(checks.id, checkId))

  // Начисление бонусов (зеркало pos.router.ts /pay и Platega-вебхука).
  if (check.playerId) {
    const settingsRows = await tx.select().from(appSettings)
      .where(inArray(appSettings.key, ['bonus_enabled', 'bonus_accrual_rate', 'bonus_min_purchase']))
    const settings = Object.fromEntries(settingsRows.map((r: { key: string; value: string }) => [r.key, r.value]))
    const bonusEnabled = settings['bonus_enabled'] !== 'false'
    const accrualRate = parseFloat(settings['bonus_accrual_rate'] ?? '5') / 100
    const minPurchase = parseFloat(settings['bonus_min_purchase'] ?? '0')
    if (bonusEnabled && total >= minPurchase) {
      const earned = Math.floor(total * accrualRate)
      if (earned > 0) {
        const [p] = await tx.select().from(profiles).where(eq(profiles.id, check.playerId)).for('update')
        if (p) {
          const newBonus = round2(parseFloat(p.bonusPoints) + earned)
          await tx.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, check.playerId))
          await tx.insert(bonusHistory).values({
            profileId: check.playerId,
            amount: String(earned),
            balanceAfter: String(newBonus),
            reason: `${Math.round(accrualRate * 100)}% начисление за чек (СБП)`,
          })
          const expiryDays = await getBonusExpiryDays(tx)
          await accrueBonusLot(tx, check.playerId, earned, expiryDays)
        }
      }
    }
  }

  return 'closed'
}
