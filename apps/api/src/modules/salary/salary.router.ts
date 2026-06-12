import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, salaryPayments, shifts, checks, checkPayments, cashOperations, profiles, eq, and, desc, sum, gte, lte, lt, sql } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'

// Период (YYYY-MM) кладётся в note первым токеном (см. фронт salary/page.tsx).
// Достаём его в отдельное поле period, остаток оставляем как комментарий.
function splitNote(note: string | null): { period: string | null; note: string | null } {
  if (!note) return { period: null, note: null }
  // period может быть месяцем (YYYY-MM) или днём (YYYY-MM-DD).
  const m = note.match(/^(\d{4}-\d{2}(?:-\d{2})?)(?::\s*(.*))?$/)
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
  // Дневной расчёт по БИЗНЕС-ДНЮ (09:00→06:00): зарплата зависит от выручки КЛУБА
  // за бизнес-день по той же формуле, но БЕЗ учёта мероприятий — из суммы чеков
  // вычитаем базовую сумму мероприятия (event_base_amount). Списания на персонал
  // имеют итог 0₽ и в выручку не идут. Зарплата выдаётся ежедневно.
  const day = c.req.query('day')
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = new Date(`${day}T09:00:00+03:00`)
    const end = new Date(start.getTime() + 86400000)
    const [r] = await db
      .select({ revenue: sql<string>`coalesce(sum(${checks.totalAmount}::numeric - coalesce(${checks.eventBaseAmount}, 0)::numeric), 0)` })
      .from(checks)
      .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, start), lt(checks.createdAt, end)))
    const revenue = Math.max(0, parseFloat(String(r?.revenue ?? '0')) || 0)
    return c.json({ day, revenue, salary: calculateSalary(revenue) })
  }

  const from = c.req.query('from')
  const to = c.req.query('to')
  // Приватность: staff видит ТОЛЬКО свою оценку — чужой ?staffId= игнорируется.
  // Только owner может запросить расчёт по конкретному сотруднику. Раньше любой
  // staff мог подставить чужой uuid и узнать выручку/ЗП коллеги.
  const user = c.get('user')
  const staffId = user.role === 'owner' ? (c.req.query('staffId') ?? user.sub) : user.sub

  // Границы периода строим по календарю МСК (как аналитика): from — 00:00 МСК
  // указанной даты, to — эксклюзивная верхняя граница (следующие сутки 00:00 МСК),
  // иначе new Date('YYYY-MM-DD') трактовалось как UTC и окно съезжало на 3ч,
  // а чек последнего дня после 21:00 МСК выпадал из расчёта.
  const conditions = [eq(checks.staffId, staffId), eq(checks.status, 'closed')]
  // По БИЗНЕС-ДНЮ (09:00→06:00), как и дневная ветка выше: окно [from 09:00, to+1 09:00).
  if (from) conditions.push(gte(checks.createdAt, new Date(`${from}T09:00:00+03:00`)))
  if (to) conditions.push(lt(checks.createdAt, new Date(new Date(`${to}T09:00:00+03:00`).getTime() + 86400000)))

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
  const payment = await db.transaction(async (tx) => {
    const [pay] = await tx.insert(salaryPayments).values({
      ...body,
      amount: String(body.amount),
      createdBy: user.sub,
    }).onConflictDoNothing({ target: salaryPayments.idempotencyKey }).returning()

    // Дубликат по ключу (ретрай/двойной клик) — прерываем, cashOp не создаём.
    if (!pay) return null

    if (body.paymentMethod === 'cash') {
      // Открытую смену читаем ВНУТРИ транзакции, прямо перед записью cashOp:
      // если смена закрылась между приёмом запроса и коммитом, cashOperation
      // не должна лечь на устаревший shiftId. Если открытой смены нет — выплату
      // фиксируем, но кассовую операцию не создаём (как и раньше при shift=null).
      const shift = await getCurrentShift()
      if (shift) {
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
    }
    // Безналичная зарплата (перевод) кассу не трогает и отдельной строки-расхода
    // не создаёт: в разделе «Расходы» и в P&L зарплата (нал+перевод) берётся из
    // salaryPayments (см. /expenses/summary и netBreakdown). Это исключает задвоение.

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
