import { pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { spaces } from './spaces.js'

export const eventTypeEnum = pgEnum('event_type', ['titan', 'exit'])
export const eventStatusEnum = pgEnum('event_status', ['planned', 'active', 'completed', 'cancelled'])
export const eventPaymentTypeEnum = pgEnum('event_payment_type', ['fixed', 'per_head', 'free'])

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: eventTypeEnum('type').notNull().default('titan'),
  title: text('title'),
  location: text('location'),
  spaceId: uuid('space_id').references(() => spaces.id),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  paymentType: eventPaymentTypeEnum('payment_type').notNull().default('fixed'),
  fixedAmount: numeric('fixed_amount', { precision: 10, scale: 2 }),
  perHeadAmount: numeric('per_head_amount', { precision: 10, scale: 2 }),
  maxGuests: integer('max_guests'),
  attendeesCount: integer('attendees_count').notNull().default(0),
  status: eventStatusEnum('status').notNull().default('planned'),
  comment: text('comment'),
  reminders: jsonb('reminders').$type<string[]>().default([]),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
