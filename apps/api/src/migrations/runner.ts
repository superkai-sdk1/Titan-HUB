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
 */
import { db } from '@titan/database'
import { sql } from '@titan/database'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SQL_DIR = join(__dirname, 'sql')

export async function runMigrations() {
  console.log('[migrations] Starting…')

  // 1. Таблица учёта миграций
  await db.execute(sql`
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
      console.log('[migrations] No sql directory, nothing to apply.')
      return
    }
    throw e
  }

  // 3. Какие уже применены
  const appliedRows = await db.execute(sql`SELECT id FROM _migrations`)
  const applied = new Set<string>(
    ((appliedRows as any).rows ?? appliedRows ?? []).map((r: any) => r.id),
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const filePath = join(SQL_DIR, file)
    const content = await readFile(filePath, 'utf-8')
    console.log(`[migrations] Applying ${file}…`)
    try {
      // Каждый файл — одна транзакция
      await db.execute(sql.raw(`BEGIN`))
      await db.execute(sql.raw(content))
      await db.execute(sql`INSERT INTO _migrations (id) VALUES (${file})`)
      await db.execute(sql.raw(`COMMIT`))
      console.log(`[migrations] ✓ ${file}`)
    } catch (err) {
      await db.execute(sql.raw(`ROLLBACK`)).catch(() => {})
      console.error(`[migrations] ✗ ${file} failed:`, err)
      throw err
    }
  }
  console.log('[migrations] Done.')
}
