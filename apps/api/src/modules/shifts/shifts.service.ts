import { db, shifts, checks, checkPayments, profiles, eq, and, isNull, sql, desc, sum } from '@titan/database'

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

  const [updated] = await db
    .update(shifts)
    .set({ status: 'closed', closedBy, cashEnd: String(cashEnd), closedAt: new Date() })
    .where(eq(shifts.id, shiftId))
    .returning()
  return updated
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
