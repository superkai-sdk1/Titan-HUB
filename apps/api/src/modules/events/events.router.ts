import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { Database } from '@titan/database'
import {
  events, eventHourlyRates, eventParticipants, checks, checkItems, checkPayments, inventory, customers, expenses, profiles,
  eq, and, gte, lte, desc, sql, or, ne, isNull, inArray,
} from '@titan/database'

// Хелперы вызываются и вне транзакции (db = c.var.db), и внутри db.transaction
// (tx). Поверхность query-builder совпадает — принимаем оба.
type DbOrTx = Database | Parameters<Parameters<Database['transaction']>[0]>[0]
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'
import { notify } from '../notifications/push.js'

const num = (v: unknown) => { const n = parseFloat(String(v ?? '0')); return Number.isFinite(n) ? n : 0 }

// Расходы миникапа (приз/обед/иные) → строки expenses с привязкой к событию.
// Апсерт по idempotencyKey, чтобы редактирование не плодило дубликаты; 0 → удалить.
async function upsertEventCosts(exec: any, ev: { id: string; title: string | null; date: string; prizeFund: unknown; lunchCost: unknown; otherCost: unknown; createdBy: string }) {
  const buckets: [string, string, number][] = [
    ['prize', 'Призовой фонд', num(ev.prizeFund)],
    ['lunch', 'Обед', num(ev.lunchCost)],
    ['other', 'Иные расходы', num(ev.otherCost)],
  ]
  const label = ev.title ? ` «${ev.title}»` : ''
  for (const [key, name, amount] of buckets) {
    const idem = `minicap:${ev.id}:${key}`
    if (amount > 0) {
      await exec.insert(expenses).values({
        idempotencyKey: idem, category: 'other', amount: String(amount),
        description: `Миникап${label}: ${name}`, expenseDate: ev.date, eventId: ev.id, createdBy: ev.createdBy,
      }).onConflictDoUpdate({
        target: expenses.idempotencyKey,
        set: { amount: String(amount), description: `Миникап${label}: ${name}`, expenseDate: ev.date, eventId: ev.id },
      })
    } else {
      await exec.delete(expenses).where(eq(expenses.idempotencyKey, idem))
    }
  }
}

// Открыть индивидуальный чек участнику миникапа: игроку база = взнос; судье = 0
// (бар платит). prepaid_amount = взнос, если отмечена предоплата.
async function openParticipantCheck(exec: any, ev: any, p: any, shiftId: string, staffId: string): Promise<string> {
  const isJudge = p.role === 'judge'
  const fee = isJudge ? 0 : num(ev.participationFee)
  const prepaid = (!isJudge && p.prepaid) ? fee : 0
  const [chk] = await exec.insert(checks).values({
    staffId, shiftId, status: 'open', playerId: p.profileId,
    linkedEventId: ev.id, eventBaseAmount: String(fee), prepaidAmount: String(prepaid),
    note: `Миникап${ev.title ? ' «' + ev.title + '»' : ''}${isJudge ? ' · судья' : ''}`,
    totalAmount: '0',
  }).returning()
  await exec.update(eventParticipants).set({ checkId: chk!.id }).where(eq(eventParticipants.id, p.id))
  return chk!.id
}

const EventSchema = z.object({
  type: z.enum(['titan', 'exit']).default('titan'),
  title: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  spaceId: z.string().uuid().optional().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  paymentType: z.enum(['fixed', 'free']).default('fixed'),
  // amount = «Фикс» (ручная сумма fixedAmount), hourly = «Почасовая» (plannedHours → тариф).
  billingMode: z.enum(['amount', 'hourly']).default('amount'),
  fixedAmount: z.number().optional().nullable(),
  manualAmount: z.number().optional().nullable(),
  plannedHours: z.number().int().min(1).max(24).optional().nullable(),
  maxGuests: z.number().int().positive().optional().nullable(),
  status: z.enum(['planned', 'needs_clarification', 'active', 'completed', 'cancelled']).default('planned'),
  comment: z.string().optional().nullable(),
  reminders: z.array(z.string()).default([]),
  responsibleStaffId: z.string().uuid().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  // Миникап: формат + взнос + расходы события.
  format: z.enum(['regular', 'minicap']).default('regular'),
  participationFee: z.number().optional().nullable(),
  prizeFund: z.number().optional().nullable(),
  lunchCost: z.number().optional().nullable(),
  otherCost: z.number().optional().nullable(),
})

