import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, checks, checkItems, checkPayments, checkDiscounts, inventory, profiles, shifts, expenses,
  supplies, supplyItems, salaryPayments, refunds,
  eq, and, gte, lte, lt, desc, asc, sql, sum, count, avg, isNull, ne, inArray,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const analyticsRouter = new Hono<AppEnv>()
analyticsRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// ─── Helper ──────────────────────────────────────────────────────────────────
function parseNum(v: unknown) {
  return parseFloat(String(v ?? 0)) || 0
}

// ─── Date-range query validation ───────────────────────────────────────────────
// from/to — необязательные строки YYYY-MM-DD. Раньше значения из query шли прямо в
// new Date()/границы окна без проверки, и мусор («», «abc», «2026-13-99») давал
// Invalid Date → NaN-границы → пустые/нулевые витрины (прежний баг с 0/NaN).
// Здесь: регэксп пропускает только корректный календарный YYYY-MM-DD, всё прочее
// отбрасывается (становится undefined) и эндпоинт берёт значения по умолчанию.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isValidDateStr(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false
  const t = Date.parse(`${s}T00:00:00+03:00`)
  if (Number.isNaN(t)) return false
  // Защита от «2026-02-31» и подобных: JS-Date нормализует такие даты, поэтому
  // сверяем, что строка совпадает с обратной сериализацией компонентов.
  const d = new Date(t)
  const back = new Date(d.getTime() + MSK_OFFSET_MS).toISOString().split('T')[0]
  return back === s
}
const dateRangeQuerySchema = z.object({
  from: z.string().optional().transform(v => (v && isValidDateStr(v) ? v : undefined)),
  to: z.string().optional().transform(v => (v && isValidDateStr(v) ? v : undefined)),
})

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

// ─── Бизнес-день (09:00 → 06:00 следующих суток) ───────────────────────────────
// Заведение работает с 9 утра до 6 утра. «Итоги дня» считаются за этот промежуток,
// а не за календарные сутки. Бизнес-день D = [D 09:00 МСК, D+1 09:00 МСК):
// активность 09:00–06:00 + пустой технический интервал 06:00–09:00. Чек в 02:00
// относится к бизнес-дню предыдущей календарной даты.
const BIZ_START_HOUR = 9

// YYYY-MM-DD бизнес-дня, которому принадлежит момент `daysAgo` суток назад.
// Сдвигаем «сейчас» назад на 9ч, чтобы 00:00–08:59 МСК отнести к прошлой дате.
function bizDayStr(daysAgo = 0): string {
  const d = new Date(Date.now() + MSK_OFFSET_MS - BIZ_START_HOUR * 3600000 - daysAgo * 86400000)
  return d.toISOString().split('T')[0]
}

