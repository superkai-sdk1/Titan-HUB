import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, salaryPayments, shifts, checks, checkPayments, profiles, eq, and, desc, sum, gte, lte } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

function calculateSalary(revenue: number): number {
  if (revenue <= 7000) return 700
  return 700 + Math.ceil((revenue - 7000) / 1000) * 100
}

const PaySalarySchema = z.object({
  profileId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string().default('cash'),
  note: z.string().optional(),
})

export const salaryRouter = new Hono<AppEnv>()
salaryRouter.use('*', requireAuth)

salaryRouter.get('/', requireRole('owner'), async (c) => {
  const rows = await db.select().from(salaryPayments).orderBy(desc(salaryPayments.createdAt)).limit(100)
  return c.json({ payments: rows })
})

salaryRouter.get('/estimate', requireRole('owner', 'staff'), async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const staffId = c.req.query('staffId') ?? c.get('user').sub

  const conditions = [eq(checks.staffId, staffId), eq(checks.status, 'closed')]
  if (from) conditions.push(gte(checks.createdAt, new Date(from)))
  if (to) conditions.push(lte(checks.createdAt, new Date(to)))

  const [result] = await db
    .select({ revenue: sum(checks.totalAmount) })
    .from(checks)
    .where(and(...(conditions as [any, ...any[]])))

  const revenue = parseFloat(String(result?.revenue ?? '0')) || 0
  const salary = calculateSalary(revenue)

  return c.json({ revenue, salary, staffId })
})

salaryRouter.post('/pay', requireRole('owner'), zValidator('json', PaySalarySchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [payment] = await db.insert(salaryPayments).values({
    ...body,
    amount: String(body.amount),
    createdBy: user.sub,
  }).returning()
  return c.json({ payment }, 201)
})
