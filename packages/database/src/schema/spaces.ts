import { pgTable, uuid, text, numeric, integer, boolean, pgEnum } from 'drizzle-orm/pg-core'

// Анти-кафе использует разнородные зоны: столы, VR, PS5, общие зоны + кабинки/зал.
// В БД колонка хранится как text + CHECK (см. 012_space_types_capacity.sql) — раннер
// миграций оборачивает каждый файл в транзакцию, а Postgres запрещает
// `ALTER TYPE ... ADD VALUE` внутри транзакции. text+CHECK даёт ту же целостность.
// pgEnum здесь — лишь типизация значений для Drizzle (маппится на строковую колонку).
export const spaceTypeEnum = pgEnum('space_type', ['small_booth', 'large_booth', 'hall', 'table', 'vr', 'ps5', 'zone'])

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: spaceTypeEnum('type').notNull(),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }).notNull().default('0'),
  capacity: integer('capacity'),
  isActive: boolean('is_active').notNull().default(true),
})

export type Space = typeof spaces.$inferSelect
export type NewSpace = typeof spaces.$inferInsert
