// ─────────────────────────────────────────────────────────────────────────────
// Роутер управления клубами для СУПЕРАДМИНА (control-plane).
//
// Монтируется родителем под /api/superadmin с навешанным requireSuperadmin —
// здесь middleware НЕ навешиваем. Все данные берём из control-БД (getControlDb):
// реестр клубов, фиче-флаги модулей, подписки и платежи.
//
// Эндпоинты:
//   GET    /clubs                     — список клубов + их подписка/статус
//   GET    /clubs/:id                 — клуб + модули + подписка
//   POST   /clubs                     — провижининг нового клуба (provisionClub)
//   PATCH  /clubs/:id/modules         — тогл фиче-флага модуля (upsert)
//   POST   /clubs/:id/subscription    — ручной учёт оплаты/продление подписки
//   DELETE /clubs/:id                 — мягкое удаление (status='deleted'); БД НЕ дропаем
// ─────────────────────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
// Control-БД: относительный путь к собранному dist (закрытый exports-map пакета
// @titan/database не публикует subpath) — тот же приём, что в sibling auth.router.ts.
import {
  getControlDb,
  clubs,
  clubModules,
  subscriptions,
  subscriptionPayments,
  eq,
  desc,
  sql as csql,
} from '../../../../../packages/database/dist/control/index.js'
import { provisionClub } from './provisioning.js'
// Тип контекста суперадмина: родитель монтирует роутер с requireSuperadmin,
// который кладёт payload в c.var.superadmin (см. superadmin-token.ts).
import type { SuperadminEnv } from './superadmin-token.js'

// Соответствие период → SQL-интервал для продления paid_until.
const PERIOD_INTERVAL: Record<string, string> = {
  trial_7d: '7 days',
  '1m': '1 month',
  '3m': '3 months',
  '6m': '6 months',
  '12m': '12 months',
}

const CreateClubSchema = z.object({
  slug: z.string().min(2).max(31),
  name: z.string().min(1).max(200),
  subdomain: z.string().min(1).max(255).optional(),
})

const ToggleModuleSchema = z.object({
  moduleKey: z.string().min(1).max(64),
  enabled: z.boolean(),
})

const SubscriptionSchema = z.object({
  period: z.enum(['trial_7d', '1m', '3m', '6m', '12m']),
  amount: z.number().min(0),
  status: z.string().min(1).max(32).optional(),
})

export const superadminClubsRouter = new Hono<SuperadminEnv>()

// GET /clubs — список клубов с краткой подпиской/статусом.
superadminClubsRouter.get('/clubs', async (c) => {
  const db = getControlDb()
  const rows = await db
    .select({
      id: clubs.id,
      slug: clubs.slug,
      name: clubs.name,
      dbName: clubs.dbName,
      subdomain: clubs.subdomain,
      status: clubs.status,
      createdAt: clubs.createdAt,
      subStatus: subscriptions.status,
      subPeriod: subscriptions.period,
      subPaidUntil: subscriptions.paidUntil,
    })
    .from(clubs)
    // Берём самую свежую подписку клуба (LATERAL по created_at DESC).
    .leftJoin(
      subscriptions,
      csql`${subscriptions.id} = (
        SELECT s.id FROM subscriptions s
        WHERE s.club_id = ${clubs.id}
        ORDER BY s.created_at DESC
        LIMIT 1
      )`,
    )
    .orderBy(desc(clubs.createdAt))
  return c.json({ clubs: rows })
})

// GET /clubs/:id — клуб + его модули + текущая подписка.
superadminClubsRouter.get('/clubs/:id', async (c) => {
  const db = getControlDb()
  const id = c.req.param('id')

  const [club] = await db.select().from(clubs).where(eq(clubs.id, id)).limit(1)
  if (!club) return c.json({ error: 'Клуб не найден' }, 404)

  const modules = await db
    .select({ moduleKey: clubModules.moduleKey, enabled: clubModules.enabled })
    .from(clubModules)
    .where(eq(clubModules.clubId, id))
    .orderBy(clubModules.moduleKey)

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  return c.json({ club, modules, subscription: subscription ?? null })
})

