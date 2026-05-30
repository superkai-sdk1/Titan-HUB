import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

// Заказчики мероприятий — отдельная от profiles/клиентов справочная сущность.
// Только контакт (имя + телефон) для связи и автоподбора при планировании событий.
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
