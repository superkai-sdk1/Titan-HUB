import { pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { spaces } from './spaces.js'

export const eventTypeEnum = pgEnum('event_type', ['titan', 'exit'])
// Статусы события. Хранится как text + CHECK (миграция 018) — добавить значение в
// enum нельзя в транзакции, поэтому колонка text. Допустимые значения ниже.
export const EVENT_STATUSES = ['planned', 'needs_clarification', 'active', 'completed', 'cancelled'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]
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
  // Плановое число часов для billingMode=hourly — основа = цена тарифа из
  // event_hourly_rates по этому числу часов. Редактируется в карточке и в чеке.
  plannedHours: integer('planned_hours'),
  // Ручная итоговая сумма основы события (для per_head/без фикс-цены) — задаётся
  // сотрудником, синхронизируется с чеком. Для billingMode=hourly не используется.
  manualAmount: numeric('manual_amount', { precision: 10, scale: 2 }),
  maxGuests: integer('max_guests'),
  attendeesCount: integer('attendees_count').notNull().default(0),
  // text + CHECK (см. EVENT_STATUSES / миграция 018), а не pgEnum.
  status: text('status').notNull().default('planned').$type<EventStatus>(),
  comment: text('comment'),
  reminders: jsonb('reminders').$type<string[]>().default([]),
  // Заказчик: имя + телефон (для связи — звонок/WhatsApp/Telegram по номеру).
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
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

// Почасовые тарифы аренды для мероприятий (billingMode=hourly). Настраиваются в
// разделе «Тарифы и аренда». Ключ — число часов (1..N), значение — цена за весь
// этот период (не за час): 1ч=5000, 2ч=8000, 3ч=10000, 4ч=12000, 5ч=15000, 6ч=18000.
export const eventHourlyRates = pgTable('event_hourly_rates', {
  hours: integer('hours').primaryKey(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
})

export type EventHourlyRate = typeof eventHourlyRates.$inferSelect
