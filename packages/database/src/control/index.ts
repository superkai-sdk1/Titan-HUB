// ─────────────────────────────────────────────────────────────────────────────
// Точка входа control-plane (реестр клубов). Подключается ОТДЕЛЬНО от основного
// экспорта пакета (../index.js его НЕ реэкспортирует) — рантайм app его не грузит.
// Импортировать так: import { getControlDb, clubs } from '@titan/database/control'
// (или относительным путём из control-инструментов).
// ─────────────────────────────────────────────────────────────────────────────

export { getControlDb, closeControlDb } from './client.js'
export type { ControlDatabase } from './client.js'
export * from './schema.js'
export {
  eq, ne, and, or, gt, gte, lt, lte, isNull, isNotNull,
  inArray, notInArray, like, ilike, sql, desc, asc,
  count, sum, avg, max, min,
} from 'drizzle-orm'
