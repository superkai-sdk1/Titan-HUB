/**
 * Онлайн-бронирование зон.
 *
 * Публичная сторона (без авторизации, монтируется ДО requireActiveSubscription, как
 * /api/pay): /config — настройки виджета (зоны, часы), POST / — создать бронь
 * (rate-limit глобальный на /api/*, валидация, гейт booking_enabled). Внутренняя
 * (auth): список + смена статуса; при подтверждении создаётся planned-мероприятие.
 *
 * Таблица bookings — через raw SQL (не в drizzle-схеме, как fiscal_receipts);
 * мероприятия — через drizzle (events).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sql, events, spaces, appSettings, profiles, eq, and, isNull, inArray } from '@titan/database'
import type { AppEnv } from '../../types.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { notify } from '../notifications/push.js'

function rows<T = Record<string, unknown>>(res: unknown): T[] {
  return ((res as { rows?: unknown[] }).rows ?? (res as unknown[])) as T[]
}

// HH:MM + часы → HH:MM (с переносом за полночь по модулю 24).
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h! * 60 + m!) + Math.round(hours * 60)
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

// ─── Публичный роутер (без авторизации) ──────────────────────────────────────
export const bookingsPublicRouter = new Hono<AppEnv>()

bookingsPublicRouter.get('/config', async (c) => {
  const db = c.var.db
  const sx = await db.select().from(appSettings)
    .where(inArray(appSettings.key, ['booking_enabled', 'venue_name', 'hours_open', 'hours_close']))
  const m = Object.fromEntries(sx.map((r) => [r.key, r.value]))
  if (m['booking_enabled'] !== 'true') return c.json({ enabled: false })
  const zones = await db.select({ id: spaces.id, name: spaces.name, capacity: spaces.capacity })
    .from(spaces).where(eq(spaces.isActive, true))
  return c.json({
    enabled: true,
    clubName: m['venue_name'] || 'Titan',
    hoursOpen: m['hours_open'] || '',
    hoursClose: m['hours_close'] || '',
    zones,
  })
})

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(5).max(30),
  guests: z.number().int().min(1).max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationHours: z.number().min(0.5).max(24).optional(),
  spaceId: z.string().uuid().optional(),
  comment: z.string().max(500).optional(),
})

bookingsPublicRouter.post('/', zValidator('json', CreateSchema), async (c) => {
  const db = c.var.db
  const [en] = await db.select().from(appSettings).where(eq(appSettings.key, 'booking_enabled')).limit(1)
  if (en?.value !== 'true') return c.json({ error: 'Бронирование отключено' }, 403)
  const b = c.req.valid('json')
  // Клуб в МСК (UTC+3); храним абсолютный момент в timestamptz.
  const startsAt = `${b.date}T${b.time}:00+03:00`

  const res = await db.execute(sql`
    INSERT INTO bookings (space_id, name, phone, guests, starts_at, duration_hours, comment, status, source)
    VALUES (${b.spaceId ?? null}, ${b.name}, ${b.phone}, ${b.guests ?? null}, ${startsAt}::timestamptz,
            ${b.durationHours ?? null}, ${b.comment ?? null}, 'new', 'widget')
    RETURNING id
  `)
  const id = rows<{ id: string }>(res)[0]?.id

  // Уведомление владельцам (не валит ответ гостю).
  try {
    const owners = await db.select({ id: profiles.id }).from(profiles)
      .where(and(eq(profiles.role, 'owner'), isNull(profiles.deletedAt)))
    const body = `${b.name} · ${b.date} ${b.time}${b.guests ? ` · ${b.guests} гост.` : ''}`
    for (const o of owners) {
      await notify({ type: 'booking', title: '🗓️ Новая бронь', body, meta: { bookingId: id, url: '/manage/bookings' }, userId: o.id }, db, c.var.club?.id)
    }
  } catch { /* non-fatal */ }

  return c.json({ ok: true, id })
})

// ─── Внутренний роутер (авторизация) ─────────────────────────────────────────
export const bookingsRouter = new Hono<AppEnv>()
bookingsRouter.use('*', requireAuth)

bookingsRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const status = c.req.query('status')
  const res = await db.execute(sql`
    SELECT b.id, b.space_id, s.name AS zone_name, b.name, b.phone, b.guests,
           b.starts_at, b.duration_hours, b.comment, b.status, b.source, b.event_id, b.created_at
    FROM bookings b
    LEFT JOIN spaces s ON s.id = b.space_id
    ${status ? sql`WHERE b.status = ${status}` : sql``}
    ORDER BY b.starts_at DESC
    LIMIT 300
  `)
  return c.json({ bookings: rows(res) })
})

const PatchSchema = z.object({ status: z.enum(['new', 'confirmed', 'cancelled', 'done']) })

bookingsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', PatchSchema), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const { status } = c.req.valid('json')
  const user = c.get('user')

  const res = await db.execute(sql`SELECT * FROM bookings WHERE id = ${id} LIMIT 1`)
  const bk = rows<Record<string, unknown>>(res)[0]
  if (!bk) return c.json({ error: 'not found' }, 404)

  // Подтверждение → создаём planned-мероприятие (один раз).
  let eventId = (bk['event_id'] as string | null) ?? null
  if (status === 'confirmed' && !eventId) {
    const startsAt = new Date(bk['starts_at'] as string)
    const msk = new Date(startsAt.getTime() + 3 * 3600 * 1000)
    const date = msk.toISOString().slice(0, 10)
    const time = msk.toISOString().slice(11, 16)
    const dur = bk['duration_hours'] != null ? Number(bk['duration_hours']) : 0
    const endTime = dur > 0 ? addHours(time, dur) : null
    const [ev] = await db.insert(events).values({
      type: 'titan',
      title: `Бронь: ${String(bk['name'])}`,
      spaceId: (bk['space_id'] as string | null) ?? null,
      date,
      startTime: time,
      endTime,
      paymentType: 'fixed',
      billingMode: 'amount',
      status: 'planned',
      customerName: String(bk['name']),
      customerPhone: String(bk['phone']),
      comment: (bk['comment'] as string | null) ?? null,
      format: 'regular',
      createdBy: user.sub,
    }).returning()
    eventId = ev?.id ?? null
  }

  await db.execute(sql`
    UPDATE bookings SET status = ${status}, event_id = ${eventId}, updated_at = now() WHERE id = ${id}
  `)
  return c.json({ ok: true, status, eventId })
})
