import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, events, checks, checkItems, checkPayments, inventory,
  eq, and, gte, lte, desc, sql, or, ne,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'

const EventSchema = z.object({
  type: z.enum(['titan', 'exit']).default('titan'),
  title: z.string().optional(),
  location: z.string().optional(),
  spaceId: z.string().uuid().optional().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  paymentType: z.enum(['fixed', 'per_head', 'free']).default('fixed'),
  billingMode: z.enum(['amount', 'hourly']).default('amount'),
  fixedAmount: z.number().optional().nullable(),
  perHeadAmount: z.number().optional().nullable(),
  manualAmount: z.number().optional().nullable(),
  maxGuests: z.number().int().positive().optional().nullable(),
  status: z.enum(['planned', 'needs_clarification', 'active', 'completed', 'cancelled']).default('planned'),
  comment: z.string().optional().nullable(),
  reminders: z.array(z.string()).default([]),
  responsibleStaffId: z.string().uuid().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
})

// Базовая сумма события для чека (billingMode=amount): ручная сумма приоритетна,
// иначе фикс; для free/per_head без ручной — 0. hourly → база 0 (платим арендой зоны).
function eventBaseAmount(ev: {
  billingMode: string; paymentType: string
  manualAmount: string | null; fixedAmount: string | null
}): number {
  if (ev.billingMode === 'hourly') return 0
  if (ev.manualAmount != null) return parseFloat(ev.manualAmount) || 0
  if (ev.paymentType === 'fixed' && ev.fixedAmount != null) return parseFloat(ev.fixedAmount) || 0
  return 0
}

export const eventsRouter = new Hono<AppEnv>()
eventsRouter.use('*', requireAuth)

// ── Утилита: проверка пересечения событий по пространству ────────────────
async function findOverlappingEvent(
  body: Partial<z.infer<typeof EventSchema>>,
  excludeEventId?: string,
) {
  if (body.type !== 'titan' || !body.spaceId || !body.date || !body.startTime) return null

  const startA = body.startTime
  const endA = body.endTime ?? body.startTime
  const conditions = [
    eq(events.date, body.date),
    eq(events.spaceId, body.spaceId),
    ne(events.status, 'cancelled' as const),
    ne(events.status, 'completed' as const),
    // Пересечение: startA <= endB AND endA >= startB
    sql`COALESCE(${events.endTime}, ${events.startTime}) >= ${startA}`,
    sql`${events.startTime} <= ${endA}`,
  ]
  if (excludeEventId) conditions.push(ne(events.id, excludeEventId))

  const rows = await db.select().from(events).where(and(...(conditions as [any, ...any[]]))).limit(1)
  return rows[0] ?? null
}

eventsRouter.get('/', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const spaceId = c.req.query('spaceId')

  const conditions: any[] = []
  if (from) conditions.push(gte(events.date, from))
  if (to) conditions.push(lte(events.date, to))
  if (spaceId) conditions.push(eq(events.spaceId, spaceId))

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...(conditions as [any, ...any[]])) : undefined)
    .orderBy(desc(events.date), desc(events.startTime))

  return c.json({ events: rows })
})

// ── GET /events/active-for-space/:spaceId — для планшета ─────────────────
eventsRouter.get('/active-for-space/:spaceId', async (c) => {
  const spaceId = c.req.param('spaceId')
  const today = new Date().toISOString().split('T')[0]
  const [event] = await db
    .select()
    .from(events)
    .where(and(
      eq(events.spaceId, spaceId),
      eq(events.status, 'active'),
      eq(events.date, today!),
    ))
    .limit(1)
  return c.json({ event: event ?? null })
})

eventsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', EventSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  // Защита от пересекающихся событий по одному пространству
  const overlap = await findOverlappingEvent(body)
  if (overlap) {
    return c.json({
      error: 'На это время уже запланировано другое мероприятие в этом пространстве',
      conflict: { id: overlap.id, title: overlap.title, startTime: overlap.startTime, endTime: overlap.endTime },
    }, 409)
  }

  const [event] = await db.insert(events).values({
    type: body.type,
    title: body.title,
    location: body.location,
    spaceId: body.spaceId ?? null,
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime ?? null,
    paymentType: body.paymentType,
    billingMode: body.billingMode,
    fixedAmount: body.fixedAmount != null ? String(body.fixedAmount) : null,
    perHeadAmount: body.perHeadAmount != null ? String(body.perHeadAmount) : null,
    manualAmount: body.manualAmount != null ? String(body.manualAmount) : null,
    maxGuests: body.maxGuests ?? null,
    status: body.status,
    comment: body.comment,
    reminders: body.reminders,
    responsibleStaffId: body.responsibleStaffId ?? null,
    customerName: body.customerName ?? null,
    customerPhone: body.customerPhone ?? null,
    createdBy: user.sub,
  }).returning()
  return c.json({ event }, 201)
})

