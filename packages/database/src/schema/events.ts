import { pgTable, uuid, text, numeric, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { checks } from './checks.js'

export const eventTypeEnum = pgEnum('event_type', ['titan', 'exit'])
export const eventStatusEnum = pgEnum('event_status', ['planned', 'active', 'completed', 'cancelled'])
export const eventPaymentTypeEnum = pgEnum('event_payment_type', ['fixed', 'hourly'])

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: eventTypeEnum('type').notNull().default('titan'),
  location: text('location'),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  paymentType: eventPaymentTypeEnum('payment_type').notNull().default('fixed'),
  fixedAmount: numeric('fixed_amount', { precision: 10, scale: 2 }),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }),
  status: eventStatusEnum('status').notNull().default('planned'),
  comment: text('comment'),
  reminders: jsonb('reminders').$type<string[]>().default([]),
  checkId: uuid('check_id').references(() => checks.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
