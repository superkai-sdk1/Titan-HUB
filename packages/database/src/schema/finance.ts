import { pgTable, uuid, text, numeric, boolean, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'
import { inventory } from './menu.js'
import { checks } from './checks.js'

export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  value: numeric('value', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isAuto: boolean('is_auto').notNull().default(false),
  minQuantity: integer('min_quantity').default(1),
  itemId: uuid('item_id').references(() => inventory.id),
  clientRuleId: uuid('client_rule_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const clientDiscountRules = pgTable('client_discount_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
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

export const supplies = pgTable('supplies', {
  id: uuid('id').primaryKey().defaultRandom(),
  note: text('note'),
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethod: text('payment_method').notNull().default('cash'),
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
  itemId: uuid('item_id')
    .notNull()
    .references(() => inventory.id),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 2 }).notNull(),
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
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const salaryPayments = pgTable('salary_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull().default('cash'),
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
  type: cashOperationTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  shiftId: uuid('shift_id'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Discount = typeof discounts.$inferSelect
export type Certificate = typeof certificates.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Supply = typeof supplies.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type Refund = typeof refunds.$inferSelect
export type SalaryPayment = typeof salaryPayments.$inferSelect
export type CashOperation = typeof cashOperations.$inferSelect
