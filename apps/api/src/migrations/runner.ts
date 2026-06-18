/**
 * Простой раннер миграций на старте API.
 *
 * Принцип:
 * - Создаём таблицу `_migrations` для отслеживания применённых файлов
 * - Читаем `.sql` файлы из ./sql/ в алфавитном порядке
 * - Применяем те, что ещё не записаны в `_migrations`
 * - Транзакция на каждую миграцию (откат при ошибке)
 *
 * SQL-файлы должны быть идемпотентны или иметь чёткий уникальный номер в имени.
 *
 * Ядро вынесено в `runMigrationsOn(dbHandle, label)`, чтобы прогонять раннер не
 * только на синглтоне `db` (основная БД), но и на ЛЮБОЙ клуб-БД (getClubDb)
 * — модель database-per-club. `runMigrations()` сохранён как обёртка над
 * синглтоном для обратной совместимости (index.ts, провижининг).
 */
import { db, sql, type Database } from '@titan/database'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SQL_DIR = join(__dirname, 'sql')

/**
 * Применить ожидающие миграции к ПЕРЕДАННОМУ подключению Drizzle.
 *
 * @param dbHandle — синглтон `db` ИЛИ клуб-БД (getClubDb(connString)).
 * @param label    — человекочитаемая метка БД (имя клуба/БД) для логов: видно,
 *                   к какому клубу применяется миграция.
 */
export async function runMigrationsOn(dbHandle: Database, label = 'default'): Promise<void> {
  const tag = `[migrations:${label}]`
  console.log(`${tag} Starting…`)

  // 1. Таблица учёта миграций
  await dbHandle.execute(sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  // 2. Прочитать все .sql файлы
  let files: string[]
  try {
    files = (await readdir(SQL_DIR)).filter((f) => f.endsWith('.sql')).sort()
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      console.log(`${tag} No sql directory, nothing to apply.`)
      return
    }
    throw e
  }

  // 3. Какие уже применены
  const appliedRows = await dbHandle.execute(sql`SELECT id FROM _migrations`)
  const applied = new Set<string>(
    ((appliedRows as any).rows ?? appliedRows ?? []).map((r: any) => r.id),
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const filePath = join(SQL_DIR, file)
    const content = await readFile(filePath, 'utf-8')
    console.log(`${tag} Applying ${file}…`)
    try {
      // Транзакция через Drizzle — атомарно применяет SQL + запись о миграции
      await dbHandle.transaction(async (tx) => {
        await tx.execute(sql.raw(content))
        await tx.execute(sql`INSERT INTO _migrations (id) VALUES (${file})`)
      })
      console.log(`${tag} ✓ ${file}`)
    } catch (err) {
      console.error(`${tag} ✗ ${file} failed:`, err)
      throw err
    }
  }
  console.log(`${tag} Done.`)
}

/**
 * Обёртка над синглтоном `db` (основная БД из DATABASE_URL) — обратная
 * совместимость для index.ts и существующих вызовов.
 */
export async function runMigrations(): Promise<void> {
  await runMigrationsOn(db, 'default')
}
