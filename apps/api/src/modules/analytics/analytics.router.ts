import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import {
  db, checks, checkItems, checkPayments, inventory, profiles, shifts, expenses,
  supplies, supplyItems, salaryPayments,
  eq, and, gte, lte, lt, desc, asc, sql, sum, count, avg, isNull, ne,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const analyticsRouter = new Hono<AppEnv>()
analyticsRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// ─── Helper ──────────────────────────────────────────────────────────────────
function parseNum(v: unknown) {
  return parseFloat(String(v ?? 0)) || 0
}

// Все витрины считаются по календарю Москвы (UTC+3), а не UTC, иначе около
// полуночи «сегодня/вчера/30 дней» съезжают, а expenseDate (text-дата в местном
// времени) сравнивается с UTC-границей с ошибкой на сутки. Паттерн как в
// cron/birthdays.ts: сдвигаем «сейчас» на +3ч и берём UTC-компоненты.
const MSK_OFFSET_MS = 3 * 3600 * 1000

// YYYY-MM-DD по МСК для даты, отстоящей от текущего момента на `daysAgo` суток.
function mskDateStr(daysAgo = 0): string {
  const d = new Date(Date.now() + MSK_OFFSET_MS - daysAgo * 86400000)
  return d.toISOString().split('T')[0]
}

// Граница полуночи МСК для YYYY-MM-DD как абсолютный момент (UTC = local − 3ч).
function mskBoundary(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+03:00`)
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
analyticsRouter.get('/dashboard', async (c) => {
  // Границы окон — полночь МСК. Окна полуоткрытые [начало, следующее_начало),
  // чтобы «вчера» и «сегодня» не дублировали чек, попавший ровно в полночь.
  const todayStart = mskBoundary(mskDateStr(0))           // 00:00 МСК сегодня
  const yesterdayStart = mskBoundary(mskDateStr(1))       // 00:00 МСК вчера
  const thirtyDaysAgo = mskBoundary(mskDateStr(30))       // 00:00 МСК 30 дней назад
  const sixtyDaysAgo = mskBoundary(mskDateStr(60))        // 00:00 МСК 60 дней назад

  // Today revenue
  const [todayStats] = await db
    .select({ revenue: sum(checks.totalAmount), count: count() })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, todayStart)))

  // Yesterday revenue for delta — полуоткрытый интервал [вчера, сегодня)
  const [yesterdayStats] = await db
    .select({ revenue: sum(checks.totalAmount), count: count() })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, yesterdayStart),
      lt(checks.createdAt, todayStart),
    ))

  // Month revenue
  const [monthStats] = await db
    .select({ revenue: sum(checks.totalAmount), count: count() })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))

  // Previous month for delta — полуоткрытый интервал [60д, 30д)
  const [prevMonthStats] = await db
    .select({ revenue: sum(checks.totalAmount), count: count() })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, sixtyDaysAgo),
      lt(checks.createdAt, thirtyDaysAgo),
    ))

  // COGS this month (supply costs)
  const [cogsRow] = await db
    .select({ total: sql<number>`sum(${supplyItems.quantity}::numeric * ${supplyItems.costPerUnit}::numeric)` })
    .from(supplyItems)
    .leftJoin(supplies, eq(supplies.id, supplyItems.supplyId))
    .where(gte(supplies.createdAt, thirtyDaysAgo))

  // Expenses this month.
  // ПРАВИЛО ЗАРПЛАТЫ В ПРИБЫЛИ: единственный источник истины по ФОТ — таблица
  // salaryPayments. Поэтому из «операционных расходов» исключаем категорию
  // 'salary' (её владелец мог завести и через расходы, и через выплаты ЗП —
  // суммировать оба источника = двойной счёт). Так прибыль не зависит от того,
  // через какой экран провели зарплату. Здесь категорию 'salary' исключаем, а
  // фактический ФОТ берём ниже из salaryPayments.
  const [expensesRow] = await db
    .select({ total: sum(expenses.amount) })
    .from(expenses)
    .where(and(gte(expenses.createdAt, thirtyDaysAgo), ne(expenses.category, 'salary')))

  // Payroll this month — единый источник (таблица выплат ЗП).
  const [salaryRow] = await db
    .select({ total: sum(salaryPayments.amount) })
    .from(salaryPayments)
    .where(gte(salaryPayments.createdAt, thirtyDaysAgo))

  // Payment breakdown (30d)
  const paymentBreakdown = await db
    .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
    .from(checkPayments)
    .leftJoin(checks, eq(checks.id, checkPayments.checkId))
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))
    .groupBy(checkPayments.method)

  // Top items (30d)
  const topItems = await db
    .select({
      itemId: checkItems.itemId,
      name: inventory.name,
      category: inventory.category,
      totalQty: sum(checkItems.quantity),
      totalRev: sql<number>`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`,
    })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .leftJoin(checks, eq(checks.id, checkItems.checkId))
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))
    .groupBy(checkItems.itemId, inventory.name, inventory.category)
    .orderBy(desc(sql`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`))
    .limit(20)

  // New clients (30d)
  const [newClients] = await db
    .select({ count: count() })
    .from(profiles)
    .where(and(eq(profiles.role, 'client'), isNull(profiles.deletedAt), gte(profiles.createdAt, thirtyDaysAgo)))

  const monthRev = parseNum(monthStats?.revenue)
  const prevMonthRev = parseNum(prevMonthStats?.revenue)
  const cogs = parseNum(cogsRow?.total)
  // Операционные расходы БЕЗ зарплаты (см. правило выше).
  const opExpenses = parseNum(expensesRow?.total)
  // ФОТ — единственный источник истины.
  const salary = parseNum(salaryRow?.total)
  // Совокупные расходы для прибыли = операционные (без ЗП) + ФОТ из salaryPayments.
  const totalExpenses = opExpenses + salary
  const profit = monthRev - cogs - totalExpenses
  const monthRevDelta = prevMonthRev > 0 ? Math.round(((monthRev - prevMonthRev) / prevMonthRev) * 100) : 0

  return c.json({
    today: {
      revenue: parseNum(todayStats?.revenue),
      checks: todayStats?.count ?? 0,
      avgCheck: (todayStats?.count ?? 0) > 0 ? parseNum(todayStats?.revenue) / (todayStats?.count ?? 1) : 0,
    },
    yesterday: {
      revenue: parseNum(yesterdayStats?.revenue),
      checks: yesterdayStats?.count ?? 0,
    },
    month: {
      revenue: monthRev,
      checks: monthStats?.count ?? 0,
      avgCheck: (monthStats?.count ?? 0) > 0 ? monthRev / (monthStats?.count ?? 1) : 0,
      cogs,
      expenses: totalExpenses,
      profit,
      delta: monthRevDelta,
    },
    newClients: newClients.count,
    topItems,
    paymentBreakdown,
  })
})

// ─── Revenue by day ───────────────────────────────────────────────────────────
analyticsRouter.get('/revenue', async (c) => {
  // Период по МСК. from/to — YYYY-MM-DD (включительно). Окно по timestamptz —
  // полуоткрытое [fromStart, toEndExclusive) на границах полуночи МСК; так чек,
  // созданный в 23:30 МСК последнего дня, попадает в нужные сутки, а не в UTC-день.
  const from = c.req.query('from') ?? mskDateStr(30)
  const to = c.req.query('to') ?? mskDateStr(0)
  const fromStart = mskBoundary(from)
  // следующий день после `to` в 00:00 МСК (верхняя граница, исключающая)
  const toEndExclusive = new Date(mskBoundary(to).getTime() + 86400000)

  const rows = await db
    .select({
      // День агрегируем в МСК, чтобы метки совпадали с границами окна.
      date: sql<string>`(${checks.createdAt} AT TIME ZONE 'Europe/Moscow')::date::text`,
      revenue: sum(checks.totalAmount),
      count: count(),
    })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, fromStart),
      lt(checks.createdAt, toEndExclusive),
    ))
    .groupBy(sql`(${checks.createdAt} AT TIME ZONE 'Europe/Moscow')::date`)
    .orderBy(asc(sql`(${checks.createdAt} AT TIME ZONE 'Europe/Moscow')::date`))

  // Expenses by day. expenseDate — text-дата в местном времени; сравниваем как
  // строки YYYY-MM-DD (от and до включительно), без каста ::date vs timestamptz,
  // который давал сдвиг на сутки относительно UTC-границы.
  const expRows = await db
    .select({
      date: sql<string>`${expenses.expenseDate}`,
      total: sum(expenses.amount),
    })
    .from(expenses)
    .where(and(
      gte(expenses.expenseDate, from),
      lte(expenses.expenseDate, to),
    ))
    .groupBy(expenses.expenseDate)

  // COGS by day (supply costs) — те же полуоткрытые границы МСК.
  const cogsRows = await db
    .select({
      date: sql<string>`(${supplies.createdAt} AT TIME ZONE 'Europe/Moscow')::date::text`,
      total: sql<number>`sum(${supplyItems.quantity}::numeric * ${supplyItems.costPerUnit}::numeric)`,
    })
    .from(supplyItems)
    .leftJoin(supplies, eq(supplies.id, supplyItems.supplyId))
    .where(and(
      gte(supplies.createdAt, fromStart),
      lt(supplies.createdAt, toEndExclusive),
    ))
    .groupBy(sql`(${supplies.createdAt} AT TIME ZONE 'Europe/Moscow')::date`)

  return c.json({ revenue: rows, expenses: expRows, cogs: cogsRows })
})

// ─── Products ABC ─────────────────────────────────────────────────────────────
analyticsRouter.get('/products', async (c) => {
  // Период по МСК, полуоткрытое окно [fromStart, toEndExclusive) — как в /revenue.
  const from = c.req.query('from') ?? mskDateStr(30)
  const to = c.req.query('to') ?? mskDateStr(0)
  const fromStart = mskBoundary(from)
  const toEndExclusive = new Date(mskBoundary(to).getTime() + 86400000)

  const rows = await db
    .select({
      itemId: checkItems.itemId,
      name: inventory.name,
      category: inventory.category,
      totalQty: sum(checkItems.quantity),
      totalRev: sql<number>`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`,
    })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .leftJoin(checks, eq(checks.id, checkItems.checkId))
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, fromStart),
      lt(checks.createdAt, toEndExclusive),
    ))
    .groupBy(checkItems.itemId, inventory.name, inventory.category)
    .orderBy(desc(sql`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`))
    .limit(50)

  // Calculate cumulative % for proper ABC classification
  const totalRev = rows.reduce((s: number, r: any) => s + parseNum(r.totalRev), 0)
  let cumulative = 0
  const withAbc = rows.map((r: any) => {
    const rev = parseNum(r.totalRev)
    const share = totalRev > 0 ? (rev / totalRev) * 100 : 0
    cumulative += share
    const abc = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C'
    return { ...r, share: Math.round(share * 10) / 10, cumulative: Math.round(cumulative * 10) / 10, abc }
  })

  return c.json({ products: withAbc, totalRev })
})

// ─── Clients / Players ────────────────────────────────────────────────────────
analyticsRouter.get('/clients', async (c) => {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)
  const prevFourteenStart = new Date(now.getTime() - 28 * 86400000)

  // Total clients
  const [total] = await db.select({ count: count() }).from(profiles)
    .where(and(eq(profiles.role, 'client'), isNull(profiles.deletedAt)))

  // New this month
  const [newThisMonth] = await db.select({ count: count() }).from(profiles)
    .where(and(eq(profiles.role, 'client'), isNull(profiles.deletedAt), gte(profiles.createdAt, thirtyDaysAgo)))

  // Tier distribution
  const tierDist = await db.select({ tier: profiles.clientTier, count: count() })
    .from(profiles)
    .where(and(eq(profiles.role, 'client'), isNull(profiles.deletedAt)))
    .groupBy(profiles.clientTier)

  // Clients who visited in current 14d window (visited = have a check)
  const currentActiveIds = await db
    .selectDistinct({ playerId: checks.playerId })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, fourteenDaysAgo),
    ))

  // Clients who visited in previous 14d window
  const prevActiveIds = await db
    .selectDistinct({ playerId: checks.playerId })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, prevFourteenStart),
      lte(checks.createdAt, fourteenDaysAgo),
    ))

  const currentSet = new Set(currentActiveIds.map((r: any) => r.playerId).filter(Boolean))
  const prevSet = new Set(prevActiveIds.map((r: any) => r.playerId).filter(Boolean))
  const retainedCount = [...prevSet].filter(id => id && currentSet.has(id)).length
  const retentionRate = prevSet.size > 0 ? Math.round((retainedCount / prevSet.size) * 100) : 0

  // Player segments: new / active / sleeping
  // New = registered < 30d ago AND has < 3 checks
  // Active = has check in last 14d
  // Sleeping = has checks but last check > 14d ago

  const visitCounts = await db
    .select({
      playerId: checks.playerId,
      total: count(),
      lastVisit: sql<string>`max(${checks.createdAt})::text`,
    })
    .from(checks)
    .where(eq(checks.status, 'closed'))
    .groupBy(checks.playerId)

  const segments = { new: 0, active: 0, sleeping: 0 }
  const cutoffMs = fourteenDaysAgo.getTime()

  for (const row of visitCounts) {
    const lastMs = row.lastVisit ? new Date(row.lastVisit).getTime() : 0
    if (lastMs > cutoffMs) {
      segments.active++
    } else {
      segments.sleeping++
    }
  }
  // New clients with no visits yet
  const [noVisit] = await db
    .select({ count: count() })
    .from(profiles)
    .where(and(
      eq(profiles.role, 'client'),
      isNull(profiles.deletedAt),
      gte(profiles.createdAt, thirtyDaysAgo),
    ))
  segments.new = noVisit.count

  // Top spenders (30d)
  const topSpenders = await db
    .select({
      playerId: checks.playerId,
      nickname: profiles.nickname,
      clientTier: profiles.clientTier,
      total: sum(checks.totalAmount),
      visits: count(),
    })
    .from(checks)
    .leftJoin(profiles, eq(profiles.id, checks.playerId))
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))
    .groupBy(checks.playerId, profiles.nickname, profiles.clientTier)
    .orderBy(desc(sum(checks.totalAmount)))
    .limit(10)

  return c.json({
    total: total.count,
    newThisMonth: newThisMonth.count,
    tierDist,
    retentionRate,
    segments,
    topSpenders,
  })
})

// ─── Shifts analytics ─────────────────────────────────────────────────────────
analyticsRouter.get('/shifts', async (c) => {
  const rows = await db
    .select({ shift: shifts, staffNickname: profiles.nickname })
    .from(shifts)
    .leftJoin(profiles, eq(profiles.id, shifts.openedBy))
    .orderBy(desc(shifts.openedAt))
    .limit(30)

  const enriched = await Promise.all(rows.map(async (r: any) => {
    const [stats] = await db
      .select({ revenue: sum(checks.totalAmount), cnt: count() })
      .from(checks)
      .where(and(eq(checks.shiftId, r.shift.id), eq(checks.status, 'closed')))

    const payments = await db
      .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
      .from(checkPayments)
      .leftJoin(checks, eq(checks.id, checkPayments.checkId))
      .where(eq(checks.shiftId, r.shift.id))
      .groupBy(checkPayments.method)

    return {
      ...r,
      revenue: parseNum(stats?.revenue),
      checksCount: stats?.cnt ?? 0,
      payments,
    }
  }))

  return c.json({ shifts: enriched })
})

// ─── Single shift detail ──────────────────────────────────────────────────────
analyticsRouter.get('/shifts/:id', async (c) => {
  const shiftId = c.req.param('id')

  const shiftChecks = await db
    .select()
    .from(checks)
    .where(and(eq(checks.shiftId, shiftId), eq(checks.status, 'closed')))

  const payments = await db
    .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
    .from(checkPayments)
    .leftJoin(checks, eq(checks.id, checkPayments.checkId))
    .where(eq(checks.shiftId, shiftId))
    .groupBy(checkPayments.method)

  const topItems = await db
    .select({
      itemId: checkItems.itemId,
      name: inventory.name,
      category: inventory.category,
      totalQty: sum(checkItems.quantity),
      totalRev: sql<number>`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`,
    })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .leftJoin(checks, eq(checks.id, checkItems.checkId))
    .where(eq(checks.shiftId, shiftId))
    .groupBy(checkItems.itemId, inventory.name, inventory.category)
    .orderBy(desc(sql`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`))
    .limit(15)

  const totalRev = topItems.reduce((s: number, r: any) => s + parseNum(r.totalRev), 0)
  let cumulative = 0
  const topItemsWithAbc = topItems.map((r: any) => {
    const rev = parseNum(r.totalRev)
    const share = totalRev > 0 ? (rev / totalRev) * 100 : 0
    cumulative += share
    return { ...r, share: Math.round(share * 10) / 10, abc: cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C' }
  })

  const uniquePlayers = new Set(shiftChecks.map((ch: any) => ch.playerId).filter(Boolean)).size
  const totalRevenue = shiftChecks.reduce((s: number, ch: any) => s + parseNum(ch.totalAmount), 0)
  const avgCheck = shiftChecks.length > 0 ? totalRevenue / shiftChecks.length : 0

  // Players data for this shift
  const playerStats = await db
    .select({
      playerId: checks.playerId,
      nickname: profiles.nickname,
      clientTier: profiles.clientTier,
      total: sum(checks.totalAmount),
      cnt: count(),
    })
    .from(checks)
    .leftJoin(profiles, eq(profiles.id, checks.playerId))
    .where(and(eq(checks.shiftId, shiftId), eq(checks.status, 'closed')))
    .groupBy(checks.playerId, profiles.nickname, profiles.clientTier)
    .orderBy(desc(sum(checks.totalAmount)))
    .limit(20)

  return c.json({
    overview: {
      totalRevenue,
      checksCount: shiftChecks.length,
      avgCheck,
      uniquePlayers,
    },
    checks: shiftChecks,
    payments,
    topItems: topItemsWithAbc,
    playerStats,
  })
})
