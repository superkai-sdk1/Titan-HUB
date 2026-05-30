import { pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { spaces } from './spaces.js'

export const eventTypeEnum = pgEnum('event_type', ['titan', 'exit'])
export const eventStatusEnum = pgEnum('event_status', ['planned', 'active', 'completed', 'cancelled'])
export const eventPaymentTypeEnum = pgEnum('event_payment_type', ['fixed', 'per_head', 'free'])
// Как событие списывает деньги за «основу» (помимо допов из меню):
//  - amount: фиксированная/ручная сумма события (fixedAmount/manualAmount/perHead);
//  - hourly: почасовая аренда зоны (ставка зоны × время), как обычный аренда-чек.
export const eventBillingModeEnum = pgEnum('event_billing_mode', ['amount', 'hourly'])

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
  // Гибкий режим списания основы (amount по умолчанию; hourly — почасовая зона).
  billingMode: eventBillingModeEnum('billing_mode').notNull().default('amount'),
  fixedAmount: numeric('fixed_amount', { precision: 10, scale: 2 }),
  perHeadAmount: numeric('per_head_amount', { precision: 10, scale: 2 }),
  // Ручная итоговая сумма основы события (для per_head/без фикс-цены) — задаётся
  // сотрудником, синхронизируется с чеком. Для billingMode=hourly не используется.
  manualAmount: numeric('manual_amount', { precision: 10, scale: 2 }),
  maxGuests: integer('max_guests'),
  attendeesCount: integer('attendees_count').notNull().default(0),
  status: eventStatusEnum('status').notNull().default('planned'),
  comment: text('comment'),
  reminders: jsonb('reminders').$type<string[]>().default([]),
  // Ответственный сотрудник (актуально для выездов; опционально для titan).
  responsibleStaffId: uuid('responsible_staff_id').references(() => profiles.id),
  // Чек, созданный при старте события (status active). Один чек на событие.
  checkId: uuid('check_id'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