// Базовая сумма события для чека. «Фикс» (amount) → ручная/фикс сумма; «Почасовая»
// (hourly) → цена тарифа event_hourly_rates по plannedHours (за весь период).
async function computeEventBase(database: DbOrTx, ev: {
  billingMode: string
  manualAmount: string | null; fixedAmount: string | null
  plannedHours: number | null
}): Promise<number> {
  if (ev.billingMode === 'hourly') {
    const h = ev.plannedHours ?? 0
    if (!h) return 0
    const [rate] = await database.select().from(eventHourlyRates).where(eq(eventHourlyRates.hours, h)).limit(1)
    return rate ? (parseFloat(String(rate.price)) || 0) : 0
  }
  if (ev.manualAmount != null) return parseFloat(ev.manualAmount) || 0
  if (ev.fixedAmount != null) return parseFloat(ev.fixedAmount) || 0
  return 0
}

export const eventsRouter = new Hono<AppEnv>()
eventsRouter.use('*', requireAuth)

// ── Утилита: проверка пересечения событий по пространству ────────────────
async function findOverlappingEvent(
  database: DbOrTx,
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

  const rows = await database.select().from(events).where(and(...(conditions as [any, ...any[]]))).limit(1)
  return rows[0] ?? null
}

eventsRouter.get('/', async (c) => {
  const db = c.var.db
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
  const db = c.var.db
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
  const db = c.var.db
  const user = c.get('user')
  const body = c.req.valid('json')

  // Защита от пересекающихся событий по одному пространству
  const overlap = await findOverlappingEvent(db, body)
  if (overlap) {
    return c.json({
      error: 'На это время уже запланировано другое мероприятие в этом пространстве',
      conflict: { id: overlap.id, title: overlap.title, startTime: overlap.startTime, endTime: overlap.endTime },
    }, 409)
  }

  const isMinicap = body.format === 'minicap'
  const [event] = await db.insert(events).values({
    // Миникап — это всегда TITAN (type titan, локация фиксирована).
    type: isMinicap ? 'titan' : body.type,
    title: body.title,
    location: isMinicap ? 'TITAN' : body.location,
    spaceId: isMinicap ? null : (body.spaceId ?? null),
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime ?? null,
    paymentType: body.paymentType,
    billingMode: body.billingMode,
    fixedAmount: body.fixedAmount != null ? String(body.fixedAmount) : null,
    manualAmount: body.manualAmount != null ? String(body.manualAmount) : null,
    plannedHours: body.plannedHours ?? null,
    maxGuests: body.maxGuests ?? null,
    status: body.status,
    comment: body.comment,
    reminders: body.reminders,
    responsibleStaffId: body.responsibleStaffId ?? null,
    customerName: body.customerName ?? null,
    customerPhone: body.customerPhone ?? null,
    format: body.format,
    participationFee: body.participationFee != null ? String(body.participationFee) : null,
    prizeFund: body.prizeFund != null ? String(body.prizeFund) : null,
    lunchCost: body.lunchCost != null ? String(body.lunchCost) : null,
    otherCost: body.otherCost != null ? String(body.otherCost) : null,
    createdBy: user.sub,
  }).returning()

  // Расходы миникапа сразу материализуем в expenses (привязка к событию).
  if (isMinicap && event) {
    try { await upsertEventCosts(db, { ...event, createdBy: user.sub }) } catch { /* non-fatal */ }
  }

  // Автосохранение заказчика в справочник (для автоподбора в следующих событиях).
  // Не блокирует создание события — любые ошибки гасим.
  if (body.customerName || body.customerPhone) {
    try {
      let exists = false
      if (body.customerPhone) {
        const found = await db.select().from(customers).where(eq(customers.phone, body.customerPhone)).limit(1)
        exists = found.length > 0
      }
      if (!exists) {
        await db.insert(customers).values({ name: body.customerName ?? null, phone: body.customerPhone ?? null })
      }
    } catch { /* non-fatal */ }
  }

  void notify({
    type: 'event_created',
    title: 'Мероприятие',
    body: event!.title ?? `${event!.date} ${event!.startTime}`.trim(),
    meta: { eventId: event!.id },
  }, db).catch(() => {})

  return c.json({ event }, 201)
})

