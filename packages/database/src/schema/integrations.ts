import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Пер-клубное хранилище зашифрованных СЕКРЕТОВ заведения (токены ботов, AI,
 * Platega). Лежит в БД КЛУБА (database-per-club). value_enc — шифртекст
 * AES-256-GCM формата `v1:<iv>:<tag>:<cipher>` (см. apps/api/src/lib/secrets.ts).
 *
 * key уникален (один секрет на ключ) — для upsert через ON CONFLICT (key).
 * Plaintext в БД НЕ хранится и наружу через API НЕ отдаётся (только маска).
 */
export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  valueEnc: text('value_enc').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
})

export type Integration = typeof integrations.$inferSelect
