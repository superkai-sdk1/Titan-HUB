import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  bigint,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL-PLANE СХЕМА (реестр клубов). Живёт в ОТДЕЛЬНОЙ БД `titan_control`,
// никак не связанной с пер-клубными app-БД (модель database-per-club). Эта схема
// НЕ подключается к рантайму приложения и грузится только control-инструментами
// (биллинг, суперадмин, провижининг новых клубов). См. control/client.ts.
//
// Все таймстампы — timestamptz (withTimezone), id — uuid с gen_random_uuid()
// (требует pgcrypto, см. migrations/001_control_init.sql), как в app-схемах.
// ─────────────────────────────────────────────────────────────────────────────

// Реестр клубов. Одна строка = один арендатор = одна app-БД (db_name).
export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Машинный идентификатор клуба (используется в URL/служебно), уникален.
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // Имя пер-клубной app-БД (database-per-club): к ней подключается рантайм клуба.
  dbName: text('db_name').notNull().unique(),
  // Поддомен клуба (напр. club.titanpos.ru). Опционален, но уникален если задан.
  subdomain: text('subdomain').unique(),
  // Жизненный цикл арендатора: active | suspended | deleted.
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Включённые модули клуба (фиче-флаги per-tenant). Уникальность пары
// (club_id, module_key) — один флаг на модуль для клуба.
export const clubModules = pgTable(
  'club_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Ссылка на clubs.id (FK навешан в SQL-миграции; в схеме оставляем uuid,
    // т.к. кросс-таблично FK к clubs описываем декларацией unique/SQL).
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    moduleKey: text('module_key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => ({
    clubModuleUnique: unique('club_modules_club_module_key').on(t.clubId, t.moduleKey),
  }),
)

// Подписка клуба (тариф/период/срок оплаты). Источник истины доступа к продукту.
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, { onDelete: 'cascade' }),
  plan: text('plan'),
  // Период подписки: trial_7d | 1m | 3m | 6m | 12m.
  period: text('period'),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  currency: text('currency').default('RUB'),
  // Состояние подписки: trial | active | expired | suspended.
  status: text('status').notNull().default('trial'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  // Оплачено по (дата окончания текущего оплаченного периода).
  paidUntil: timestamp('paid_until', { withTimezone: true }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Платежи по подписке (история). method: manual (ручное подтверждение оператором)
// либо platega (онлайн-эквайринг). platega_invoice_id — id инвойса для реконсиляции.
export const subscriptionPayments = pgTable('subscription_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  period: text('period'),
  // Способ оплаты: manual | platega.
  method: text('method').notNull(),
  plategaInvoiceId: text('platega_invoice_id'),
  status: text('status'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Суперадмины control-plane (операторы платформы, не клубные пользователи).
export const superadmins = pgTable('superadmins', {
  id: uuid('id').primaryKey().defaultRandom(),
  login: text('login').notNull().unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// WebAuthn-passkeys суперадминов (по образцу app-passkeys, но в control-БД).
// counter — bigint (mode: number), credential_id уникален.
export const superadminPasskeys = pgTable('superadmin_passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  superadminId: uuid('superadmin_id')
    .notNull()
    .references(() => superadmins.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(), // base64url COSE key
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: text('transports'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Аудит действий control-plane (кто/что/над каким клубом). payload — произвольная
// нагрузка операции (jsonb), target_club — ссылка на затронутый клуб (опц.).
export const controlAudit = pgTable('control_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor'),
  action: text('action').notNull(),
  targetClub: uuid('target_club'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Типы (как в app-схемах: $inferSelect / $inferInsert) ────────────────────
export type Club = typeof clubs.$inferSelect
export type NewClub = typeof clubs.$inferInsert
export type ClubModule = typeof clubModules.$inferSelect
export type NewClubModule = typeof clubModules.$inferInsert
export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect
export type NewSubscriptionPayment = typeof subscriptionPayments.$inferInsert
export type Superadmin = typeof superadmins.$inferSelect
export type NewSuperadmin = typeof superadmins.$inferInsert
export type SuperadminPasskey = typeof superadminPasskeys.$inferSelect
export type NewSuperadminPasskey = typeof superadminPasskeys.$inferInsert
export type ControlAudit = typeof controlAudit.$inferSelect
export type NewControlAudit = typeof controlAudit.$inferInsert