eventsRouter.get('/:id', async (c) => {
  const db = c.var.db
  const [event] = await db.select().from(events).where(eq(events.id, c.req.param('id')))
  if (!event) return c.json({ error: 'Not found' }, 404)
  return c.json({ event })
})

eventsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', EventSchema.partial()), async (c) => {
  const db = c.var.db
  const user = c.get('user')
  const eventId = c.req.param('id')
  const body = c.req.valid('json')

  // Если меняется время/пространство — проверить пересечение.
  // Сравниваем с undefined (а не truthiness): очистка endTime в null — это тоже
  // изменение времени и должно перезапускать проверку пересечений.
  if (body.spaceId !== undefined || body.startTime !== undefined || body.endTime !== undefined || body.date !== undefined) {
    const [current] = await db.select().from(events).where(eq(events.id, eventId))
    if (current) {
      const merged = {
        type: body.type ?? current.type,
        spaceId: body.spaceId ?? current.spaceId ?? undefined,
        date: body.date ?? current.date,
        startTime: body.startTime ?? current.startTime,
        endTime: body.endTime ?? current.endTime ?? undefined,
      }
      const overlap = await findOverlappingEvent(db, merged, eventId)
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
  if (body.manualAmount !== undefined) update.manualAmount = body.manualAmount != null ? String(body.manualAmount) : null
  if (body.participationFee !== undefined) update.participationFee = body.participationFee != null ? String(body.participationFee) : null
  if (body.prizeFund !== undefined) update.prizeFund = body.prizeFund != null ? String(body.prizeFund) : null
  if (body.lunchCost !== undefined) update.lunchCost = body.lunchCost != null ? String(body.lunchCost) : null
  if (body.otherCost !== undefined) update.otherCost = body.otherCost != null ? String(body.otherCost) : null

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

    const isMinicap = (merged.format ?? 'regular') === 'minicap'

    // 1) СТАРТ события: переход planned→active создаёт чек(и).
    const becomingActive = body.status === 'active' && prev.status !== 'active'
    if (becomingActive && isMinicap) {
      // Миникап: открываем по индивидуальному чеку каждому участнику (игроки + судья).
      const shift = await getCurrentShift(db)
      if (!shift) throw new Error('NO_SHIFT')
      const parts = await tx.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId))
      for (const p of parts) { if (!p.checkId) await openParticipantCheck(tx, merged, p, shift.id, user.sub) }
      update.attendeesCount = parts.filter((p: any) => p.role === 'player').length
    } else if (becomingActive && !prev.checkId) {
      const shift = await getCurrentShift(db)
      if (!shift) throw new Error('NO_SHIFT')
      // База события (фикс-сумма или цена почасового тарифа по plannedHours) кладётся
      // в eventBaseAmount чека для ОБОИХ режимов — без отдельной аренды зоны.
      const base = await computeEventBase(tx, merged as any)
      const [chk] = await tx.insert(checks).values({
        staffId: (merged.responsibleStaffId as string) ?? user.sub,
        shiftId: shift.id,
        status: 'open',
        linkedEventId: eventId,
        spaceId: null,
        spaceStartAt: null,
        eventBaseAmount: String(base),
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
        || body.billingMode !== undefined || body.paymentType !== undefined || body.plannedHours !== undefined
      if (amountTouched) {
        await tx.update(checks)
          .set({ eventBaseAmount: String(await computeEventBase(tx, merged as any)) })
          .where(and(eq(checks.id, checkId), eq(checks.status, 'open')))
      }
    }

    // 2b) МИНИКАП: синк взноса на открытых чеках игроков + апсерт расходов события.
    if (isMinicap) {
      if (!becomingActive && body.participationFee !== undefined) {
        const players = await tx.select().from(eventParticipants)
          .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.role, 'player')))
        const fee = num(merged.participationFee)
        for (const p of players) {
          if (!p.checkId) continue
          await tx.update(checks)
            .set({ eventBaseAmount: String(fee), prepaidAmount: String(p.prepaid ? fee : 0) })
            .where(and(eq(checks.id, p.checkId), eq(checks.status, 'open')))
        }
      }
      const costsTouched = body.prizeFund !== undefined || body.lunchCost !== undefined
        || body.otherCost !== undefined || body.date !== undefined || body.title !== undefined
      if (costsTouched) {
        await upsertEventCosts(tx, { id: eventId, title: (merged.title as string) ?? null, date: merged.date as string, prizeFund: merged.prizeFund, lunchCost: merged.lunchCost, otherCost: merged.otherCost, createdBy: user.sub })
      }
    }

    // 3) ОТМЕНА события → отменяем открытые чеки (миникап — все чеки участников).
    if (body.status === 'cancelled' && isMinicap) {
      const parts = await tx.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId))
      const ids = parts.map((p: any) => p.checkId).filter(Boolean) as string[]
      if (ids.length) await tx.update(checks).set({ status: 'cancelled' }).where(and(inArray(checks.id, ids), eq(checks.status, 'open')))
    } else if (body.status === 'cancelled' && prev.checkId) {
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

  // Завершение мероприятия вручную (переход в 'completed') → уведомление.
  if (body.status === 'completed' && prev.status !== 'completed') {
    void notify({
      type: 'event_completed',
      title: 'Мероприятие завершено',
      body: event.title ?? `${event.date} ${event.startTime}`.trim(),
      meta: { eventId: event.id },
    }, db).catch(() => {})
  }

  return c.json({ event })
})

