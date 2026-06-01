import { pgTable, uuid, text, numeric, boolean, integer, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { inventory } from './menu.js'
import { checks, paymentMethodEnum, discountTypeEnum } from './checks.js'

export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: discountTypeEnum('type').notNull(),
  value: numeric('value', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isAuto: boolean('is_auto').notNull().default(false),
  minQuantity: integer('min_quantity').default(1),
  itemId: uuid('item_id').references(() => inventory.id),
  clientRuleId: uuid('client_rule_id'),
  clientId: uuid('client_id').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const clientDiscountRules = pgTable('client_discount_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // text + справочник client_tiers (статусы динамические, миграция 021).
  clientTier: text('client_tier').notNull(),
  discountId: uuid('discount_id').references(() => discounts.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  nominal: numeric('nominal', { precision: 10, scale: 2 }).notNull(),
  balance: numeric('balance', { precision: 10, scale: 2 }).notNull(),
  isUsed: boolean('is_used').notNull().default(false),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  usedBy: uuid('used_by').references(() => profiles.id),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',
  'withdrawal',
  'payment',
  'refund',
  'bonus_accrual',
  'bonus_spend',
])

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: transactionTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  checkId: uuid('check_id').references(() => checks.id),
  playerId: uuid('player_id').references(() => profiles.id),
  itemId: uuid('item_id').references(() => inventory.id),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const bonusHistory = pgTable('bonus_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Лоты начислений бонусов — параллельный учёт для сгорания бонусов по сроку.
// profiles.bonusPoints остаётся источником истины для баланса; лоты лишь
// отслеживают, какие начисления когда сгорают (FIFO по сроку). Лот с
// expiresAt = NULL не сгорает никогда. remaining уменьшается при списании.
export const bonusLots = pgTable('bonus_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  remaining: numeric('remaining', { precision: 12, scale: 2 }).notNull(),
  // NULL = бессрочно (сгорание выключено на момент начисления).
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const supplies = pgTable('supplies', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key'),
  note: text('note'),
  supplier: text('supplier'),
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const supplyItems = pgTable('supply_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplyId: uuid('supply_id')
    .notNull()
    .references(() => supplies.id, { onDelete: 'cascade' }),
  // Опциональная привязка к карточке товара (для обновления остатка).
  itemId: uuid('item_id').references(() => inventory.id),
  name: text('name'),
  unit: text('unit').notNull().default('шт'),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 2 }).notNull(),
})

// Журнал движений склада — аудит ручных корректировок остатка.
export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id')
    .notNull()
    .references(() => inventory.id),
  delta: integer('delta').notNull(),
  newQuantity: integer('new_quantity').notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const expenseCategoryEnum = pgEnum('expense_category', [
  'rent',
  'utilities',
  'supplies',
  'salary',
  'marketing',
  'equipment',
  'other',
])

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key'),
  category: expenseCategoryEnum('category').notNull().default('other'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  expenseDate: text('expense_date').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refundReasonEnum = pgEnum('refund_reason', ['return', 'exchange', 'discount', 'damage'])
export const refundTypeEnum = pgEnum('refund_type', ['full', 'partial'])

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkId: uuid('check_id')
    .notNull()
    .references(() => checks.id),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  refundType: refundTypeEnum('refund_type').notNull().default('full'),
  reason: refundReasonEnum('reason').notNull().default('return'),
  note: text('note'),
  // Разбивка возврата по способам оплаты: [{ method, amount }]
  tenders: jsonb('tenders').$type<{ method: string; amount: number }[]>(),
  // Фактически восстановленный на склад сток этим возвратом: [{ itemId, quantity }].
  // Нужно, чтобы повторные частичные возвраты не восстанавливали сток сверх
  // проданного (cap = sold − alreadyRestored по всем предыдущим возвратам чека).
  restoredItems: jsonb('restored_items').$type<{ itemId: string; quantity: number }[]>().default([]),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const salaryPayments = pgTable('salary_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key'),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
  note: text('note'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cashOperationTypeEnum = pgEnum('cash_operation_type', [
  'deposit',
  'withdrawal',
  'salary',
])

export const cashOperations = pgTable('cash_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key'),
  type: cashOperationTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  shiftId: uuid('shift_id'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BonusLot = typeof bonusLots.$inferSelect
export type NewBonusLot = typeof bonusLots.$inferInsert
export type Discount = typeof discounts.$inferSelect
export type Certificate = typeof certificates.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Supply = typeof supplies.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type Refund = typeof refunds.$inferSelect
export type SalaryPayment = typeof salaryPayments.$inferSelect
export type CashOperation = typeof cashOperations.$inferSelect