eventsRouter.get('/:id', async (c) => {
  const [event] = await db.select().from(events).where(eq(events.id, c.req.param('id')))
  if (!event) return c.json({ error: 'Not found' }, 404)
  return c.json({ event })
})

eventsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', EventSchema.partial()), async (c) => {
  const user = c.get('user')
  const eventId = c.req.param('id')
  const body = c.req.valid('json')

  // Если меняется время/пространство — проверить пересечение
  if (body.spaceId || body.startTime || body.endTime || body.date) {
    const [current] = await db.select().from(events).where(eq(events.id, eventId))
    if (current) {
      const merged = {
        type: body.type ?? current.type,
        spaceId: body.spaceId ?? current.spaceId ?? undefined,
        date: body.date ?? current.date,
        startTime: body.startTime ?? current.startTime,
        endTime: body.endTime ?? current.endTime ?? undefined,
      }
      const overlap = await findOverlappingEvent(merged, eventId)
      if (overlap) {
        return c.json({
          error: 'На это время уже запланировано другое мероприятие в этом пространстве',
          conflict: { id: overlap.id, title: overlap.title, startTime: overlap.startTime, endTime: overlap.endTime },
        }, 409)
      }
    }
  }

  const [prev] = await db.select().from(events).where(eq(events.id, eventId))
  if (!prev) return c.json({ error: 'Not found' }, 404)

  const update: Record<string, any> = { ...body }
  if (body.fixedAmount !== undefined) update.fixedAmount = body.fixedAmount != null ? String(body.fixedAmount) : null
  if (body.perHeadAmount !== undefined) update.perHeadAmount = body.perHeadAmount != null ? String(body.perHeadAmount) : null
  if (body.manualAmount !== undefined) update.manualAmount = body.manualAmount != null ? String(body.manualAmount) : null

  // При финализации (completed/cancelled) приводим attendeesCount к фактическому
  // числу привязанных чеков.
  if (body.status === 'completed' || body.status === 'cancelled') {
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(checks)
      .where(eq(checks.linkedEventId, eventId))
    update.attendeesCount = cnt
  }

  let event
  try {
    event = await db.transaction(async (tx) => {
    // Слитое состояние события после апдейта — для расчёта базы чека.
    const merged = { ...prev, ...update }

    // 1) СТАРТ события: переход planned→active создаёт чек (если ещё не создан).
    const becomingActive = body.status === 'active' && prev.status !== 'active'
    if (becomingActive && !prev.checkId) {
      const shift = await getCurrentShift()
      if (!shift) throw new Error('NO_SHIFT')
      const isHourly = merged.billingMode === 'hourly' && merged.spaceId
      const base = eventBaseAmount(merged as any)
      const [chk] = await tx.insert(checks).values({
        staffId: (merged.responsibleStaffId as string) ?? user.sub,
        shiftId: shift.id,
        status: 'open',
        linkedEventId: eventId,
        // hourly+зона → почасовая аренда (как обычный аренда-чек); иначе база события.
        spaceId: isHourly ? (merged.spaceId as string) : null,
        spaceStartAt: isHourly ? new Date() : null,
        eventBaseAmount: isHourly ? null : String(base),
        guestNames: merged.title ? [merged.title as string] : [],
        note: `Мероприятие: ${merged.title ?? ''}`.trim(),
        totalAmount: '0',
      }).returning()
      update.checkId = chk!.id
      update.attendeesCount = 1
    }

    // 2) СИНК суммы: если у активного события поменялась база (сумма/режим/тип) —
    //    обновляем eventBaseAmount его чека (не для hourly — там платим арендой).
    const checkId = (update.checkId as string) ?? prev.checkId
    if (checkId && !becomingActive) {
      const amountTouched = body.manualAmount !== undefined || body.fixedAmount !== undefined
        || body.billingMode !== undefined || body.paymentType !== undefined
      if (amountTouched && merged.billingMode !== 'hourly') {
        await tx.update(checks)
          .set({ eventBaseAmount: String(eventBaseAmount(merged as any)) })
          .where(and(eq(checks.id, checkId), eq(checks.status, 'open')))
      }
    }

    // 3) ОТМЕНА события → отменяем его открытый чек.
    if (body.status === 'cancelled' && prev.checkId) {
      await tx.update(checks).set({ status: 'cancelled' })
        .where(and(eq(checks.id, prev.checkId), eq(checks.status, 'open')))
    }

    const [ev] = await tx.update(events).set(update).where(eq(events.id, eventId)).returning()
    return ev
    })
  } catch (err: any) {
    if (err?.message === 'NO_SHIFT') {
      return c.json({ error: 'Нет открытой смены — нельзя начать мероприятие (создать чек)' }, 400)
    }
    throw err
  }

  if (!event) return c.json({ error: 'Not found' }, 404)
  return c.json({ event })
})

