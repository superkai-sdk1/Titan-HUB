import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core'

export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('restaurant_menu'),
  color: text('color').notNull().default('violet'),
  isActive: boolean('is_active').notNull().default(true),
  isTabletVisible: boolean('is_tablet_visible').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const inventory = pgTable('inventory', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: uuid('category').references(() => menuCategories.id),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  costPrice: numeric('cost_price', { precision: 10, scale: 2 }).default('0'),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  minThreshold: integer('min_threshold').default(0),
  // Параметры пополнения (миграция 044): точка заказа и целевой уровень (par).
  // Low-stock алерт срабатывает при stockQuantity <= reorderPoint (а не на нуле);
  // дозаказ добивает до parLevel. minThreshold остаётся для обратной совместимости.
  reorderPoint: integer('reorder_point'),
  parLevel: integer('par_level'),
  trackStock: boolean('track_stock').notNull().default(false),
  isService: boolean('is_service').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  isTop: boolean('is_top').notNull().default(false),
  isTabletVisible: boolean('is_tablet_visible').notNull().default(false),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  searchTags: text('search_tags').array().default([]),
  linkedSpaceId: uuid('linked_space_id'),
  // Мягкое удаление: позиция используется в исторических чеках (check_items.item_id
  // → inventory.id, FK RESTRICT + имя не денормализовано), поэтому жёстко удалять
  // нельзя. deletedAt отделён от isActive: isActive = скрыта из меню, но в управлении
  // видна; deletedAt != null = удалена, исключается из всех списков.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const modifiers = pgTable('modifiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  productId: uuid('product_id')
    .notNull()
    .references(() => inventory.id, { onDelete: 'cascade' }),
})

// Тарифы клиентов (Гость/Резидент/Студент/Одна игра/Без тарифа и т.д.) — отдельная
// управляемая сущность (раздел «Тарифы и аренда»). Не считаются на складе. Каждый
// тариф привязан к скрытой backing-позиции меню (itemId), через которую тариф
// попадает в чек как обычная позиция (денежный путь не меняется); tariffs владеет
// идентичностью/ценой/порядком и используется в настройках и аналитике.
export const tariffs = pgTable('tariffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  color: text('color').notNull().default('#8B5CF6'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  // Backing-позиция меню (категория «Тарифы», trackStock=false) — через неё тариф
  // ложится в check_items. Аналитика маппит тариф по этому itemId.
  itemId: uuid('item_id').references(() => inventory.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type MenuCategory = typeof menuCategories.$inferSelect
export type NewMenuCategory = typeof menuCategories.$inferInsert
export type InventoryItem = typeof inventory.$inferSelect
export type NewInventoryItem = typeof inventory.$inferInsert
export type Modifier = typeof modifiers.$inferSelect
export type NewModifier = typeof modifiers.$inferInsert
export type Tariff = typeof tariffs.$inferSelect
