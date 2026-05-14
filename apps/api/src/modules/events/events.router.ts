import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, events, eq, and, gte, lte, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const EventSchema = z.object({
  type: z.enum(['titan', 'exit']).default('titan'),
  location: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  paymentType: z.enum(['fixed', 'hourly']).default('fixed'),
  fixedAmount: z.number().optional(),
  hourlyRate: z.number().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'),
  comment: z.string().optional(),
  reminders: z.array(z.string()).default([]),
  checkId: z.string().uuid().optional(),
})

export const eventsRouter = new Hono<AppEnv>()
eventsRouter.use('*', requireAuth)

eventsRouter.get('/', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  const conditions = []
  if (from) conditions.push(gte(events.date, from))
  if (to) conditions.push(lte(events.date, to))

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...(conditions as [any, ...any[]])) : undefined)
    .orderBy(desc(events.date), desc(events.startTime))

  return c.json({ events: rows })
})

eventsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', EventSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [event] = await db.insert(events).values({
    ...body,
    fixedAmount: body.fixedAmount != null ? String(body.fixedAmount) : null,
    hourlyRate: body.hourlyRate != null ? String(body.hourlyRate) : null,
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
  const body = c.req.valid('json')
  const update: Record<string, any> = { ...body }
  if (body.fixedAmount !== undefined) update.fixedAmount = String(body.fixedAmount)
  if (body.hourlyRate !== undefined) update.hourlyRate = String(body.hourlyRate)
  const [event] = await db.update(events).set(update).where(eq(events.id, c.req.param('id'))).returning()
  if (!event) return c.json({ error: 'Not found' }, 404)
  return c.json({ event })
})

eventsRouter.delete('/:id', requireRole('owner'), async (c) => {
  await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, c.req.param('id')))
  return c.json({ ok: true })
})