// POST /clubs — провижининг нового клуба (создаёт app-БД + запись в control).
superadminClubsRouter.post('/clubs', zValidator('json', CreateClubSchema), async (c) => {
  const { slug, name, subdomain } = c.req.valid('json')
  try {
    const club = await provisionClub({ slug, name, subdomain })
    return c.json({ club }, 201)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 400)
  }
})

// PATCH /clubs/:id/modules — тогл фиче-флага модуля (upsert по (club_id, module_key)).
superadminClubsRouter.patch(
  '/clubs/:id/modules',
  zValidator('json', ToggleModuleSchema),
  async (c) => {
    const db = getControlDb()
    const id = c.req.param('id')
    const { moduleKey, enabled } = c.req.valid('json')

    const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)).limit(1)
    if (!club) return c.json({ error: 'Клуб не найден' }, 404)

    // Upsert: при конфликте по уникальному (club_id, module_key) обновляем enabled.
    const [row] = await db
      .insert(clubModules)
      .values({ clubId: id, moduleKey, enabled })
      .onConflictDoUpdate({
        target: [clubModules.clubId, clubModules.moduleKey],
        set: { enabled },
      })
      .returning()

    return c.json({ module: row })
  },
)

// POST /clubs/:id/subscription — ручной учёт: продлить paid_until по периоду +
// запись в subscription_payments (method='manual'); подписка → active.
superadminClubsRouter.post(
  '/clubs/:id/subscription',
  zValidator('json', SubscriptionSchema),
  async (c) => {
    const db = getControlDb()
    const id = c.req.param('id')
    const { period, amount, status } = c.req.valid('json')
    const interval = PERIOD_INTERVAL[period]
    if (!interval) return c.json({ error: 'Неизвестный период' }, 400)

    const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)).limit(1)
    if (!club) return c.json({ error: 'Клуб не найден' }, 404)

    const result = await db.transaction(async (tx) => {
      // Текущая (самая свежая) подписка клуба.
      const [current] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.clubId, id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1)

      const nextStatus = status ?? 'active'
      let subscription

      // Продление от max(paid_until, now()) — не «съедаем» остаток при досрочной оплате.
      const newPaidUntil = csql`GREATEST(COALESCE(${
        current?.paidUntil ?? null
      }, now()), now()) + interval '${csql.raw(interval)}'`

      if (current) {
        const [updated] = await tx
          .update(subscriptions)
          .set({
            period,
            amount: String(amount),
            status: nextStatus,
            paidUntil: newPaidUntil,
            startedAt: current.startedAt ?? csql`now()`,
          })
          .where(eq(subscriptions.id, current.id))
          .returning()
        subscription = updated
      } else {
        // Подписки ещё не было — создаём.
        const [created] = await tx
          .insert(subscriptions)
          .values({
            clubId: id,
            period,
            amount: String(amount),
            status: nextStatus,
            startedAt: csql`now()`,
            paidUntil: csql`now() + interval '${csql.raw(interval)}'`,
          })
          .returning()
        subscription = created
      }

      // История платежа (ручное подтверждение оператором).
      const [payment] = await tx
        .insert(subscriptionPayments)
        .values({
          clubId: id,
          amount: String(amount),
          period,
          method: 'manual',
          status: 'paid',
          paidAt: csql`now()`,
        })
        .returning()

      return { subscription, payment }
    })

    return c.json(result, 201)
  },
)

// DELETE /clubs/:id — МЯГКОЕ удаление: помечаем status='deleted'.
// app-БД club_<slug> НЕ дропаем здесь — это деструктивно и необратимо.
// TODO: дроп БД — только отдельным эндпоинтом с явным вторым подтверждением
//       (например POST /clubs/:id/destroy { confirmSlug }) + бэкап перед DROP.
superadminClubsRouter.delete('/clubs/:id', async (c) => {
  const db = getControlDb()
  const id = c.req.param('id')

  const [updated] = await db
    .update(clubs)
    .set({ status: 'deleted', updatedAt: csql`now()` })
    .where(eq(clubs.id, id))
    .returning()

  if (!updated) return c.json({ error: 'Клуб не найден' }, 404)
  return c.json({ club: updated })
})
