import { pgTable, uuid, text, numeric, integer, boolean } from 'drizzle-orm/pg-core'

// Анти-кафе использует разнородные зоны: столы, VR, PS5, общие зоны + кабинки/зал.
// В БД колонка хранится как text + CHECK (см. 012_space_types_capacity.sql) — раннер
// миграций оборачивает каждый файл в транзакцию, а Postgres запрещает
// `ALTER TYPE ... ADD VALUE` внутри транзакции. text+CHECK даёт ту же целостность.
//
// Поэтому колонка type объявлена как `text` (а не pgEnum): иначе drizzle-kit push
// видит дрейф — schema просит enum space_type, а живая БД уже text+CHECK. Допустимые
// значения держим в union-константе ниже (для типизации в TypeScript/zod).
export const spaceTypes = ['small_booth', 'large_booth', 'hall', 'table', 'vr', 'ps5', 'zone'] as const
export type SpaceType = (typeof spaceTypes)[number]

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').$type<SpaceType>().notNull(),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }).notNull().default('0'),
  capacity: integer('capacity'),
  isActive: boolean('is_active').notNull().default(true),
})

export type Space = typeof spaces.$inferSelect
export type NewSpace = typeof spaces.$inferInsert
