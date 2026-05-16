import { pgTable, text, uuid, bigint, boolean, timestamp } from 'drizzle-orm/pg-core'
import { profiles } from './profiles.js'

export const passkeys = pgTable('passkeys', {
  id: text('id').primaryKey(), // credential ID (base64url)
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(), // base64url encoded COSE key
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  deviceType: text('device_type'),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: text('transports').array().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
