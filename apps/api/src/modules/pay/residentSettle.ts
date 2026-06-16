/**
 * Применение подтверждённого онлайн-платежа клиента из Titan Resident.
 *
 * Платёж создаётся как resident_payments(status='pending'); эффект применяется
 * ТОЛЬКО здесь, при подтверждении вебхуком эквайера (как settleCheckPayment для
 * чеков). Идемпотентно: строка берётся FOR UPDATE и применяется один раз
 * (status !== 'pending' → noop). Диспатчится из обоих вебхуков (pay.router /
 * platega.router): если orderRef == resident_payments.id, settle сюда, иначе чек.
 *
 * purpose:
 *  • deposit / debt → profiles.balance += amount + transaction(type='deposit')
 *    (и долг, и депозит увеличивают баланс; различаются только подписью).
 *  • fund → collection_contributions(method='sbp') в текущий период активного
 *    сбора (минуя кассу/баланс — «копилка», как ручной взнос staff).
 */
import {
  residentPayments, profiles, transactions,
  collections, collectionPeriods, collectionContributions,
  eq, and, type Database,
} from '@titan/database'
import { round2 } from '../../lib/money.js'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
function mskPeriodKey(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000) // МСК = UTC+3
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function periodLabel(key: string): string {
  const [y, m] = key.split('-')
  const mi = parseInt(m ?? '', 10) - 1
  return mi >= 0 && mi < 12 ? `${MONTHS_RU[mi]} ${y}` : key
}

export async function settleResidentPayment(
  tx: Tx,
  args: { paymentId: string; verifiedAmount?: number; transactionId?: string; descriptionPrefix: string },
): Promise<'applied' | 'noop'> {
  const [rp] = await tx.select().from(residentPayments).where(eq(residentPayments.id, args.paymentId)).for('update')
  if (!rp) return 'noop'
  if (rp.status !== 'pending') return 'noop' // уже применён/отклонён — идемпотентность

  const amount = round2(parseFloat(rp.amount) || 0)
  // Сумма из API провайдера авторитетна: недоплата отклоняется (переплату допускаем).
  if (args.verifiedAmount != null && !Number.isNaN(args.verifiedAmount) && args.verifiedAmount < amount - 0.01) {
    throw new Error('AMOUNT_MISMATCH')
  }
  const txId = args.transactionId ?? rp.transactionId ?? ''

  if (rp.purpose === 'fund') {
    if (rp.collectionId) {
      const [coll] = await tx.select().from(collections).where(eq(collections.id, rp.collectionId)).limit(1)
      if (coll) {
        const periodKey = mskPeriodKey()
        let [period] = await tx.select().from(collectionPeriods)
          .where(and(eq(collectionPeriods.collectionId, coll.id), eq(collectionPeriods.periodKey, periodKey))).limit(1)
        if (!period) {
          await tx.insert(collectionPeriods).values({
            collectionId: coll.id, periodKey, label: periodLabel(periodKey),
            amount: String(parseFloat(coll.defaultAmount) || 0), status: 'open',
          }).onConflictDoNothing()
          ;[period] = await tx.select().from(collectionPeriods)
            .where(and(eq(collectionPeriods.collectionId, coll.id), eq(collectionPeriods.periodKey, periodKey))).limit(1)
        }
        if (period) {
          await tx.insert(collectionContributions).values({
            collectionId: coll.id,
            periodId: period.id,
            playerId: rp.profileId,
            amount: String(amount),
            method: 'sbp',
            note: `Онлайн-оплата (${args.descriptionPrefix} ${txId})`.trim(),
            createdBy: rp.profileId,
            paidAt: new Date(),
          })
        }
      }
    }
  } else {
    // deposit | debt: баланс += amount + проводка (как пополнение депозита).
    const [p] = await tx.select().from(profiles).where(eq(profiles.id, rp.profileId)).for('update')
    if (p) {
      const newBal = round2((parseFloat(p.balance) || 0) + amount)
      await tx.update(profiles).set({ balance: String(newBal) }).where(eq(profiles.id, rp.profileId))
      const label = rp.purpose === 'debt' ? 'Погашение долга' : 'Пополнение депозита'
      await tx.insert(transactions).values({
        type: 'deposit',
        amount: String(amount),
        playerId: rp.profileId,
        description: `${label} онлайн (${args.descriptionPrefix} ${txId})`.trim(),
      })
    }
  }

  await tx.update(residentPayments).set({
    status: 'confirmed',
    transactionId: args.transactionId ?? rp.transactionId ?? null,
    appliedAt: new Date(),
  }).where(eq(residentPayments.id, rp.id))
  return 'applied'
}
