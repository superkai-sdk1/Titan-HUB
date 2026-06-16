/**
 * Онлайн-бронирование зон — клиентский конструктор мероприятия.
 *
 * Публичная сторона (без авторизации, ДО requireActiveSubscription): /config —
 * данные виджета (локации, кабинки+ставка, тарифы по часам); POST / — заявка с
 * выдачей claim_token (узнавание клиента); GET/PATCH /:token — статус и правки по
 * токену без авторизации (токен = секрет в localStorage гостя). Внутренняя (auth):
 * список + смена статуса; подтверждение создаёт planned-мероприятие (titan/exit,
 * кабинка, плановые часы) и пишет event_id.
 *
 * Таблица bookings — raw SQL; мероприятия/справочники — drizzle.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { sql, events, spaces, appSettings, eventHourlyRates, profiles, customers, eq, and, isNull, inArray, asc } from '@titan/database'
import type { AppEnv } from '../../types.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { notify } from '../notifications/push.js'

function rows<T = Record<string, unknown>>(res: unknown): T[] {
  return ((res as { rows?: unknown[] }).rows ?? (res as unknown[])) as T[]
}
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h! * 60 + m!) + Math.round(hours * 60)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
// timestamptz → дата/время в МСК.
function mskParts(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000)
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }
}

// ─── Публичный роутер (без авторизации) ──────────────────────────────────────
export const bookingsPublicRouter = new Hono<AppEnv>()

bookingsPublicRouter.get('/config', async (c) => {
  const db = c.var.db
  const sx = await db.select().from(appSettings)
    .where(inArray(appSettings.key, ['booking_enabled', 'venue_name', 'venue_address', 'hours_open', 'hours_close']))
  const m = Object.fromEntries(sx.map((r) => [r.key, r.value]))
  if (m['booking_enabled'] !== 'true') return c.json({ enabled: false })

  const cabins = await db.select({ id: spaces.id, name: spaces.name, capacity: spaces.capacity, hourlyRate: spaces.hourlyRate })
    .from(spaces).where(eq(spaces.isActive, true))
  const tariffs = await db.select({ hours: eventHourlyRates.hours, price: eventHourlyRates.price })
    .from(eventHourlyRates).orderBy(asc(eventHourlyRates.hours))

  return c.json({
    enabled: true,
    clubName: m['venue_name'] || 'Titan',
    venueAddress: m['venue_address'] || '',
    hoursOpen: m['hours_open'] || '',
    hoursClose: m['hours_close'] || '',
    cabins,
    tariffs,
  })
})

// Узнавание клиента по номеру телефона: возвращает его брони (по цифрам, последние
// 10 — без привязки к устройству). Регистрируется ДО /:token, чтобы не перехватился.
bookingsPublicRouter.get('/lookup', async (c) => {
  const db = c.var.db
  const tail = (c.req.query('phone') || '').replace(/\D/g, '').slice(-10)
  if (tail.length < 10) return c.json({ bookings: [] })
  const res = await db.execute(sql`
    SELECT b.id, b.status, b.location, b.address, b.title, s.name AS zone_name, b.tariff_hours, b.guests,
           b.starts_at, b.name, b.phone, b.comment, b.created_at, b.claim_token, e.status AS event_status
    FROM bookings b
    LEFT JOIN spaces s ON s.id = b.space_id
    LEFT JOIN events e ON e.id = b.event_id
    WHERE right(regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g'), 10) = ${tail}
    ORDER BY b.starts_at DESC
    LIMIT 20
  `)
  return c.json({ bookings: rows(res) })
})

const CreateSchema = z.object({
  location: z.enum(['titan', 'exit']),
  title: z.string().max(160).optional(),
  address: z.string().max(300).optional(),
  spaceId: z.string().uuid().optional(),
  tariffHours: z.number().int().min(1).max(24).optional(),
  guests: z.number().int().min(1).max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().min(1).max(120),
  phone: z.string().min(5).max(30),
  comment: z.string().max(500).optional(),
})

bookingsPublicRouter.post('/', zValidator('json', CreateSchema), async (c) => {
  const db = c.var.db
  const [en] = await db.select().from(appSettings).where(eq(appSettings.key, 'booking_enabled')).limit(1)
  if (en?.value !== 'true') return c.json({ error: 'Бронирование отключено' }, 403)
  const b = c.req.valid('json')
  const startsAt = `${b.date}T${b.time}:00+03:00`
  const token = randomUUID()

  const res = await db.execute(sql`
    INSERT INTO bookings (space_id, name, phone, guests, starts_at, duration_hours, comment, status, source, location, address, tariff_hours, claim_token, title)
    VALUES (${b.spaceId ?? null}, ${b.name}, ${b.phone}, ${b.guests ?? null}, ${startsAt}::timestamptz,
            ${b.tariffHours ?? null}, ${b.comment ?? null}, 'new', 'widget',
            ${b.location}, ${b.location === 'exit' ? (b.address ?? null) : null}, ${b.tariffHours ?? null}, ${token}, ${b.title ?? null})
    RETURNING id
  `)
  const id = rows<{ id: string }>(res)[0]?.id

  // Выезд = заказчик мероприятия: сохраняем имя+телефон в справочник «Заказчики».
  // Дедуп по ЦИФРАМ номера (последние 10) — устойчиво к формату и префиксу 8/+7,
  // чтобы тот же телефон в другом написании не плодил дубль. Не валит ответ гостю.
  if (b.location === 'exit' && b.phone) {
    try {
      const tail = b.phone.replace(/\D/g, '').slice(-10)
      let exists = false
      if (tail.length >= 10) {
        const found = await db.execute(sql`
          SELECT id FROM customers
          WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${tail}
          LIMIT 1
        `)
        exists = rows(found).length > 0
      }
      if (!exists) await db.insert(customers).values({ name: b.name ?? null, phone: b.phone })
    } catch { /* non-fatal */ }
  }

  try {
    const owners = await db.select({ id: profiles.id }).from(profiles)
      .where(and(eq(profiles.role, 'owner'), isNull(profiles.deletedAt)))
    const where = b.location === 'exit' ? 'выезд' : 'Штаб'
    const body = `${b.title ? b.title + ' · ' : ''}${b.name} · ${where} · ${b.date} ${b.time}${b.guests ? ` · ${b.guests} гост.` : ''}`
    for (const o of owners) {
      await notify({ type: 'booking', title: '🗓️ Новая бронь', body, meta: { bookingId: id, url: '/events' }, userId: o.id }, db, c.var.club?.id)
    }
  } catch { /* non-fatal */ }

  return c.json({ ok: true, id, token })
})

