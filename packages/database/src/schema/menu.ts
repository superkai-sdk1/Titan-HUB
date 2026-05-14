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
  icon: text('icon').notNull().default('Package'),
  color: text('color').notNull().default('#6366f1'),
  isActive: boolean('is_active').notNull().default(true),
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
  trackStock: boolean('track_stock').notNull().default(false),
  isService: boolean('is_service').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  isTop: boolean('is_top').notNull().default(false),
  isTabletVisible: boolean('is_tablet_visible').notNull().default(false),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  searchTags: text('search_tags').array().default([]),
  linkedSpaceId: uuid('linked_space_id'),
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

export type MenuCategory = typeof menuCategories.$inferSelect
export type NewMenuCategory = typeof menuCategories.$inferInsert
export type InventoryItem = typeof inventory.$inferSelect
export type NewInventoryItem = typeof inventory.$inferInsert
export type Modifier = typeof modifiers.$inferSelect
export type NewModifier = typeof modifiers.$inferInsert
