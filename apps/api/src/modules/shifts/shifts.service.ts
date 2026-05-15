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
  const today = new Date()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const rows = await db.select({
    id: profiles.id,
    nickname: profiles.nickname,
    birthday: profiles.birthday,
  }).from(profiles)
    .where(and(
      eq(profiles.role, 'client'),
      isNull(profiles.deletedAt),
      sql`to_char(${profiles.birthday}::date, 'MM-DD') = ${mm + '-' + dd}`,
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

  // Cash operations: deposits (+) and withdrawals (-) during this shift
  const [opsSum] = await db.select({
    deposits: sql<string>`coalesce(sum(case when type = 'deposit' then amount::numeric else 0 end), 0)`,
    withdrawals: sql<string>`coalesce(sum(case when type = 'withdrawal' then amount::numeric else 0 end), 0)`,
  })
    .from(cashOperations)
    .where(eq(cashOperations.shiftId, shiftId))

  const deposits = parseFloat(String(opsSum?.deposits ?? 0)) || 0
  const withdrawals = parseFloat(String(opsSum?.withdrawals ?? 0)) || 0

  // Возвраты наличными: для каждого возврата считаем долю наличных
  // (сумма возврата × доля наличных в оригинальном чеке)
  const refundRows = await db
    .select({
      refundTotal: refunds.totalAmount,
      checkId: refunds.checkId,
    })
    .from(refunds)
    .innerJoin(checks, eq(checks.id, refunds.checkId))
    .where(eq(checks.shiftId, shiftId))

  let cashRefundTotal = 0
  if (refundRows.length > 0) {
    for (const r of refundRows) {
      const checkId = r.checkId
      const refundAmt = parseFloat(String(r.refundTotal)) || 0

      // Суммы платежей по методам в этом чеке
      const payments = await db
        .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
        .from(checkPayments)
        .where(eq(checkPayments.checkId, checkId))
        .groupBy(checkPayments.method)

      const totalPaid = payments.reduce((s, p) => s + (parseFloat(String(p.total)) || 0), 0)
      const cashPaid = parseFloat(String(payments.find(p => p.method === 'cash')?.total ?? 0)) || 0

      // Доля наличных: пропорционально покрываем возврат
      const cashShare = totalPaid > 0 ? cashPaid / totalPaid : 0
      cashRefundTotal += refundAmt * cashShare
    }
  }

  const expected = cashStart + cashPayments + deposits - withdrawals - cashRefundTotal

  return { expected, cashStart, cashPayments, deposits, withdrawals, cashRefundTotal }
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