eventsRouter.delete('/:id', requireRole('owner'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  // ?purge=true — ЖЁСТКОЕ удаление навсегда (участники + связанная бронь + событие).
  // Без флага — мягкая отмена (status=cancelled, событие остаётся в истории).
  if (c.req.query('purge') === 'true') {
    await db.delete(eventParticipants).where(eq(eventParticipants.eventId, id))
    await db.execute(sql`DELETE FROM bookings WHERE event_id = ${id}`)
    await db.delete(events).where(eq(events.id, id))
    return c.json({ ok: true, purged: true })
  }
  await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, id))
  return c.json({ ok: true })
})

// ── Участники миникапа ──────────────────────────────────────────────────
eventsRouter.get('/:id/participants', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const eventId = c.req.param('id')
  const rows = await db
    .select({
      id: eventParticipants.id,
      profileId: eventParticipants.profileId,
      nickname: profiles.nickname,
      clientTier: profiles.clientTier,
      role: eventParticipants.role,
      prepaid: eventParticipants.prepaid,
      checkId: eventParticipants.checkId,
      checkStatus: checks.status,
      checkTotal: checks.totalAmount,
      eventBaseAmount: checks.eventBaseAmount,
      prepaidAmount: checks.prepaidAmount,
    })
    .from(eventParticipants)
    .leftJoin(profiles, eq(profiles.id, eventParticipants.profileId))
    .leftJoin(checks, eq(checks.id, eventParticipants.checkId))
    .where(eq(eventParticipants.eventId, eventId))
    .orderBy(eventParticipants.createdAt)
  return c.json({ participants: rows })
})

