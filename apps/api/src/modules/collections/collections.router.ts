import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  collections, collectionPeriods, collectionContributions, collectionMembers,
  profiles, transactions,
  eq, and, inArray, sql, desc, asc, count, sum,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const collectionsRouter = new Hono<AppEnv>()
// Аутентификация для всех маршрутов раздела (как в clients): иначе requireRole
// читает user.role у несуществующего user → 500 вместо 401.
collectionsRouter.use('*', requireAuth)

// Взносы только у резидентов (клиенты с тиром resident/student/newbie; гость — нет).
const RESIDENT_TIERS = ['resident', 'student', 'newbie'] as const
const METHODS = ['cash', 'transfer', 'sbp', 'deposit', 'debt'] as const
const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

function mskNow() { return new Date(Date.now() + 3 * 3600 * 1000) }
function currentPeriodKey() { const d = mskNow(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
function periodLabel(key: string) {
  if (key === 'single') return 'Сбор'
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS_RU[(m || 1) - 1]} ${y}`
}
const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0

// Найти-или-создать период сбора (recurring → 'YYYY-MM', oneoff → 'single').
async function ensurePeriod(db: any, coll: any, periodKey: string) {
  const [existing] = await db.select().from(collectionPeriods)
    .where(and(eq(collectionPeriods.collectionId, coll.id), eq(collectionPeriods.periodKey, periodKey))).limit(1)
  if (existing) return existing
  await db.insert(collectionPeriods).values({
    collectionId: coll.id, periodKey, label: periodLabel(periodKey),
    amount: String(num(coll.defaultAmount)), status: 'open',
  }).onConflictDoNothing({ target: [collectionPeriods.collectionId, collectionPeriods.periodKey] })
  const [created] = await db.select().from(collectionPeriods)
    .where(and(eq(collectionPeriods.collectionId, coll.id), eq(collectionPeriods.periodKey, periodKey))).limit(1)
  return created
}

// ─── Список сборов ─────────────────────────────────────────────────────────────
collectionsRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const list = await db.select().from(collections)
    .where(eq(collections.isActive, true))
    .orderBy(desc(collections.isMandatory), asc(collections.createdAt))

  // Кол-во резидентов (общий знаменатель «оплатили X из Y»).
  const [{ cnt: eligibleCount }] = await db.select({ cnt: count() }).from(profiles)
    .where(and(eq(profiles.role, 'client'), inArray(profiles.clientTier, RESIDENT_TIERS as unknown as string[])))

  const curKey = currentPeriodKey()
  const ids = list.map((x: any) => x.id)
  // Текущие периоды (этот месяц для recurring / 'single' для oneoff) — без создания.
  const periods = ids.length
    ? await db.select().from(collectionPeriods)
        .where(and(inArray(collectionPeriods.collectionId, ids), inArray(collectionPeriods.periodKey, [curKey, 'single'])))
    : []
  const periodByColl = new Map<string, any>()
  for (const p of periods) {
    const coll = list.find((x: any) => x.id === p.collectionId)
    if (!coll) continue
    const want = coll.kind === 'oneoff' ? 'single' : curKey
    if (p.periodKey === want) periodByColl.set(p.collectionId, p)
  }
  const periodIds = [...periodByColl.values()].map((p: any) => p.id)
  const sums = periodIds.length
    ? await db.select({ periodId: collectionContributions.periodId, total: sum(collectionContributions.amount), cnt: count() })
        .from(collectionContributions).where(inArray(collectionContributions.periodId, periodIds))
        .groupBy(collectionContributions.periodId)
    : []
  const sumByPeriod = new Map(sums.map((s: any) => [s.periodId, { total: num(s.total), cnt: Number(s.cnt) }]))

  // Кол-во исключённых на сейчас (для знаменателя).
  const exRows = ids.length
    ? await db.select({ collectionId: collectionMembers.collectionId, cnt: count() }).from(collectionMembers)
        .where(and(inArray(collectionMembers.collectionId, ids),
          sql`(${collectionMembers.excludedForever} = true OR ${collectionMembers.excludedUntil} >= now())`))
        .groupBy(collectionMembers.collectionId)
    : []
  const exByColl = new Map(exRows.map((r: any) => [r.collectionId, Number(r.cnt)]))

  return c.json({
    eligibleCount: Number(eligibleCount),
    collections: list.map((x: any) => {
      const p = periodByColl.get(x.id)
      const s = p ? sumByPeriod.get(p.id) : undefined
      const excluded = exByColl.get(x.id) ?? 0
      return {
        id: x.id, name: x.name, description: x.description, kind: x.kind,
        isMandatory: x.isMandatory, defaultAmount: num(x.defaultAmount),
        period: p ? { id: p.id, key: p.periodKey, label: p.label, amount: num(p.amount) } : null,
        collected: s?.total ?? 0,
        paidCount: s?.cnt ?? 0,
        expectedCount: Math.max(0, Number(eligibleCount) - excluded),
      }
    }),
  })
})

// ─── Создание сбора ──────────────────────────────────────────────────────────
collectionsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  kind: z.enum(['recurring', 'oneoff']).default('recurring'),
  isMandatory: z.boolean().optional(),
  defaultAmount: z.number().min(0).default(0),
})), async (c) => {
  const db = c.var.db
  const b = c.req.valid('json')
  const user = c.get('user')
  const [created] = await db.insert(collections).values({
    name: b.name.trim(), description: b.description ?? null, kind: b.kind,
    isMandatory: b.isMandatory ?? (b.kind === 'recurring'),
    defaultAmount: String(b.defaultAmount), createdBy: user.sub,
  }).returning()
  // Разовый сбор — сразу создаём единственный период.
  if (b.kind === 'oneoff') await ensurePeriod(db, created, 'single')
  return c.json({ collection: created }, 201)
})

// ─── Редактирование сбора ────────────────────────────────────────────────────
collectionsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  isMandatory: z.boolean().optional(),
  defaultAmount: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
})), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const b = c.req.valid('json')
  const patch: any = {}
  if (b.name !== undefined) patch.name = b.name.trim()
  if (b.description !== undefined) patch.description = b.description
  if (b.isMandatory !== undefined) patch.isMandatory = b.isMandatory
  if (b.defaultAmount !== undefined) patch.defaultAmount = String(b.defaultAmount)
  if (b.isActive !== undefined) patch.isActive = b.isActive
  if (Object.keys(patch).length === 0) return c.json({ error: 'nothing to update' }, 400)
  const [upd] = await db.update(collections).set(patch).where(eq(collections.id, id)).returning()
  if (!upd) return c.json({ error: 'not_found' }, 404)
  return c.json({ collection: upd })
})

// ─── Архивировать сбор (мягко) ───────────────────────────────────────────────
collectionsRouter.delete('/:id', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  await db.update(collections).set({ isActive: false }).where(eq(collections.id, id))
  return c.json({ ok: true })
})

// ─── Список периодов сбора ──────────────────────────────────────────────────
collectionsRouter.get('/:id/periods', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const rows = await db.select().from(collectionPeriods)
    .where(eq(collectionPeriods.collectionId, c.req.param('id')))
    .orderBy(desc(collectionPeriods.periodKey))
  return c.json({ periods: rows.map((p: any) => ({ id: p.id, key: p.periodKey, label: p.label, amount: num(p.amount), status: p.status })) })
})

// ─── Сумма взноса периода ────────────────────────────────────────────────────
collectionsRouter.patch('/:id/periods/:periodId', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number().min(0),
})), async (c) => {
  const db = c.var.db
  const { amount } = c.req.valid('json')
  const [upd] = await db.update(collectionPeriods).set({ amount: String(amount) })
    .where(and(eq(collectionPeriods.id, c.req.param('periodId')), eq(collectionPeriods.collectionId, c.req.param('id')))).returning()
  if (!upd) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// ─── Детализация сбора за период (ростер резидентов + итоги) ─────────────────
collectionsRouter.get('/:id', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const reqKey = c.req.query('period')
  const [coll] = await db.select().from(collections).where(eq(collections.id, id)).limit(1)
  if (!coll) return c.json({ error: 'not_found' }, 404)

  const periodKey = coll.kind === 'oneoff' ? 'single' : (reqKey || currentPeriodKey())
  const period = await ensurePeriod(db, coll, periodKey)

  // Резиденты (клиенты resident/student/newbie) + фото по приоритету.
  const residents = await db.select({
    id: profiles.id, nickname: profiles.nickname, fullName: profiles.fullName,
    clientTier: profiles.clientTier, balance: profiles.balance,
    photoUrl: sql<string | null>`coalesce(${profiles.photoUrl}, ${profiles.tgPhotoUrl}, ${profiles.gomafiaPhotoUrl})`,
  }).from(profiles)
    .where(and(eq(profiles.role, 'client'), inArray(profiles.clientTier, RESIDENT_TIERS as unknown as string[])))

  const members = await db.select().from(collectionMembers).where(eq(collectionMembers.collectionId, id))
  const memberByPlayer = new Map(members.map((m: any) => [m.playerId, m]))

  const contribs = await db.select().from(collectionContributions).where(eq(collectionContributions.periodId, period.id))
  const contribByPlayer = new Map(contribs.map((x: any) => [x.playerId, x]))

  // Карри-форвард (предоплата) для ежемесячных сборов: взносы участника копятся в
  // «пул» и закрывают месяцы по порядку. Переплата → аванс на будущие месяцы;
  // недобор → сколько доплатить, чтобы закрыть текущий месяц. Считаем пул как сумму
  // всех взносов участника по периодам ≤ просматриваемого, а долженствование — как
  // (число таких периодов × сумма взноса).
  const r2 = (n: number) => Math.round(n * 100) / 100
  const isRecurring = coll.kind !== 'oneoff'
  let periodsCount = 1
  const poolByPlayer = new Map<string, number>()
  if (isRecurring) {
    const periodsUpTo = await db.select({ id: collectionPeriods.id }).from(collectionPeriods)
      .where(and(eq(collectionPeriods.collectionId, id), sql`${collectionPeriods.periodKey} <= ${periodKey}`))
    periodsCount = Math.max(1, periodsUpTo.length)
    const pids = periodsUpTo.map((p: any) => p.id)
    if (pids.length) {
      const poolRows = await db.select({
        playerId: collectionContributions.playerId,
        total: sql<string>`coalesce(sum(${collectionContributions.amount}), 0)`,
      }).from(collectionContributions)
        .where(and(eq(collectionContributions.collectionId, id), inArray(collectionContributions.periodId, pids)))
        .groupBy(collectionContributions.playerId)
      for (const pr of poolRows as any[]) poolByPlayer.set(pr.playerId, num(pr.total))
    }
  }

  const now = mskNow()
  const periodAmount = num(period.amount)
  const roster = residents.map((r: any) => {
    const m: any = memberByPlayer.get(r.id)
    const excluded = !!m && (m.excludedForever || (m.excludedUntil && new Date(m.excludedUntil) >= now))
    const override = m && m.amountOverride != null ? num(m.amountOverride) : null
    const due = override ?? periodAmount
    const con: any = contribByPlayer.get(r.id)

    // По умолчанию (разовый сбор / исключённый) — простая отметка за период.
    let paid = !!con
    let topUp = 0, prepaid = 0, prepaidMonths = 0, coveredByPrepay = false
    if (isRecurring && !excluded) {
      const pool = poolByPlayer.get(r.id) ?? 0
      const credit = r2(pool - periodsCount * due) // > 0 — аванс, < 0 — недобор
      paid = credit >= -0.005
      if (credit < -0.005) topUp = r2(-credit)
      else if (credit > 0.005) { prepaid = r2(credit); prepaidMonths = due > 0 ? Math.floor((credit + 0.001) / due) : 0 }
      coveredByPrepay = paid && !con
    }
    return {
      playerId: r.id, nickname: r.nickname, fullName: r.fullName, clientTier: r.clientTier,
      photoUrl: r.photoUrl, balance: num(r.balance),
      expected: due,
      amountOverride: override,
      excluded, excludedForever: !!m?.excludedForever,
      excludedUntil: m?.excludedUntil ?? null,
      paid, topUp, prepaid, prepaidMonths, coveredByPrepay,
      contribution: con ? { id: con.id, amount: num(con.amount), method: con.method, paidAt: con.paidAt, note: con.note } : null,
    }
  })
  // Сортировка: неоплатившие (не исключённые) → оплатившие → исключённые; внутри по нику.
  const rank = (x: any) => x.excluded ? 2 : x.paid ? 1 : 0
  roster.sort((a: any, b: any) => rank(a) - rank(b) || String(a.nickname).localeCompare(String(b.nickname), 'ru'))

  // Итоги периода. collected/byMethod — деньги, собранные В ЭТОМ месяце (взносы
  // текущего периода). paidCount — сколько участников ЗАКРЫТЫ за месяц (включая
  // покрытых авансом из прошлых переплат).
  const byMethod: Record<string, { total: number; count: number }> = {}
  let collected = 0
  for (const x of contribs as any[]) {
    const amt = num(x.amount); collected += amt
    const k = x.method; byMethod[k] = byMethod[k] ?? { total: 0, count: 0 }
    byMethod[k].total += amt; byMethod[k].count++
  }
  const excludedCount = roster.filter((r: any) => r.excluded).length
  const eligibleCount = roster.length - excludedCount
  const paidCount = roster.filter((r: any) => r.paid && !r.excluded).length

  return c.json({
    collection: { id: coll.id, name: coll.name, description: coll.description, kind: coll.kind, isMandatory: coll.isMandatory, defaultAmount: num(coll.defaultAmount), isActive: coll.isActive },
    period: { id: period.id, key: period.periodKey, label: period.label, amount: periodAmount, status: period.status },
    totals: { collected, paidCount, eligibleCount, excludedCount, byMethod },
    roster,
  })
})

// ─── Отметить оплату взноса ──────────────────────────────────────────────────
collectionsRouter.post('/:id/pay', requireRole('owner', 'staff'), zValidator('json', z.object({
  periodId: z.string().uuid(),
  playerId: z.string().uuid(),
  amount: z.number().positive().optional(),
  method: z.enum(METHODS),
  note: z.string().max(300).optional(),
})), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const b = c.req.valid('json')
  const user = c.get('user')

  const [coll] = await db.select().from(collections).where(eq(collections.id, id)).limit(1)
  if (!coll) return c.json({ error: 'not_found' }, 404)
  const [period] = await db.select().from(collectionPeriods)
    .where(and(eq(collectionPeriods.id, b.periodId), eq(collectionPeriods.collectionId, id))).limit(1)
  if (!period) return c.json({ error: 'period_not_found' }, 404)

  // Сумма: явная → переопределение участника → сумма периода.
  let amount = b.amount
  if (amount == null) {
    const [m] = await db.select().from(collectionMembers)
      .where(and(eq(collectionMembers.collectionId, id), eq(collectionMembers.playerId, b.playerId))).limit(1)
    amount = (m && (m as any).amountOverride != null) ? num((m as any).amountOverride) : num(period.amount)
  }
  if (!amount || amount <= 0) return c.json({ error: 'Сумма взноса должна быть больше нуля' }, 400)

  const desc = `Взнос: ${coll.name} · ${period.label}`

  type R = { kind: 'ok'; balance: number | null } | { kind: 'dup' } | { kind: 'insufficient' } | { kind: 'limit'; maxDebt: number } | { kind: 'no_player' }
  const result = await db.transaction<R>(async (tx: any) => {
    // Уже оплачено за период? (уник. индекс period_id+player_id)
    const [exist] = await tx.select({ id: collectionContributions.id }).from(collectionContributions)
      .where(and(eq(collectionContributions.periodId, b.periodId), eq(collectionContributions.playerId, b.playerId))).limit(1)
    if (exist) return { kind: 'dup' }

    let balanceTxId: string | null = null
    let newBalance: number | null = null

    if (b.method === 'deposit' || b.method === 'debt') {
      const lockRes = await tx.execute(sql`SELECT balance FROM profiles WHERE id = ${b.playerId} FOR UPDATE`)
      const lockRows = (lockRes as any).rows ?? lockRes
      if (!lockRows || lockRows.length === 0) return { kind: 'no_player' }
      const cur = num(lockRows[0].balance)
      if (b.method === 'deposit' && cur < amount!) return { kind: 'insufficient' }
      newBalance = cur - amount!
      if (b.method === 'debt' && newBalance < 0) {
        const maxRow = await tx.execute(sql`SELECT value FROM app_settings WHERE key = 'max_client_debt'`)
        const maxDebt = num((maxRow as any).rows?.[0]?.value ?? (maxRow as any)[0]?.value) || 0
        if (maxDebt > 0 && newBalance < -maxDebt) return { kind: 'limit', maxDebt }
      }
      const [txRow] = await tx.insert(transactions).values({
        type: 'withdrawal', amount: String(amount), playerId: b.playerId, createdBy: user.sub, description: desc,
      }).returning({ id: transactions.id })
      balanceTxId = txRow.id
      await tx.execute(sql`UPDATE profiles SET balance = ${String(newBalance)} WHERE id = ${b.playerId}`)
    }

    await tx.insert(collectionContributions).values({
      collectionId: id, periodId: b.periodId, playerId: b.playerId,
      amount: String(amount), method: b.method, balanceTxId, note: b.note ?? null, createdBy: user.sub,
    })
    return { kind: 'ok', balance: newBalance }
  })

  if (result.kind === 'no_player') return c.json({ error: 'Клиент не найден' }, 404)
  if (result.kind === 'dup') return c.json({ error: 'Взнос уже отмечен. Сначала снимите отметку.' }, 409)
  if (result.kind === 'insufficient') return c.json({ error: 'Недостаточно депозита — выберите «Долг» или другой способ' }, 400)
  if (result.kind === 'limit') return c.json({ error: `Превышен лимит долга (${result.maxDebt}₽)` }, 400)
  return c.json({ ok: true, balance: result.balance })
})

// ─── Снять отметку оплаты (реверс баланса при deposit/debt) ──────────────────
collectionsRouter.delete('/:id/contributions/:contribId', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const contribId = c.req.param('contribId')
  const ok = await db.transaction<boolean>(async (tx: any) => {
    const [con] = await tx.select().from(collectionContributions).where(eq(collectionContributions.id, contribId)).limit(1)
    if (!con) return false
    if (con.balanceTxId) {
      // Вернуть деньги на баланс и удалить связанную транзакцию.
      await tx.execute(sql`SELECT balance FROM profiles WHERE id = ${con.playerId} FOR UPDATE`)
      await tx.execute(sql`UPDATE profiles SET balance = balance + ${String(num(con.amount))} WHERE id = ${con.playerId}`)
      await tx.delete(transactions).where(eq(transactions.id, con.balanceTxId))
    }
    await tx.delete(collectionContributions).where(eq(collectionContributions.id, contribId))
    return true
  })
  if (!ok) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// ─── Исключить участника (на срок / навсегда) ────────────────────────────────
collectionsRouter.post('/:id/exclude', requireRole('owner', 'staff'), zValidator('json', z.object({
  playerId: z.string().uuid(),
  duration: z.enum(['1m', '3m', 'forever']),
})), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const { playerId, duration } = c.req.valid('json')
  const until = duration === 'forever' ? null
    : new Date(Date.now() + (duration === '1m' ? 30 : 90) * 86400000)
  await db.insert(collectionMembers).values({
    collectionId: id, playerId, excludedForever: duration === 'forever', excludedUntil: until, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [collectionMembers.collectionId, collectionMembers.playerId],
    set: { excludedForever: duration === 'forever', excludedUntil: until, updatedAt: new Date() },
  })
  return c.json({ ok: true })
})

// ─── Вернуть участника в сбор ────────────────────────────────────────────────
collectionsRouter.post('/:id/include', requireRole('owner', 'staff'), zValidator('json', z.object({
  playerId: z.string().uuid(),
})), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const { playerId } = c.req.valid('json')
  await db.insert(collectionMembers).values({
    collectionId: id, playerId, excludedForever: false, excludedUntil: null, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [collectionMembers.collectionId, collectionMembers.playerId],
    set: { excludedForever: false, excludedUntil: null, updatedAt: new Date() },
  })
  return c.json({ ok: true })
})

// ─── Персональная сумма взноса (null = по умолчанию) ─────────────────────────
collectionsRouter.post('/:id/member-amount', requireRole('owner', 'staff'), zValidator('json', z.object({
  playerId: z.string().uuid(),
  amount: z.number().min(0).nullable(),
})), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const { playerId, amount } = c.req.valid('json')
  await db.insert(collectionMembers).values({
    collectionId: id, playerId, amountOverride: amount == null ? null : String(amount), updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [collectionMembers.collectionId, collectionMembers.playerId],
    set: { amountOverride: amount == null ? null : String(amount), updatedAt: new Date() },
  })
  return c.json({ ok: true })
})