eventsRouter.delete('/:id', requireRole('owner'), async (c) => {
  await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, c.req.param('id')))
  return c.json({ ok: true })
})

// ── Аналитика по событию ───────────────────────────────────────────────
eventsRouter.get('/:id/analytics', requireRole('owner', 'staff'), async (c) => {
  const eventId = c.req.param('id')
  const [event] = await db.select().from(events).where(eq(events.id, eventId))
  if (!event) return c.json({ error: 'Not found' }, 404)

  // Все чеки, привязанные к событию
  const eventChecks = await db
    .select()
    .from(checks)
    .where(eq(checks.linkedEventId, eventId))

  const closedChecks = eventChecks.filter((c) => c.status === 'closed')
  const totalRevenue = closedChecks.reduce((s, c) => s + parseFloat(c.totalAmount), 0)
  const attendeesCount = eventChecks.length
  const avgCheckAmount = closedChecks.length > 0 ? totalRevenue / closedChecks.length : 0

  // Топ-5 позиций
  const topItemsRows = await db.execute(sql`
    SELECT
      ci.item_id,
      i.name,
      SUM(ci.quantity) AS qty,
      SUM(ci.quantity * ci.price_at_time::numeric) AS revenue
    FROM check_items ci
    JOIN checks ch ON ch.id = ci.check_id
    JOIN inventory i ON i.id = ci.item_id
    WHERE ch.linked_event_id = ${eventId}
    GROUP BY ci.item_id, i.name
    ORDER BY revenue DESC
    LIMIT 5
  `)
  const topItems = ((topItemsRows as any).rows ?? topItemsRows ?? []).map((r: any) => ({
    itemId: r.item_id,
    name: r.name,
    qty: parseInt(String(r.qty ?? 0)),
    revenue: parseFloat(String(r.revenue ?? 0)),
  }))

  // Раскладка по методам оплаты
  const paymentBreakdownRows = await db.execute(sql`
    SELECT cp.method, SUM(cp.amount::numeric) AS total
    FROM check_payments cp
    JOIN checks ch ON ch.id = cp.check_id
    WHERE ch.linked_event_id = ${eventId}
    GROUP BY cp.method
  `)
  const paymentBreakdown: Record<string, number> = {}
  for (const r of ((paymentBreakdownRows as any).rows ?? paymentBreakdownRows ?? [])) {
    paymentBreakdown[r.method as string] = parseFloat(String(r.total ?? 0))
  }

  // Длительность в минутах
  let durationMinutes: number | null = null
  if (event.endTime) {
    const [sh, sm] = event.startTime.split(':').map(Number)
    const [eh, em] = event.endTime.split(':').map(Number)
    durationMinutes = (eh! * 60 + em!) - (sh! * 60 + sm!)
    if (durationMinutes < 0) durationMinutes += 24 * 60
  }

  return c.json({
    eventId,
    totalRevenue,
    attendeesCount,
    avgCheckAmount,
    topItems,
    paymentBreakdown,
    durationMinutes,
    maxGuests: event.maxGuests,
  })
})
