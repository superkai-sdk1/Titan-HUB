import { pgTable, uuid, text, jsonb, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'
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
    .$type<Record<string, { enabled: boolean; channel: string }>>()
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

export type TgLinkRequest = typeof tgLinkRequests.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