// Статус брони по токену (узнавание клиента, без авторизации).
bookingsPublicRouter.get('/:token', async (c) => {
  const db = c.var.db
  const token = c.req.param('token')
  const res = await db.execute(sql`
    SELECT b.id, b.status, b.location, b.address, b.title, s.name AS zone_name, b.tariff_hours, b.guests,
           b.starts_at, b.name, b.phone, b.comment, b.created_at, e.status AS event_status
    FROM bookings b
    LEFT JOIN spaces s ON s.id = b.space_id
    LEFT JOIN events e ON e.id = b.event_id
    WHERE b.claim_token = ${token} LIMIT 1
  `)
  const bk = rows(res)[0]
  if (!bk) return c.json({ error: 'not found' }, 404)
  return c.json({ booking: bk })
})

const PublicPatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  guests: z.number().int().min(1).max(500).nullable().optional(),
  tariffHours: z.number().int().min(1).max(24).nullable().optional(),
  address: z.string().max(300).optional(),
  comment: z.string().max(500).optional(),
  cancel: z.boolean().optional(),
})

// Правка/отмена брони гостем по токену — пока статус 'new'.
bookingsPublicRouter.patch('/:token', zValidator('json', PublicPatchSchema), async (c) => {
  const db = c.var.db
  const token = c.req.param('token')
  const b = c.req.valid('json')
  const res = await db.execute(sql`SELECT * FROM bookings WHERE claim_token = ${token} LIMIT 1`)
  const bk = rows<Record<string, unknown>>(res)[0]
  if (!bk) return c.json({ error: 'not found' }, 404)
  if (bk['status'] !== 'new') return c.json({ error: 'Бронь уже обработана — правки недоступны' }, 409)

  if (b.cancel) {
    await db.execute(sql`UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE claim_token = ${token}`)
    return c.json({ ok: true, status: 'cancelled' })
  }

  const cur = mskParts(bk['starts_at'] as string)
  const date = b.date ?? cur.date
  const time = b.time ?? cur.time
  const startsAt = `${date}T${time}:00+03:00`

  await db.execute(sql`
    UPDATE bookings SET
      starts_at = ${startsAt}::timestamptz,
      guests = ${b.guests !== undefined ? b.guests : (bk['guests'] as number | null)},
      tariff_hours = ${b.tariffHours !== undefined ? b.tariffHours : (bk['tariff_hours'] as number | null)},
      duration_hours = ${b.tariffHours !== undefined ? b.tariffHours : (bk['duration_hours'] as number | null)},
      address = ${b.address !== undefined ? b.address : (bk['address'] as string | null)},
      comment = ${b.comment !== undefined ? b.comment : (bk['comment'] as string | null)},
      updated_at = now()
    WHERE claim_token = ${token}
  `)
  return c.json({ ok: true })
})

