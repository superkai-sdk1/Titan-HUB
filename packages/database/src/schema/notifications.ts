import { pgTable, uuid, text, numeric, jsonb, boolean, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'

export const tgLinkStatusEnum = pgEnum('tg_link_status', ['pending', 'approved', 'rejected'])

export const tgLinkRequests = pgTable('tg_link_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id),
  tgId: text('tg_id').notNull(),
  tgUsername: text('tg_username'),
  status: tgLinkStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  isRead: boolean('is_read').notNull().default(false),
  userId: uuid('user_id').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userNotificationSettings = pgTable('user_notification_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id)
    .unique(),
  types: jsonb('types')
    .$type<Record<string, { enabled: boolean; channel?: string; telegram?: boolean }>>()
    .default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Одноразовые коды входа в кошелёк ИЗ БРАУЗЕРА/PWA (вне Telegram Mini App). PWA
// показывает 4-значный код, клиент шлёт его боту кошелька, бот помечает строку
// claimed+profileId, PWA опрашивает /auth/wallet-code/status и получает JWT.
// Общий стор между API (создание+поллинг) и ботом (claim) — одна БД клуба.
export const walletLoginCodes = pgTable('wallet_login_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  ticket: uuid('ticket').notNull().defaultRandom().unique(),
  profileId: uuid('profile_id').references(() => profiles.id),
  status: text('status').notNull().default('pending'), // 'pending' | 'claimed' | 'rejected'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Вход из приложения в одно касание: t.me/<bot>?start=login_<deepCode>. Бот
  // показывает имя устройства и просит подтвердить (защита от пересланных ссылок).
  deepCode: text('deep_code'),
  deviceName: text('device_name'),
  platform: text('platform'),
})

// Онлайн-платежи клиента из Titan Resident (СБП через эквайер клуба): погашение
// долга / пополнение депозита (→ profiles.balance + transaction) или взнос в Фонд
// клуба (→ collection_contributions method='sbp'). Эффект применяется ТОЛЬКО при
// подтверждении вебхуком (settleResidentPayment), идемпотентно по status.
// collectionId — без FK (избегаем цикла импорта схем); валидируется в роутере.
export const residentPayments = pgTable('resident_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id),
  purpose: text('purpose').notNull(), // 'deposit' | 'debt' | 'fund'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  provider: text('provider'),
  transactionId: text('transaction_id'),
  collectionId: uuid('collection_id'),
  status: text('status').notNull().default('pending'), // 'pending' | 'confirmed' | 'failed'
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Push-токены устройств (Expo Push). app='client' — Titan Resident, 'staff' — Titan HUB.
export const appDevices = pgTable('app_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  app: text('app').notNull().default('client'),
  platform: text('platform').notNull(), // 'ios' | 'android'
  pushToken: text('push_token').notNull().unique(),
  deviceName: text('device_name'),
  appVersion: text('app_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

// Журнал рассылок клиентам из панели.
export const clientBroadcasts = pgTable('client_broadcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull(), // 'all' | 'residents' | 'debtors' | 'depositors' | 'profiles'
  channels: jsonb('channels').$type<{ push?: boolean; telegram?: boolean }>().notNull().default({}),
  recipientsCount: integer('recipients_count').notNull().default(0),
  pushCount: integer('push_count').notNull().default(0),
  telegramCount: integer('telegram_count').notNull().default(0),
  sentBy: uuid('sent_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Лента уведомлений клиента в приложении (то же, что уходит push и в бот).
export const clientNotifications = pgTable('client_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'bonus' | 'deposit' | 'debt' | 'payment' | 'tier' | 'fund' | 'news' | 'system'
  title: text('title').notNull(),
  body: text('body').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  broadcastId: uuid('broadcast_id').references(() => clientBroadcasts.id, { onDelete: 'set null' }),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TgLinkRequest = typeof tgLinkRequests.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type WalletLoginCode = typeof walletLoginCodes.$inferSelect
export type ResidentPayment = typeof residentPayments.$inferSelect
export type AppDevice = typeof appDevices.$inferSelect
export type ClientNotification = typeof clientNotifications.$inferSelect
export type ClientBroadcast = typeof clientBroadcasts.$inferSelect
