import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, events, checks, checkItems, checkPayments, inventory,
  eq, and, gte, lte, desc, sql, or, ne,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const EventSchema = z.object({
  type: z.enum(['titan', 'exit']).default('titan'),
  title: z.string().optional(),
  location: z.string().optional(),
  spaceId: z.string().uuid().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  paymentType: z.enum(['fixed', 'per_head', 'free']).default('fixed'),
  fixedAmount: z.number().optional(),
  perHeadAmount: z.number().optional(),
  maxGuests: z.number().int().positive().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'),
  comment: z.string().optional(),
  reminders: z.array(z.string()).default([]),
})

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
    spaceId: body.spaceId,
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    paymentType: body.paymentType,
    fixedAmount: body.fixedAmount != null ? String(body.fixedAmount) : null,
    perHeadAmount: body.perHeadAmount != null ? String(body.perHeadAmount) : null,
    maxGuests: body.maxGuests ?? null,
    status: body.status,
    comment: body.comment,
    reminders: body.reminders,
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

  const update: Record<string, any> = { ...body }
  if (body.fixedAmount !== undefined) update.fixedAmount = body.fixedAmount != null ? String(body.fixedAmount) : null
  if (body.perHeadAmount !== undefined) update.perHeadAmount = body.perHeadAmount != null ? String(body.perHeadAmount) : null

  // При финализации (completed/cancelled) приводим attendeesCount к фактическому
  // числу привязанных чеков — иначе сохранённое поле расходится со значением,
  // которое аналитика считает «на лету» (eventChecks.length).
  if (body.status === 'completed' || body.status === 'cancelled') {
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(checks)
      .where(eq(checks.linkedEventId, eventId))
    update.attendeesCount = cnt
  }

  const [event] = await db.update(events).set(update).where(eq(events.id, eventId)).returning()
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
