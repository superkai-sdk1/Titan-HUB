import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, cashOperations, shifts, checkPayments, checks, profiles, eq, and, desc, sum, sql } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'

export const cashopsRouter = new Hono<AppEnv>()
cashopsRouter.use('*', requireAuth)

// GET /cashops — list operations for current shift + balance summary
cashopsRouter.get('/', async (c) => {
  const shift = await getCurrentShift()
  const operations = await db.select({
    id: cashOperations.id,
    type: cashOperations.type,
    amount: cashOperations.amount,
    description: cashOperations.description,
    createdAt: cashOperations.createdAt,
    createdByNick: profiles.nickname,
  })
    .from(cashOperations)
    .leftJoin(profiles, eq(profiles.id, cashOperations.createdBy))
    .where(shift ? eq(cashOperations.shiftId, shift.id) : sql`1=0`)
    .orderBy(desc(cashOperations.createdAt))

  // Balance from shifts service logic
  let balance = { cashStart: 0, cashPayments: 0, deposits: 0, withdrawals: 0, expected: 0 }
  if (shift) {
    const [cashSum] = await db.select({ total: sum(checkPayments.amount) })
      .from(checkPayments)
      .innerJoin(checks, eq(checks.id, checkPayments.checkId))
      .where(and(eq(checks.shiftId, shift.id), eq(checkPayments.method, 'cash')))
    const [ops] = await db.select({
      deposits: sql<string>`coalesce(sum(case when type = 'deposit' then amount::numeric else 0 end), 0)`,
      withdrawals: sql<string>`coalesce(sum(case when type = 'withdrawal' then amount::numeric else 0 end), 0)`,
    }).from(cashOperations).where(eq(cashOperations.shiftId, shift.id))
    const cashStart = parseFloat(String(shift.cashStart ?? 0)) || 0
    const cashPayments = parseFloat(String(cashSum?.total ?? 0)) || 0
    const deposits = parseFloat(String(ops?.deposits ?? 0)) || 0
    const withdrawals = parseFloat(String(ops?.withdrawals ?? 0)) || 0
    balance = { cashStart, cashPayments, deposits, withdrawals, expected: cashStart + cashPayments + deposits - withdrawals }
  }

  return c.json({ operations, balance })
})

// POST /cashops — create operation
cashopsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', z.object({
  type: z.enum(['deposit', 'withdrawal', 'salary']),
  amount: z.number().positive(),
  description: z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const { type, amount, description } = c.req.valid('json')
  const shift = await getCurrentShift()

  const [op] = await db.insert(cashOperations).values({
    type,
    amount: String(amount),
    description,
    shiftId: shift?.id,
    createdBy: user.sub,
  }).returning()

  return c.json({ operation: op }, 201)
})
