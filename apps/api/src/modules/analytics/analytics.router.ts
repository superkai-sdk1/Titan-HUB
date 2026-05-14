import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import {
  db, checks, checkItems, checkPayments, inventory, profiles, shifts, expenses,
  eq, and, gte, lte, desc, asc, sql, sum, count, avg,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const analyticsRouter = new Hono<AppEnv>()
analyticsRouter.use('*', requireAuth, requireRole('owner', 'staff'))

analyticsRouter.get('/dashboard', async (c) => {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [todayStats] = await db
    .select({
      revenue: sum(checks.totalAmount),
      count: count(),
    })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, new Date(today))))

  const [monthStats] = await db
    .select({ revenue: sum(checks.totalAmount), count: count() })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))

  const topItems = await db
    .select({
      itemId: checkItems.itemId,
      name: inventory.name,
      totalQty: sum(checkItems.quantity),
      totalRev: sql<number>`sum(${checkItems.quantity} * ${checkItems.priceAtTime})`,
    })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .leftJoin(checks, eq(checks.id, checkItems.checkId))
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))
    .groupBy(checkItems.itemId, inventory.name)
    .orderBy(desc(sql`sum(${checkItems.quantity} * ${checkItems.priceAtTime})`))
    .limit(10)

  const paymentBreakdown = await db
    .select({ method: checkPayments.method, total: sum(checkPayments.amount) })
    .from(checkPayments)
    .leftJoin(checks, eq(checks.id, checkPayments.checkId))
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDaysAgo)))
    .groupBy(checkPayments.method)

  return c.json({
    today: {
      revenue: parseFloat(String(todayStats?.revenue ?? 0)) || 0,
      checks: todayStats?.count ?? 0,
    },
    month: {
      revenue: parseFloat(String(monthStats?.revenue ?? 0)) || 0,
      checks: monthStats?.count ?? 0,
    },
    topItems,
    paymentBreakdown,
  })
})

analyticsRouter.get('/revenue', async (c) => {
  const from = c.req.query('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const to = c.req.query('to') ?? new Date().toISOString().split('T')[0]

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${checks.createdAt})::date::text`,
      revenue: sum(checks.totalAmount),
      count: count(),
    })
    .from(checks)
    .where(and(
      eq(checks.status, 'closed'),
      gte(checks.createdAt, new Date(from)),
      lte(checks.createdAt, new Date(to + 'T23:59:59')),
    ))
    .groupBy(sql`date_trunc('day', ${checks.createdAt})::date`)
    .orderBy(asc(sql`date_trunc('day', ${checks.createdAt})::date`))

  return c.json({ revenue: rows })
})

analyticsRouter.get('/products', async (c) => {
  const from = c.req.query('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const to = c.req.query('to') ?? new Date().toISOString().split('T')[0]

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
      gte(checks.createdAt, new Date(from)),
      lte(checks.createdAt, new Date(to + 'T23:59:59')),
    ))
    .groupBy(checkItems.itemId, inventory.name, inventory.category)
    .orderBy(desc(sql`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`))
    .limit(50)

  return c.json({ products: rows })
})

analyticsRouter.get('/clients', async (c) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)

  const [total] = await db.select({ count: count() }).from(profiles).where(eq(profiles.role, 'client'))
  const [newThisMonth] = await db
    .select({ count: count() })
    .from(profiles)
    .where(and(eq(profiles.role, 'client'), gte(profiles.createdAt, thirtyDaysAgo)))

  const tierDist = await db
    .select({ tier: profiles.clientTier, count: count() })
    .from(profiles)
    .where(eq(profiles.role, 'client'))
    .groupBy(profiles.clientTier)

  return c.json({ total: total.count, newThisMonth: newThisMonth.count, tierDist })
})

analyticsRouter.get('/shifts', async (c) => {
  const rows = await db
    .select({
      shift: shifts,
      staffNickname: profiles.nickname,
    })
    .from(shifts)
    .leftJoin(profiles, eq(profiles.id, shifts.openedBy))
    .orderBy(desc(shifts.openedAt))
    .limit(30)

  const enriched = await Promise.all(rows.map(async (r) => {
    const [stats] = await db
      .select({ revenue: sum(checks.totalAmount), count: count() })
      .from(checks)
      .where(and(eq(checks.shiftId, r.shift.id), eq(checks.status, 'closed')))
    return { ...r, revenue: parseFloat(String(stats?.revenue ?? 0)) || 0, checksCount: stats?.count ?? 0 }
  }))

  return c.json({ shifts: enriched })
})
