import { pgTable, uuid, text, numeric, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'

export const shiftStatusEnum = pgEnum('shift_status', ['open', 'closed'])
export const eveningTypeEnum = pgEnum('evening_type', [
  'sport_mafia',
  'city_mafia',
  'kids_mafia',
  'board_games',
  'none',
])

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  openedBy: uuid('opened_by')
    .notNull()
    .references(() => profiles.id),
  closedBy: uuid('closed_by').references(() => profiles.id),
  status: shiftStatusEnum('status').notNull().default('open'),
  cashStart: numeric('cash_start', { precision: 12, scale: 2 }).notNull().default('0'),
  cashEnd: numeric('cash_end', { precision: 12, scale: 2 }),
  eveningType: eveningTypeEnum('evening_type').notNull().default('none'),
  note: text('note'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export type Shift = typeof shifts.$inferSelect
export type NewShift = typeof shifts.$inferInsert
