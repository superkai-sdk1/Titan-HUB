import { db, shifts, checks, checkPayments, cashOperations, refunds, profiles, eq, and, isNull, sql, desc, sum } from '@titan/database'

export async function getCurrentShift() {
  const [shift] = await db
    .select()
    .from(shifts)
    .where(eq(shifts.status, 'open'))
    .orderBy(desc(shifts.openedAt))
    .limit(1)
  return shift ?? null
}

export async function openShift(data: {
  openedBy: string
  cashStart: number
  eveningType: string
  note?: string
}) {
  const existing = await getCurrentShift()
  if (existing) throw new Error('Shift already open')

  const [shift] = await db
    .insert(shifts)
    .values({
      openedBy: data.openedBy,
      cashStart: String(data.cashStart),
      eveningType: data.eveningType as any,
      note: data.note,
      status: 'open',
    })
    .returning()
  return shift
}

export async function closeShift(shiftId: string, closedBy: string, cashEnd: number) {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId))
  if (!shift) throw new Error('Shift not found')
  if (shift.status !== 'open') throw new Error('Shift already closed')

  // Block close if open checks exist
  const [{ count: openChecks }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(checks)
    .where(and(eq(checks.shiftId, shiftId), eq(checks.status, 'open')))
  if (openChecks > 0) throw new Error(`Есть ${openChecks} незакрытых чек(а). Закройте их перед закрытием смены.`)

  const [updated] = await db
    .update(shifts)
    .set({ status: 'closed', closedBy, cashEnd: String(cashEnd), closedAt: new Date() })
    .where(eq(shifts.id, shiftId))
    .returning()
  return updated
}

export async function getBirthdaysToday() {
  // Дата по Москве (UTC+3). birthday — свободный text: сравниваем MM-DD через
  // substring (без ::date), чтобы битая строка не уронила запрос.
  const msk = new Date(Date.now() + 3 * 3600 * 1000)
  const mm = String(msk.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(msk.getUTCDate()).padStart(2, '0')
  const rows = await db.select({
    id: profiles.id,
    nickname: profiles.nickname,
    birthday: profiles.birthday,
  }).from(profiles)
    .where(and(
      eq(profiles.role, 'client'),
      isNull(profiles.deletedAt),
      sql`${profiles.birthday} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`,
      sql`substring(${profiles.birthday} from 6 for 5) = ${mm + '-' + dd}`,
    ))
  return rows
}

export async function getShiftCashBalance(shiftId: string) {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId))
  if (!shift) return { expected: 0, cashStart: 0 }

  const [cashSum] = await db.select({ total: sum(checkPayments.amount) })
    .from(checkPayments)
    .innerJoin(checks, eq(checks.id, checkPayments.checkId))
    .where(and(eq(checks.shiftId, shiftId), eq(checkPayments.method, 'cash')))

  const cashPayments = parseFloat(String(cashSum?.total ?? 0)) || 0
  const cashStart = parseFloat(String(shift.cashStart ?? 0)) || 0

  // Cash operations: deposits (+), withdrawals (-) и зарплаты (-) за смену.
  // Зарплата — это наличные, покинувшие кассу, поэтому уменьшает ожидаемый остаток.
  const [opsSum] = await db.select({
    deposits: sql<string>`coalesce(sum(case when type = 'deposit' then amount::numeric else 0 end), 0)`,
    withdrawals: sql<string>`coalesce(sum(case when type = 'withdrawal' then amount::numeric else 0 end), 0)`,
    salaries: sql<string>`coalesce(sum(case when type = 'salary' then amount::numeric else 0 end), 0)`,
  })
    .from(cashOperations)
    .where(eq(cashOperations.shiftId, shiftId))

  const deposits = parseFloat(String(opsSum?.deposits ?? 0)) || 0
  const withdrawals = parseFloat(String(opsSum?.withdrawals ?? 0)) || 0
  const salaries = parseFloat(String(opsSum?.salaries ?? 0)) || 0

  // Возвраты наличными: при возврате по способам оплаты берём «cash»-тендер
  // напрямую; для старых возвратов (tenders=NULL) — пропорционально наличной
  // доле оригинального чека.
  const refundRows = await db
    .select({
      refundTotal: refunds.totalAmount,
      checkId: refunds.checkId,
      tenders: refunds.tenders,
    })
    .from(refunds)
    .innerJoin(checks, eq(checks.id, refunds.checkId))
    .where(eq(checks.shiftId, shiftId))

  let cashRefundTotal = 0
  for (const r of refundRows) {
    if (r.tenders && Array.isArray(r.tenders)) {
      cashRefundTotal += (r.tenders as { method: string; amount: number }[])
        .filter(t => t.method === 'cash')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0)
      continue
    }
    const refundAmt = parseFloat(String(r.refundTotal)) || 0
    const payments = await db
      .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
      .from(checkPayments)
      .where(eq(checkPayments.checkId, r.checkId))
      .groupBy(checkPayments.method)
    const totalPaid = payments.reduce((s, p) => s + (parseFloat(String(p.total)) || 0), 0)
    const cashPaid = parseFloat(String(payments.find(p => p.method === 'cash')?.total ?? 0)) || 0
    cashRefundTotal += totalPaid > 0 ? refundAmt * (cashPaid / totalPaid) : 0
  }

  const expected = cashStart + cashPayments + deposits - withdrawals - salaries - cashRefundTotal

  return { expected, cashStart, cashPayments, deposits, withdrawals, salaries, cashRefundTotal }
}

export async function getShiftAnalytics(shiftId: string) {
  const shiftChecks = await db
    .select()
    .from(checks)
    .where(and(eq(checks.shiftId, shiftId), eq(checks.status, 'closed')))

  const totalRevenue = shiftChecks.reduce((s, c) => s + parseFloat(c.totalAmount), 0)
  const checksCount = shiftChecks.length

  const payments = await db
    .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
    .from(checkPayments)
    .innerJoin(checks, eq(checks.id, checkPayments.checkId))
    .where(eq(checks.shiftId, shiftId))
    .groupBy(checkPayments.method)

  return { totalRevenue, checksCount, avgCheck: checksCount ? totalRevenue / checksCount : 0, payments }
}

export async function getLastShiftCashEnd(): Promise<number | null> {
  const [row] = await db
    .select({ cashEnd: shifts.cashEnd })
    .from(shifts)
    .where(eq(shifts.status, 'closed'))
    .orderBy(desc(shifts.closedAt))
    .limit(1)
  if (!row || row.cashEnd === null) return null
  return parseFloat(String(row.cashEnd)) || null
}

export async function getShiftHistory(page = 1, limit = 20) {
  const offset = (page - 1) * limit
  const rows = await db
    .select({
      shift: shifts,
      openedByNickname: profiles.nickname,
    })
    .from(shifts)
    .leftJoin(profiles, eq(profiles.id, shifts.openedBy))
    .orderBy(desc(shifts.openedAt))
    .limit(limit)
    .offset(offset)

  return rows
}
