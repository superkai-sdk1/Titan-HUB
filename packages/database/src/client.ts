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
