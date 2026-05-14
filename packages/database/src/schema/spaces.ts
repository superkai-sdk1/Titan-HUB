import { pgTable, uuid, text, numeric, boolean, pgEnum } from 'drizzle-orm/pg-core'

export const spaceTypeEnum = pgEnum('space_type', ['small_booth', 'large_booth', 'hall'])

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: spaceTypeEnum('type').notNull(),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
})

export type Space = typeof spaces.$inferSelect
export type NewSpace = typeof spaces.$inferInsert