// Границы бизнес-дня как абсолютные моменты: [dateStr 09:00 МСК, +24ч).
function bizDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T09:00:00+03:00`)
  return { start, end: new Date(start.getTime() + 86400000) }
}

// Чистая разбивка за окно [start, end): валовая выручка, возвраты, эквайринг (8%
// от СБП-переводов), себестоимость проданного, операционные расходы (без ЗП) и ЗП.
// Возвращает и «грязные», и «чистые» показатели — фронт сам решает, что показывать.
async function netBreakdown(start: Date, end: Date, expFrom: string, expTo: string) {
  const [grossRow] = await db
    .select({ revenue: sum(checks.totalAmount), cnt: count() })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, start), lt(checks.createdAt, end)))

  // Возвраты за окно (по дате возврата).
  const [refundRow] = await db
    .select({ total: sum(refunds.totalAmount) })
    .from(refunds)
    .where(and(gte(refunds.createdAt, start), lt(refunds.createdAt, end)))

  // Эквайринг СБП: 8% от суммы переводов (method='transfer') закрытых чеков окна.
  const [sbpRow] = await db
    .select({ total: sum(checkPayments.amount) })
    .from(checkPayments)
    .leftJoin(checks, eq(checks.id, checkPayments.checkId))
    .where(and(eq(checks.status, 'closed'), eq(checkPayments.method, 'transfer'), gte(checks.createdAt, start), lt(checks.createdAt, end)))

  // Себестоимость поставок, пришедших в окно (приближение COGS периода).
  const [cogsRow] = await db
    .select({ total: sql<number>`sum(${supplyItems.quantity}::numeric * ${supplyItems.costPerUnit}::numeric)` })
    .from(supplyItems)
    .leftJoin(supplies, eq(supplies.id, supplyItems.supplyId))
    .where(and(gte(supplies.createdAt, start), lt(supplies.createdAt, end)))

  // Операционные расходы без ЗП (по text-дате expenseDate, YYYY-MM-DD).
  const [opexRow] = await db
    .select({ total: sum(expenses.amount) })
    .from(expenses)
    .where(and(gte(expenses.expenseDate, expFrom), lte(expenses.expenseDate, expTo), ne(expenses.category, 'salary')))

  // ФОТ — из выплат ЗП (единый источник).
  const [salaryRow] = await db
    .select({ total: sum(salaryPayments.amount) })
    .from(salaryPayments)
    .where(and(gte(salaryPayments.createdAt, start), lt(salaryPayments.createdAt, end)))

  const gross = parseNum(grossRow?.revenue)
  const cnt = grossRow?.cnt ?? 0
  const refundsTotal = parseNum(refundRow?.total)
  const commission = Math.round(parseNum(sbpRow?.total) * 0.08 * 100) / 100
  const cogs = parseNum(cogsRow?.total)
  const opex = parseNum(opexRow?.total)
  const salary = parseNum(salaryRow?.total)
  // Чистыми считаем: выручка − возвраты − эквайринг − себестоимость − опекс − ЗП.
  const net = gross - refundsTotal - commission - cogs - opex - salary
  return {
    gross,
    checks: cnt,
    avgCheck: cnt > 0 ? gross / cnt : 0,
    refunds: refundsTotal,
    commission,
    cogs,
    opex,
    salary,
    expenses: opex + salary,
    net: Math.round(net * 100) / 100,
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
analyticsRouter.get('/dashboard', async (c) => {
  // «Сегодня/вчера» считаем по БИЗНЕС-ДНЮ (09:00→06:00), а не по календарным суткам:
  // заведение работает с 9 утра до 6 утра, и «итоги дня» должны покрывать этот
  // промежуток. Бизнес-день D = [D 09:00 МСК, D+1 09:00 МСК).
  const todayBizStr = bizDayStr(0)
  const yesterdayBizStr = bizDayStr(1)
  const { start: todayStart } = bizDayBounds(todayBizStr)
  const { start: yesterdayStart } = bizDayBounds(yesterdayBizStr)
  const thirtyDaysAgo = mskBoundary(mskDateStr(30))       // 00:00 МСК 30 дней назад
  const sixtyDaysAgo = mskBoundary(mskDateStr(60))        // 00:00 МСК 60 дней назад

  // Today revenue (бизнес-день: с 09:00 текущего бизнес-дня)
  const [todayStats] = await db
    .select({ revenue: sum(checks.totalAmount), count: count() })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, todayStart)))

  // Yesterday revenue for delta — полуоткрытый интервал [вчера-бизнес, сегодня-бизнес)
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

  // Net-разбивка (с учётом расходов/комиссий/возвратов) для дня и месяца.
  const { end: todayEnd } = bizDayBounds(todayBizStr)
  const netToday = await netBreakdown(todayStart, todayEnd, todayBizStr, todayBizStr)
  const netMonth = await netBreakdown(thirtyDaysAgo, todayEnd, mskDateStr(30), mskDateStr(0))

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
    // Бизнес-день, к которому относятся «итоги дня» (09:00→06:00).
    businessDay: todayBizStr,
    // Чистые показатели с учётом расходов/комиссий/возвратов (день и месяц).
    // Фронт показывает «без учёта» (gross) и «с учётом» (net) по переключателю.
    netToday,
    netMonth,
  })
})

// ─── Revenue by day ───────────────────────────────────────────────────────────
analyticsRouter.get('/revenue', zValidator('query', dateRangeQuerySchema), async (c) => {
  // Период по МСК. from/to — YYYY-MM-DD (включительно). Окно по timestamptz —
  // полуоткрытое [fromStart, toEndExclusive) на границах полуночи МСК; так чек,
  // созданный в 23:30 МСК последнего дня, попадает в нужные сутки, а не в UTC-день.
  // from/to валидированы (см. dateRangeQuerySchema): мусорные/Invalid даты уже
  // отброшены в undefined, поэтому здесь надёжно падаем на дефолты.
  const q = c.req.valid('query')
  const from = q.from ?? mskDateStr(30)
  const to = q.to ?? mskDateStr(0)
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
analyticsRouter.get('/products', zValidator('query', dateRangeQuerySchema), async (c) => {
  // Период по МСК, полуоткрытое окно [fromStart, toEndExclusive) — как в /revenue.
  // from/to валидированы (dateRangeQuerySchema), мусор отброшен → дефолты.
  const q = c.req.valid('query')
  const from = q.from ?? mskDateStr(30)
  const to = q.to ?? mskDateStr(0)
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

  // Сегменты игроков: new / active / sleeping
  // New = регистрация < 30 дней назад (берётся отдельным запросом ниже)
  // Active = есть закрытый чек за последние 14 дней
  // Sleeping = есть чеки, но последний — более 14 дней назад
  //
  // ОКНО 90 ДНЕЙ (а не all-time): этот агрегат раньше сканировал ВСЕ закрытые чеки
  // за всю историю (один ряд на каждого игрока, когда-либо что-то купившего), и
  // объём рос безгранично. Для сегментации это избыточно: «active» — это последние
  // 14 дней, а «sleeping» имеет смысл только как «недавно был активен, но затих».
  // Игроки без единого закрытого чека за 90 дней считаются ушедшими и в эти два
  // сегмента не попадают (для них есть отдельные витрины retention/тиров). Окно
  // опирается на индекс по checks.created_at и режет скан до свежих данных.
  // Форма ответа не меняется — наполняем те же segments.active / segments.sleeping.
  const segmentsWindowStart = new Date(now.getTime() - 90 * 86400000)

  const visitCounts = await db
    .select({
      playerId: checks.playerId,
      total: count(),
      lastVisit: sql<string>`max(${checks.createdAt})::text`,
    })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, segmentsWindowStart),
    ))
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

  // Раньше тут был N+1: для каждой из 30 смен выполнялись 2 отдельных запроса
  // (выручка/кол-во чеков + разбивка платежей) → 1 + 2×30 = 61 запрос. Теперь —
  // ровно 3 запроса на весь список: список смен (выше) + 2 агрегата, сгруппированных
  // по shift_id и ограниченных набором id текущей страницы через inArray, а сшивку
  // выполняем в JS по shiftId. Форма ответа не изменилась.
  const shiftIds = rows.map((r: any) => r.shift.id)

  // Агрегат по чекам: выручка и число закрытых чеков на смену (одним запросом).
  // Пустой набор id обрабатываем явно, чтобы не строить inArray по пустому массиву.
  const statsRows = shiftIds.length
    ? await db
        .select({
          shiftId: checks.shiftId,
          revenue: sum(checks.totalAmount),
          cnt: count(),
        })
        .from(checks)
        .where(and(inArray(checks.shiftId, shiftIds), eq(checks.status, 'closed')))
        .groupBy(checks.shiftId)
    : []

  // Разбивка платежей по способу оплаты на смену (одним запросом, группировка по
  // shift_id + method). join к checks нужен, т.к. shift_id живёт в checks, а не в
  // check_payments. Поведение прежней per-shift версии сохранено: фильтра по
  // status здесь не было — оставляем как есть, чтобы суммы платежей совпадали.
  const paymentRows = shiftIds.length
    ? await db
        .select({
          shiftId: checks.shiftId,
          method: checkPayments.method,
          total: sum(checkPayments.amount),
        })
        .from(checkPayments)
        .leftJoin(checks, eq(checks.id, checkPayments.checkId))
        .where(inArray(checks.shiftId, shiftIds))
        .groupBy(checks.shiftId, checkPayments.method)
    : []

  // Индексируем агрегаты по shiftId для O(1)-сшивки.
  const statsByShift = new Map<string, { revenue: unknown; cnt: number }>()
  for (const s of statsRows) {
    statsByShift.set(s.shiftId as string, { revenue: s.revenue, cnt: s.cnt })
  }
  // Платежи: на каждую смену — массив { method, total } той же формы, что отдавала
  // прежняя per-shift выборка (поля method/total сохранены дословно).
  const paymentsByShift = new Map<string, { method: string; total: unknown }[]>()
  for (const p of paymentRows) {
    const key = p.shiftId as string
    const list = paymentsByShift.get(key) ?? []
    list.push({ method: p.method, total: p.total })
    paymentsByShift.set(key, list)
  }

  const enriched = rows.map((r: any) => {
    const stats = statsByShift.get(r.shift.id)
    return {
      ...r,
      revenue: parseNum(stats?.revenue),
      checksCount: stats?.cnt ?? 0,
      payments: paymentsByShift.get(r.shift.id) ?? [],
    }
  })

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

// ─── Список чеков за бизнес-день/диапазон (для просмотра чеков) ─────────────────
// from/to — бизнес-дни YYYY-MM-DD (включительно). По умолчанию — текущий бизнес-день.
// Окно по timestamptz — [from 09:00 МСК, to+1 09:00 МСК). Отдаёт сводку (net/gross)
// и список чеков с именем гостя/игрока, кассиром, способами оплаты и числом позиций.
analyticsRouter.get('/checks', zValidator('query', dateRangeQuerySchema), async (c) => {
  const q = c.req.valid('query')
  const from = q.from ?? bizDayStr(0)
  const to = q.to ?? from
  const { start } = bizDayBounds(from)
  const { end } = bizDayBounds(to)

  const rows = await db
    .select({
      id: checks.id,
      createdAt: checks.createdAt,
      closedAt: checks.closedAt,
      status: checks.status,
      totalAmount: checks.totalAmount,
      discountTotal: checks.discountTotal,
      bonusUsed: checks.bonusUsed,
      certificateUsed: checks.certificateUsed,
      playerId: checks.playerId,
      playerNickname: profiles.nickname,
      guestNames: checks.guestNames,
      staffId: checks.staffId,
      shiftId: checks.shiftId,
      linkedEventId: checks.linkedEventId,
      spaceId: checks.spaceId,
      paymentMethod: checks.paymentMethod,
    })
    .from(checks)
    .leftJoin(profiles, eq(profiles.id, checks.playerId))
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, start), lt(checks.createdAt, end)))
    .orderBy(desc(checks.createdAt))
    .limit(1000)

  const checkIds = rows.map((r: any) => r.id)

  // Кассиры — отдельной выборкой по staffId (избегаем второго join к profiles).
  const staffIds = [...new Set(rows.map((r: any) => r.staffId).filter(Boolean))]
  const staffRows = staffIds.length
    ? await db.select({ id: profiles.id, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.id, staffIds as string[]))
    : []
  const staffMap = new Map(staffRows.map((s: any) => [s.id, s.nickname]))

  // Число позиций на чек (сумма количеств).
  const itemRows = checkIds.length
    ? await db
        .select({ checkId: checkItems.checkId, qty: sum(checkItems.quantity) })
        .from(checkItems)
        .where(inArray(checkItems.checkId, checkIds))
        .groupBy(checkItems.checkId)
    : []
  const itemMap = new Map(itemRows.map((r: any) => [r.checkId, Number(r.qty ?? 0)]))

  // Способы оплаты на чек.
  const payRows = checkIds.length
    ? await db
        .select({ checkId: checkPayments.checkId, method: checkPayments.method, amount: checkPayments.amount })
        .from(checkPayments)
        .where(inArray(checkPayments.checkId, checkIds))
    : []
  const payMap = new Map<string, { method: string; amount: number }[]>()
  for (const p of payRows as any[]) {
    const list = payMap.get(p.checkId) ?? []
    list.push({ method: p.method, amount: parseNum(p.amount) })
    payMap.set(p.checkId, list)
  }

  const list = rows.map((r: any) => {
    const guest = r.playerNickname || (Array.isArray(r.guestNames) && r.guestNames[0]) || null
    return {
      id: r.id,
      createdAt: r.createdAt,
      closedAt: r.closedAt,
      totalAmount: parseNum(r.totalAmount),
      discountTotal: parseNum(r.discountTotal),
      bonusUsed: parseNum(r.bonusUsed),
      certificateUsed: parseNum(r.certificateUsed),
      playerId: r.playerId,
      guestName: guest,
      staffId: r.staffId,
      staffNickname: staffMap.get(r.staffId) ?? null,
      shiftId: r.shiftId,
      linkedEventId: r.linkedEventId,
      hasRental: !!r.spaceId,
      paymentMethod: r.paymentMethod,
      itemCount: itemMap.get(r.id) ?? 0,
      payments: payMap.get(r.id) ?? [],
    }
  })

  const summary = await netBreakdown(start, end, from, to)
  return c.json({ from, to, summary, checks: list })
})

// ─── Детализация одного чека (что в чеке, чей, как оплачен) ─────────────────────
analyticsRouter.get('/checks/:id', async (c) => {
  const id = c.req.param('id')
  const [check] = await db.select().from(checks).where(eq(checks.id, id)).limit(1)
  if (!check) return c.json({ error: 'not_found' }, 404)

  const items = await db
    .select({
      id: checkItems.id,
      itemId: checkItems.itemId,
      name: inventory.name,
      category: inventory.category,
      quantity: checkItems.quantity,
      priceAtTime: checkItems.priceAtTime,
    })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .where(eq(checkItems.checkId, id))

  const payments = await db
    .select({ method: checkPayments.method, amount: checkPayments.amount })
    .from(checkPayments)
    .where(eq(checkPayments.checkId, id))

  // Применённые скидки (детально: название, тип, значение, сумма, на чек/позицию).
  const discountRows = await db
    .select({ id: checkDiscounts.id, name: checkDiscounts.name, type: checkDiscounts.type, value: checkDiscounts.value, amount: checkDiscounts.amount, target: checkDiscounts.target, itemId: checkDiscounts.itemId })
    .from(checkDiscounts)
    .where(eq(checkDiscounts.checkId, id))

  const [player] = check.playerId
    ? await db.select({ id: profiles.id, nickname: profiles.nickname, fullName: profiles.fullName, phone: profiles.phone, clientTier: profiles.clientTier })
        .from(profiles).where(eq(profiles.id, check.playerId)).limit(1)
    : [null as any]

  const [staff] = await db.select({ id: profiles.id, nickname: profiles.nickname })
    .from(profiles).where(eq(profiles.id, check.staffId)).limit(1)

  const checkRefunds = await db
    .select({ id: refunds.id, totalAmount: refunds.totalAmount, reason: refunds.reason, tenders: refunds.tenders, createdAt: refunds.createdAt })
    .from(refunds).where(eq(refunds.checkId, id))

  const guestName = player?.nickname || (Array.isArray(check.guestNames) && check.guestNames[0]) || null

  return c.json({
    check: {
      ...check,
      totalAmount: parseNum(check.totalAmount),
      discountTotal: parseNum(check.discountTotal),
      bonusUsed: parseNum(check.bonusUsed),
      certificateUsed: parseNum(check.certificateUsed),
      eventBaseAmount: check.eventBaseAmount != null ? parseNum(check.eventBaseAmount) : null,
    },
    guestName,
    items: items.map((i: any) => ({ ...i, priceAtTime: parseNum(i.priceAtTime), lineTotal: parseNum(i.priceAtTime) * Number(i.quantity) })),
    payments: payments.map((p: any) => ({ method: p.method, amount: parseNum(p.amount) })),
    discounts: discountRows.map((d: any) => ({ id: d.id, name: d.name, type: d.type, value: parseNum(d.value), amount: parseNum(d.amount), target: d.target, itemId: d.itemId })),
    player,
    staff,
    refunds: checkRefunds.map((r: any) => ({ ...r, totalAmount: parseNum(r.totalAmount) })),
  })
})
