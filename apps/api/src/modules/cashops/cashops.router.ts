import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { cashOperations, shifts, checkPayments, checks, profiles, eq, and, desc, sum, sql } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift, getShiftCashBalance } from '../shifts/shifts.service.js'

export const cashopsRouter = new Hono<AppEnv>()
// Остаток/операции кассы — только owner/staff.
cashopsRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// GET /cashops — list operations for current shift + balance summary
cashopsRouter.get('/', async (c) => {
  const db = c.var.db
  const shift = await getCurrentShift(db)
  const operations = await db.select({
    id: cashOperations.id,
    type: cashOperations.type,
    amount: cashOperations.amount,
    description: cashOperations.description,
    createdAt: cashOperations.createdAt,
    createdBy: profiles.nickname,
  })
    .from(cashOperations)
    .leftJoin(profiles, eq(profiles.id, cashOperations.createdBy))
    .where(shift ? eq(cashOperations.shiftId, shift.id) : sql`1=0`)
    .orderBy(desc(cashOperations.createdAt))

  // Единый расчёт остатка кассы (та же логика, что у смены и закрытия смены):
  // начало + наличные платежи + внесения − изъятия − зарплаты − возвраты наличными.
  // Раньше здесь НЕ вычитались наличные возвраты — из-за чего «В кассе сейчас» в
  // инкассации расходилось с суммой при закрытии смены.
  const balance = shift
    ? await getShiftCashBalance(shift.id, db)
    : { cashStart: 0, cashPayments: 0, deposits: 0, withdrawals: 0, salaries: 0, expected: 0 }

  return c.json({ operations, balance })
})

// POST /cashops — create operation
cashopsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', z.object({
  type: z.enum(['deposit', 'withdrawal', 'salary']),
  amount: z.number().positive(),
  description: z.string().optional(),
  idempotencyKey: z.string().max(80).optional(),
})), async (c) => {
  const db = c.var.db
  const user = c.get('user')
  const { type, amount, description, idempotencyKey } = c.req.valid('json')
  const shift = await getCurrentShift(db)
  // Операции с кассой пишутся только в открытую смену — иначе они не попадут
  // в сверку (shiftId=null) и «потеряются» из ожидаемого остатка.
  if (!shift) return c.json({ error: 'Нет открытой смены' }, 400)

  const [op] = await db.insert(cashOperations).values({
    type,
    amount: String(amount),
    description,
    shiftId: shift.id,
    createdBy: user.sub,
    idempotencyKey,
  }).onConflictDoNothing({ target: cashOperations.idempotencyKey }).returning()

  // Повторный POST с тем же ключом (двойной клик/ретрай) — отдаём существующую.
  if (!op) {
    if (idempotencyKey) {
      const [existing] = await db.select().from(cashOperations).where(eq(cashOperations.idempotencyKey, idempotencyKey))
      if (existing) return c.json({ operation: existing, duplicate: true })
    }
    return c.json({ error: 'Не удалось сохранить операцию' }, 500)
  }

  return c.json({ operation: op }, 201)
})
