import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

const connectionString = process.env['DATABASE_URL']
if (!connectionString) throw new Error('DATABASE_URL is not set')

// SSL не задаём: подключение к Postgres идёт по внутренней Docker-сети
// (контейнер→контейнер, наружу не выходит). Таймауты — чтобы недоступная БД
// приводила к быстрому отказу, а простаивающие соединения освобождались.
const queryClient = postgres(connectionString, {
  max: 10,
  connect_timeout: 10, // сек: fail-fast при недоступной БД вместо вечного ожидания
  idle_timeout: 60,    // сек: закрывать соединения, простаивающие дольше минуты
})
export const db = drizzle(queryClient, { schema })
export type Database = typeof db

/**
 * Закрыть пул соединений с БД (graceful shutdown). Даёт активным запросам
 * завершиться (timeout сек), затем закрывает сокеты. Идемпотентно/безопасно.
 */
export async function closeDb(): Promise<void> {
  try {
    await queryClient.end({ timeout: 5 })
  } catch {
    /* уже закрыт / недоступен — игнорируем */
  }
}

// ─── Пер-клубные подключения (database-per-club, Фаза 1) ─────────────────────
// Кэш drizzle-инстансов по строке подключения. Для ТЕКУЩЕЙ/дефолтной БД
// (DATABASE_URL) возвращаем уже существующий синглтон `db` — без второго пула,
// поэтому в одно-клубном режиме поведение и число соединений не меняются.
// Для БД ДРУГОГО клуба создаём отдельный пул (малый max) и кэшируем по строке.
const clubDbCache = new Map<string, Database>()
const clubPools = new Map<string, ReturnType<typeof postgres>>()

/**
 * Вернуть drizzle-инстанс для БД клуба по строке подключения. Дефолт/текущая БД
 * (пустая строка или совпадает с DATABASE_URL) → существующий синглтон `db`.
 * Иначе — кэшированный пул на эту БД (создаётся при первом обращении).
 */
export function getClubDb(clubConnectionString: string | null | undefined): Database {
  if (!clubConnectionString || clubConnectionString === connectionString) return db
  const cached = clubDbCache.get(clubConnectionString)
  if (cached) return cached
  const client = postgres(clubConnectionString, {
    max: 5,
    connect_timeout: 10,
    idle_timeout: 60,
  })
  const inst = drizzle(client, { schema })
  clubPools.set(clubConnectionString, client)
  clubDbCache.set(clubConnectionString, inst)
  return inst
}

/**
 * Закрыть ВСЕ пер-клубные пулы (graceful shutdown). Синглтон закрывается
 * отдельно через closeDb(). Идемпотентно.
 */
export async function closeClubDbs(): Promise<void> {
  const pools = Array.from(clubPools.values())
  clubPools.clear()
  clubDbCache.clear()
  await Promise.all(pools.map((p) => p.end({ timeout: 5 }).catch(() => {})))
}
