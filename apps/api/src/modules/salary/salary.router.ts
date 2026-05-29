import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, salaryPayments, shifts, checks, checkPayments, cashOperations, profiles, eq, and, desc, sum, gte, lte } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'

// Период (YYYY-MM) кладётся в note первым токеном (см. фронт salary/page.tsx).
// Достаём его в отдельное поле period, остаток оставляем как комментарий.
function splitNote(note: string | null): { period: string | null; note: string | null } {
  if (!note) return { period: null, note: null }
  const m = note.match(/^(\d{4}-\d{2})(?::\s*(.*))?$/)
  if (m) return { period: m[1], note: m[2]?.trim() || null }
  return { period: null, note }
}

function calculateSalary(revenue: number): number {
  if (revenue <= 7000) return 700
  return 700 + Math.ceil((revenue - 7000) / 1000) * 100
}

const PaySalarySchema = z.object({
  profileId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'transfer']).default('cash'),
  note: z.string().optional(),
  idempotencyKey: z.string().max(80).optional(),
})

export const salaryRouter = new Hono<AppEnv>()
salaryRouter.use('*', requireAuth)

salaryRouter.get('/', requireRole('owner'), async (c) => {
  const rows = await db
    .select({
      id: salaryPayments.id,
      staffId: salaryPayments.profileId,
      staffName: profiles.nickname,
      staffRole: profiles.role,
      amount: salaryPayments.amount,
      paymentMethod: salaryPayments.paymentMethod,
      note: salaryPayments.note,
      createdAt: salaryPayments.createdAt,
    })
    .from(salaryPayments)
    .leftJoin(profiles, eq(profiles.id, salaryPayments.profileId))
    .orderBy(desc(salaryPayments.createdAt))
    .limit(100)
  // period вынимаем из note (фронт хранит его там); отдаём оба поля раздельно.
  const payments = rows.map(r => {
    const { period, note } = splitNote(r.note)
    return { ...r, period, note }
  })
  return c.json({ payments })
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
  // Наличная зарплата — это деньги, покинувшие кассу: помимо записи о выплате
  // создаём cashOperation type='salary' за текущую смену, иначе сверка кассы
  // (getShiftCashBalance вычитает salary-операции) её не увидит и касса
  // «переполнится». Делаем в одной транзакции с записью о выплате.
  const shift = body.paymentMethod === 'cash' ? await getCurrentShift() : null

  const payment = await db.transaction(async (tx) => {
    const [pay] = await tx.insert(salaryPayments).values({
      ...body,
      amount: String(body.amount),
      createdBy: user.sub,
    }).onConflictDoNothing({ target: salaryPayments.idempotencyKey }).returning()

    // Дубликат по ключу (ретрай/двойной клик) — прерываем, cashOp не создаём.
    if (!pay) return null

    if (body.paymentMethod === 'cash' && shift) {
      await tx.insert(cashOperations).values({
        type: 'salary',
        amount: String(body.amount),
        description: `Зарплата${body.note ? ' · ' + body.note : ''}`,
        shiftId: shift.id,
        createdBy: user.sub,
        // Производный ключ от ключа выплаты — ретрай не задвоит и cashOp.
        idempotencyKey: body.idempotencyKey ? `${body.idempotencyKey}:salary-cashop` : undefined,
      }).onConflictDoNothing({ target: cashOperations.idempotencyKey })
    }

    return pay
  })

  if (!payment) {
    if (body.idempotencyKey) {
      const [existing] = await db.select().from(salaryPayments).where(eq(salaryPayments.idempotencyKey, body.idempotencyKey))
      if (existing) return c.json({ payment: existing, duplicate: true })
    }
    return c.json({ error: 'Не удалось сохранить выплату' }, 500)
  }
  return c.json({ payment }, 201)
})
