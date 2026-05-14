import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  jsonb,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['owner', 'staff', 'tablet', 'client'])
export const clientTierEnum = pgEnum('client_tier', ['guest', 'resident', 'student'])

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  nickname: text('nickname').notNull().unique(),
  role: roleEnum('role').notNull().default('staff'),
  clientTier: clientTierEnum('client_tier').notNull().default('guest'),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  bonusPoints: numeric('bonus_points', { precision: 12, scale: 2 }).notNull().default('0'),
  pin: text('pin'),
  passwordHash: text('password_hash'),
  tgId: text('tg_id').unique(),
  tgUsername: text('tg_username'),
  phone: text('phone'),
  birthday: text('birthday'),
  photoUrl: text('photo_url'),
  permissions: jsonb('permissions').$type<Record<string, boolean>>().default({}),
  linkedSpaceId: uuid('linked_space_id'),
  searchTags: text('search_tags').array().default([]),
  isResident: boolean('is_resident').notNull().default(false),
  needsPinSetup: boolean('needs_pin_setup').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
