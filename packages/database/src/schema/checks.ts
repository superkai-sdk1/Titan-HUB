import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { shifts } from './shifts.js'
import { spaces } from './spaces.js'
import { inventory } from './menu.js'
import { modifiers } from './menu.js'

export const checkStatusEnum = pgEnum('check_status', ['open', 'closed', 'cancelled'])
export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'card',
  'transfer',
  'bonus',
  'deposit',
  'debt',
  'split',
  'certificate',
])

export const checks = pgTable('checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => profiles.id),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => profiles.id),
  shiftId: uuid('shift_id')
    .notNull()
    .references(() => shifts.id),
  status: checkStatusEnum('status').notNull().default('open'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethod: paymentMethodEnum('payment_method'),
  bonusUsed: numeric('bonus_used', { precision: 12, scale: 2 }).default('0'),
  certificateUsed: numeric('certificate_used', { precision: 12, scale: 2 }).default('0'),
  certificateId: uuid('certificate_id'),
  discountTotal: numeric('discount_total', { precision: 12, scale: 2 }).default('0'),
  spaceId: uuid('space_id').references(() => spaces.id),
  spaceStartAt: timestamp('space_start_at', { withTimezone: true }),
  spaceEndAt: timestamp('space_end_at', { withTimezone: true }),
  guestNames: text('guest_names').array().default([]),
  note: text('note'),
  // ID авто/тир-скидок, вручную снятых с ЭТОГО чека: applyAutoDiscounts их
  // пропускает (иначе скидка вернулась бы при следующем пересчёте позиций).
  excludedDiscountIds: uuid('excluded_discount_ids').array().default([]),
  linkedEventId: uuid('linked_event_id'),
  // База события на чеке: фикс/ручная сумма мероприятия (помимо позиций и аренды).
  // Входит в «Итого», редактируется; синхронизируется при правке суммы события.
  eventBaseAmount: numeric('event_base_amount', { precision: 12, scale: 2 }),
  // Чаевые по QR/СБП (поверх суммы товаров). Хранятся на чеке для валидации в
  // webhook'е Platega и фиксации фактически уплаченных чаевых. См. 028_*.sql.
  tipAmount: numeric('tip_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export const checkItems = pgTable('check_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkId: uuid('check_id')
    .notNull()
    .references(() => checks.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id')
    .notNull()
    .references(() => inventory.id),
  quantity: integer('quantity').notNull().default(1),
  priceAtTime: numeric('price_at_time', { precision: 10, scale: 2 }).notNull(),
})

export const checkItemModifiers = pgTable('check_item_modifiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkItemId: uuid('check_item_id')
    .notNull()
    .references(() => checkItems.id, { onDelete: 'cascade' }),
  modifierId: uuid('modifier_id')
    .notNull()
    .references(() => modifiers.id),
  priceAtTime: numeric('price_at_time', { precision: 10, scale: 2 }).notNull(),
})

export const checkPayments = pgTable('check_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkId: uuid('check_id')
    .notNull()
    .references(() => checks.id, { onDelete: 'cascade' }),
  method: paymentMethodEnum('method').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
})

export const discountTypeEnum = pgEnum('discount_type', ['percent', 'fixed'])
export const discountTargetEnum = pgEnum('discount_target', ['check', 'item'])

export const checkDiscounts = pgTable('check_discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkId: uuid('check_id')
    .notNull()
    .references(() => checks.id, { onDelete: 'cascade' }),
  discountId: uuid('discount_id'),
  name: text('name').notNull(),
  type: discountTypeEnum('type').notNull(),
  value: numeric('value', { precision: 10, scale: 2 }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  target: discountTargetEnum('target').notNull().default('check'),
  itemId: uuid('item_id'),
  clientRuleId: uuid('client_rule_id'),
})

export type Check = typeof checks.$inferSelect
export type NewCheck = typeof checks.$inferInsert
export type CheckItem = typeof checkItems.$inferSelect
export type NewCheckItem = typeof checkItems.$inferInsert
export type CheckPayment = typeof checkPayments.$inferSelect
export type NewCheckPayment = typeof checkPayments.$inferInsert
export type CheckDiscount = typeof checkDiscounts.$inferSelect
