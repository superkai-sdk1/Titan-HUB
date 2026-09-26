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
import { notifyClient } from '../notifications/client.js'

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

  // Зачислить на баланс клиента (депозит/долг, а также запасной путь для взноса,
  // который некуда записать) + проводка, видимая в истории клиента.
  const creditBalance = async (description: string) => {
    const [p] = await tx.select().from(profiles).where(eq(profiles.id, rp.profileId)).for('update')
    if (!p) return
    const newBal = round2((parseFloat(p.balance) || 0) + amount)
    await tx.update(profiles).set({ balance: String(newBal) }).where(eq(profiles.id, rp.profileId))
    await tx.insert(transactions).values({
      type: 'deposit',
      amount: String(amount),
      playerId: rp.profileId,
      description: description.trim(),
    })
  }

  if (rp.purpose === 'fund') {
    let recorded = false
    const [coll] = rp.collectionId
      ? await tx.select().from(collections).where(eq(collections.id, rp.collectionId)).limit(1)
      : []
    if (coll) {
      // Разовый сбор живёт в единственном периоде 'single', ежемесячный — в 'YYYY-MM'.
      const periodKey = coll.kind === 'oneoff' ? 'single' : mskPeriodKey()
      let [period] = await tx.select().from(collectionPeriods)
        .where(and(eq(collectionPeriods.collectionId, coll.id), eq(collectionPeriods.periodKey, periodKey))).limit(1)
      if (!period) {
        await tx.insert(collectionPeriods).values({
          collectionId: coll.id, periodKey, label: periodKey === 'single' ? 'Сбор' : periodLabel(periodKey),
          amount: String(parseFloat(coll.defaultAmount) || 0), status: 'open',
        }).onConflictDoNothing()
        ;[period] = await tx.select().from(collectionPeriods)
          .where(and(eq(collectionPeriods.collectionId, coll.id), eq(collectionPeriods.periodKey, periodKey))).limit(1)
      }
      if (period) {
        const note = `Онлайн-оплата (${args.descriptionPrefix} ${txId})`.trim()
        // Взнос за период у игрока один (уникальный индекс period_id+player_id).
        // Раньше повторная онлайн-оплата в том же месяце падала на индексе — деньги
        // списаны, а вебхук отвечал 500. Теперь доплата суммируется с отметкой.
        const [existing] = await tx.select().from(collectionContributions)
          .where(and(eq(collectionContributions.periodId, period.id), eq(collectionContributions.playerId, rp.profileId)))
          .for('update').limit(1)
        if (!existing) {
          await tx.insert(collectionContributions).values({
            collectionId: coll.id,
            periodId: period.id,
            playerId: rp.profileId,
            amount: String(amount),
            method: 'sbp',
            note,
            createdBy: rp.profileId,
            paidAt: new Date(),
          })
          recorded = true
        } else if (existing.method !== 'deposit' && existing.method !== 'debt') {
          // Доплата к отметке «наличные/перевод/СБП» — копилка сбора, баланс не трогаем.
          await tx.update(collectionContributions).set({
            amount: String(round2((parseFloat(existing.amount) || 0) + amount)),
            note: [existing.note, `+${amount} ₽ ${note}`].filter(Boolean).join('; '),
          }).where(eq(collectionContributions.id, existing.id))
          recorded = true
        }
        // Отметка списанием с депозита/в долг не суммируется: снятие такой отметки
        // вернуло бы на баланс и онлайн-часть. Эти деньги уходят на депозит (ниже).
      }
    }
    if (!recorded) await creditBalance(`Взнос «${coll?.name ?? 'Фонд клуба'}» зачислен на депозит (${args.descriptionPrefix} ${txId})`)
  } else {
    // deposit | debt: баланс += amount + проводка (как пополнение депозита).
    const label = rp.purpose === 'debt' ? 'Погашение долга' : 'Пополнение депозита'
    await creditBalance(`${label} онлайн (${args.descriptionPrefix} ${txId})`)
  }

  await tx.update(residentPayments).set({
    status: 'confirmed',
    transactionId: args.transactionId ?? rp.transactionId ?? null,
    appliedAt: new Date(),
  }).where(eq(residentPayments.id, rp.id))
  return 'applied'
}

/**
 * Уведомить клиента о зачисленном онлайн-платеже (вызывать ПОСЛЕ коммита
 * транзакции settleResidentPayment, когда она вернула 'applied').
 */
export async function notifyResidentPaid(db: Database, paymentId: string): Promise<void> {
  try {
    const [rp] = await db.select().from(residentPayments).where(eq(residentPayments.id, paymentId)).limit(1)
    if (!rp || rp.status !== 'confirmed') return
    const amount = round2(parseFloat(rp.amount) || 0).toLocaleString('ru')
    const [p] = await db.select({ balance: profiles.balance }).from(profiles).where(eq(profiles.id, rp.profileId)).limit(1)
    const bal = round2(parseFloat(p?.balance ?? '0') || 0)
    let title = 'Оплата прошла'
    let body = `${amount} ₽ зачислено`
    if (rp.purpose === 'fund') {
      const [coll] = rp.collectionId
        ? await db.select({ name: collections.name }).from(collections).where(eq(collections.id, rp.collectionId)).limit(1)
        : []
      title = 'Взнос получен'
      body = `${amount} ₽ · ${coll?.name ?? 'Фонд клуба'}. Спасибо!`
    } else if (rp.purpose === 'debt') {
      title = bal >= 0 ? 'Долг погашен' : 'Платёж по долгу получен'
      body = bal >= 0 ? `${amount} ₽ · баланс ${bal.toLocaleString('ru')} ₽` : `${amount} ₽ · осталось ${Math.abs(bal).toLocaleString('ru')} ₽`
    } else {
      title = 'Депозит пополнен'
      body = `+${amount} ₽ · баланс ${bal.toLocaleString('ru')} ₽`
    }
    await notifyClient(rp.profileId, { kind: 'payment', title, body, meta: { screen: 'history', paymentId } }, db)
  } catch (err) {
    console.error('[resident] notify paid failed:', err)
  }
}