// ─── Внутренний роутер (авторизация) ─────────────────────────────────────────
export const bookingsRouter = new Hono<AppEnv>()
bookingsRouter.use('*', requireAuth)

bookingsRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const status = c.req.query('status')
  const res = await db.execute(sql`
    SELECT b.id, b.space_id, s.name AS zone_name, b.name, b.phone, b.guests, b.title,
           b.starts_at, b.duration_hours, b.tariff_hours, b.location, b.address,
           b.comment, b.status, b.source, b.event_id, b.created_at
    FROM bookings b
    LEFT JOIN spaces s ON s.id = b.space_id
    ${status ? sql`WHERE b.status = ${status}` : sql``}
    ORDER BY b.starts_at DESC
    LIMIT 300
  `)
  return c.json({ bookings: rows(res) })
})

// «Старые брони» — брони пространств штаба, чьё мероприятие уже завершено (чек
// закрыт → событие completed). Для одноимённого раздела в «Мероприятиях».
bookingsRouter.get('/archive', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const res = await db.execute(sql`
    SELECT b.id, b.space_id, s.name AS zone_name, b.name, b.phone, b.guests, b.title,
           b.starts_at, b.tariff_hours, b.location, b.address, b.comment, b.status,
           b.event_id, e.status AS event_status, ch.total_amount AS check_total
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    LEFT JOIN spaces s ON s.id = b.space_id
    LEFT JOIN checks ch ON ch.id = e.check_id
    WHERE b.space_id IS NOT NULL AND b.location = 'titan' AND e.status = 'completed'
    ORDER BY b.starts_at DESC
    LIMIT 200
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

  let eventId = (bk['event_id'] as string | null) ?? null
  if (status === 'confirmed' && !eventId) {
    const { date, time } = mskParts(bk['starts_at'] as string)
    const hours = bk['tariff_hours'] != null ? Number(bk['tariff_hours']) : (bk['duration_hours'] != null ? Number(bk['duration_hours']) : 0)
    const endTime = hours > 0 ? addHours(time, hours) : null
    const isExit = bk['location'] === 'exit'
    const [ev] = await db.insert(events).values({
      type: isExit ? 'exit' : 'titan',
      title: (bk['title'] as string | null) || `Бронь: ${String(bk['name'])}`,
      location: isExit ? ((bk['address'] as string | null) ?? null) : 'TITAN',
      spaceId: (bk['space_id'] as string | null) ?? null,
      date,
      startTime: time,
      endTime,
      paymentType: 'fixed',
      billingMode: 'hourly',
      plannedHours: hours > 0 ? hours : null,
      status: 'planned',
      customerName: String(bk['name']),
      customerPhone: String(bk['phone']),
      comment: (bk['comment'] as string | null) ?? null,
      format: 'regular',
      createdBy: user.sub,
    }).returning()
    eventId = ev?.id ?? null
  }

  await db.execute(sql`UPDATE bookings SET status = ${status}, event_id = ${eventId}, updated_at = now() WHERE id = ${id}`)
  return c.json({ ok: true, status, eventId })
})