const AddParticipantSchema = z.object({ profileId: z.string().uuid(), role: z.enum(['player', 'judge']).default('player') })
eventsRouter.post('/:id/participants', requireRole('owner', 'staff'), zValidator('json', AddParticipantSchema), async (c) => {
  const db = c.var.db
  const user = c.get('user')
  const eventId = c.req.param('id')
  const { profileId, role } = c.req.valid('json')
  const [ev] = await db.select().from(events).where(eq(events.id, eventId))
  if (!ev) return c.json({ error: 'Not found' }, 404)
  const existing = await db.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId))
  if (role === 'player' && existing.filter(p => p.role === 'player').length >= 10) return c.json({ error: 'Максимум 10 игроков' }, 400)
  if (role === 'judge' && existing.some(p => p.role === 'judge')) return c.json({ error: 'Судья уже назначен' }, 400)
  const [p] = await db.insert(eventParticipants).values({ eventId, profileId, role }).onConflictDoNothing().returning()
  if (!p) return c.json({ error: 'Этот игрок уже в составе' }, 409)
  // Миникап уже идёт — сразу открываем чек новому участнику.
  if (ev.status === 'active') {
    const shift = await getCurrentShift(db)
    if (shift) { try { await openParticipantCheck(db, ev, p, shift.id, user.sub) } catch { /* non-fatal */ } }
  }
  return c.json({ participant: p }, 201)
})

const PatchParticipantSchema = z.object({ prepaid: z.boolean() })
eventsRouter.patch('/:id/participants/:pid', requireRole('owner', 'staff'), zValidator('json', PatchParticipantSchema), async (c) => {
  const db = c.var.db
  const eventId = c.req.param('id')
  const pid = c.req.param('pid')
  const { prepaid } = c.req.valid('json')
  const [p] = await db.select().from(eventParticipants).where(and(eq(eventParticipants.id, pid), eq(eventParticipants.eventId, eventId)))
  if (!p) return c.json({ error: 'Not found' }, 404)
  const [ev] = await db.select().from(events).where(eq(events.id, eventId))
  await db.update(eventParticipants).set({ prepaid }).where(eq(eventParticipants.id, pid))
  // Синк предоплаты на открытом чеке игрока (судья — без взноса).
  if (p.checkId && p.role === 'player') {
    const fee = num(ev?.participationFee)
    await db.update(checks).set({ prepaidAmount: String(prepaid ? fee : 0) }).where(and(eq(checks.id, p.checkId), eq(checks.status, 'open')))
  }
  return c.json({ ok: true })
})

eventsRouter.delete('/:id/participants/:pid', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const eventId = c.req.param('id')
  const pid = c.req.param('pid')
  const [p] = await db.select().from(eventParticipants).where(and(eq(eventParticipants.id, pid), eq(eventParticipants.eventId, eventId)))
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (p.checkId) {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(checkItems).where(eq(checkItems.checkId, p.checkId))
    if (cnt > 0) return c.json({ error: 'У участника есть позиции в чеке — сначала закройте чек' }, 400)
    await db.update(checks).set({ status: 'cancelled' }).where(and(eq(checks.id, p.checkId), eq(checks.status, 'open')))
  }
  await db.delete(eventParticipants).where(eq(eventParticipants.id, pid))
  return c.json({ ok: true })
})

// ── Аналитика по событию ───────────────────────────────────────────────
eventsRouter.get('/:id/analytics', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
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

  // Расходы события (приз/обед/иные и пр. с привязкой) → нетто по мероприятию.
  const costRows = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses).where(eq(expenses.eventId, eventId))
  const costs = parseFloat(String(costRows[0]?.total ?? '0')) || 0

  // Длительность в минутах
  let durationMinutes: number | null = null
  if (event.endTime) {
    const [sh, sm] = event.startTime.split(':').map(Number)
    const [eh, em] = event.endTime.split(':').map(Number)
    durationMinutes = (eh! * 60 + em!) - (sh! * 60 + sm!)
    if (durationMinutes < 0) durationMinutes += 24 * 60
  }

  return c.json({
    costs,
    net: totalRevenue - costs,
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
