import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

// ─────────────────────────────────────────────────────────────────────────────
// Подключение к CONTROL-БД (`titan_control`) — реестр клубов, ОТДЕЛЬНЫЙ от
// пер-клубных app-БД. По образцу ../client.ts, но ЛЕНИВЫЙ: пул создаётся при
// первом getControlDb(), а CONTROL_DATABASE_URL проверяется тоже лениво (как
// getSecret в packages/auth/src/jwt.ts). Это нужно, чтобы простой импорт модуля
// НЕ падал в рантайме app, где control не используется и env может быть не задан.
// ─────────────────────────────────────────────────────────────────────────────

type ControlDb = ReturnType<typeof drizzle<typeof schema>>

// Кэш единственного пула/инстанса (создаются при первом обращении).
let queryClient: ReturnType<typeof postgres> | null = null
let controlDb: ControlDb | null = null

/**
 * Вернуть drizzle-инстанс control-БД, создав пул при первом вызове.
 * Бросает, только если CONTROL_DATABASE_URL не задан НА МОМЕНТ использования
 * (а не при импорте модуля). Повторные вызовы возвращают тот же инстанс.
 */
export function getControlDb(): ControlDb {
  if (controlDb) return controlDb

  const connectionString = process.env['CONTROL_DATABASE_URL']
  if (!connectionString) {
    throw new Error('CONTROL_DATABASE_URL is not set (требуется для control-plane)')
  }

  // SSL не задаём: как и app-БД, control-БД ходит по внутренней Docker-сети.
  // Таймауты — fail-fast при недоступной БД и освобождение простаивающих соединений.
  queryClient = postgres(connectionString, {
    max: 5,
    connect_timeout: 10, // сек: fail-fast при недоступной БД вместо вечного ожидания
    idle_timeout: 60,    // сек: закрывать соединения, простаивающие дольше минуты
  })
  controlDb = drizzle(queryClient, { schema })
  return controlDb
}

export type ControlDatabase = ControlDb

/**
 * Закрыть пул соединений с control-БД (graceful shutdown). Даёт активным запросам
 * завершиться (timeout сек), затем закрывает сокеты. Идемпотентно/безопасно:
 * если пул не создавался — ничего не делает.
 */
export async function closeControlDb(): Promise<void> {
  const client = queryClient
  queryClient = null
  controlDb = null
  if (!client) return
  try {
    await client.end({ timeout: 5 })
  } catch {
    /* уже закрыт / недоступен — игнорируем */
  }
}
