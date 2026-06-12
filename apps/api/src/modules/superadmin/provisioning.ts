// ─────────────────────────────────────────────────────────────────────────────
// Провижининг новой app-БД клуба (модель database-per-club).
//
// Поднимает с нуля изолированную БД `club_<slug>` для нового арендатора:
//   1. CREATE DATABASE club_<slug>        (нетранзакционно → отдельный shell-out psql)
//   2. baseline.sql на новой БД           (полная схема приложения, squash 001..049)
//   3. _migrations + пометка ВСЕХ файлов из migrations/sql/ применёнными
//      (чтобы штатный раннер не прогонял их повторно; 050+ применятся как обычно)
//   4. Запись в control-plane: clubs / club_modules / subscriptions (trial 7 дней)
//
// Безопасность БД-имени: dbName = `club_${slug}` подставляется в DDL текстом,
// т.к. имя БД в Postgres НЕЛЬЗЯ параметризовать. Поэтому slug проходит строгую
// валидацию regex'ом (только [a-z0-9-], начинается с буквы) — никакого сырого
// ввода в DDL. Пароль psql передаётся через окружение (PGPASSWORD), НЕ в argv —
// тот же паттерн, что в lib/backup.ts (pgEnv()).
// ─────────────────────────────────────────────────────────────────────────────
import { promisify } from 'node:util'
import { exec as _exec } from 'node:child_process'
import { readdir, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
// Control-БД: импорт по относительному пути к собранному dist (закрытый exports-
// map пакета @titan/database не публикует subpath, а existing-файлы трогать нельзя;
// относительный импорт резолвится и в tsx-dev, и в node-prod из общего workspace).
// Тот же путь использует sibling-файл auth.router.ts.
import {
  getControlDb,
  clubs,
  clubModules,
  subscriptions,
  eq,
  sql as csql,
} from '../../../../../packages/database/dist/control/index.js'
import type { Club } from '../../../../../packages/database/dist/control/index.js'

const exec = promisify(_exec)
const BIG = 1024 * 1024 * 64 // maxBuffer для exec (вывод psql может быть объёмным)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Строгая валидация slug. КРИТИЧНО: slug идёт в DDL текстом (CREATE DATABASE
// нельзя параметризовать), поэтому допускаем только безопасный алфавит.
// [a-z] в начале, далее [a-z0-9-], длина 2..31 символ.
const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/

// Поддомен (опционально): метки из [a-z0-9-], как и slug, но допускаем точки
// для многоуровневых имён. Валидируем мягко — это просто хранимое значение.
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

// Дефолтный набор включённых модулей нового клуба. Ключи = имена каталогов
// apps/api/src/modules. Базовый POS-функционал включаем по умолчанию; нишевые
// модули (events/certificates/discounts/loyalty) — тоже on, их можно выключить
// через PATCH /clubs/:id/modules. ai/platega — выкл (требуют ключей/настройки).
const DEFAULT_ENABLED_MODULES = [
  'pos',
  'menu',
  'inventory',
  'pricing',
  'spaces',
  'clients',
  'customers',
  'shifts',
  'staff',
  'salary',
  'cashops',
  'expenses',
  'supplies',
  'refunds',
  'discounts',
  'certificates',
  'events',
  'notifications',
  'analytics',
  'upload',
  'system',
] as const

// Модули, которые по умолчанию ВЫКЛючены (требуют внешних ключей/ручной настройки).
const DEFAULT_DISABLED_MODULES = ['ai', 'platega', 'auth'] as const

/**
 * PG-переменные окружения для psql из ПРОИЗВОЛЬНОЙ строки подключения.
 * Пароль кладём в PGPASSWORD (окружение), НЕ в argv — как pgEnv() в lib/backup.ts.
 * dbOverride позволяет подключиться к другой БД того же сервера (admin vs club).
 */
function pgEnvFor(connectionString: string, dbOverride?: string): NodeJS.ProcessEnv {
  const u = new URL(connectionString)
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: dbOverride ?? u.pathname.replace(/^\//, ''),
  }
}

/**
 * Найти baseline.sql, перебирая кандидатов. В dev (tsx) модуль исполняется из
 * src/, в проде — из dist/ (а baseline.sql в dist НЕ копируется, но весь src/
 * присутствует в образе — см. Dockerfile `COPY --from=builder /app /app`).
 * Резолвим относительно import.meta.url, как в migrations/runner.ts.
 */
async function resolveBaselinePath(): Promise<string> {
  const candidates = [
    // dev: src/modules/superadmin → src/provisioning
    resolve(__dirname, '../../provisioning/baseline.sql'),
    // prod: dist/modules/superadmin → src/provisioning (dist рядом с src в образе)
    resolve(__dirname, '../../../src/provisioning/baseline.sql'),
  ]
  for (const p of candidates) {
    try {
      await access(p, fsConstants.R_OK)
      return p
    } catch {
      /* пробуем следующего кандидата */
    }
  }
  throw new Error(
    `baseline.sql не найден (пробовали: ${candidates.join(', ')})`,
  )
}

/**
 * Прочитать список имён файлов миграций (apps/api/src/migrations/sql/*.sql).
 * Этими именами помечаем _migrations новой БД как «уже применённые» (baseline их
 * сквошнул). В dev читаем из src/, в проде — из dist/migrations/sql (build их туда
 * копирует) ИЛИ из src/ (тоже есть в образе). Перебираем кандидатов.
 */
async function readMigrationIds(): Promise<string[]> {
  const candidates = [
    // dev: src/modules/superadmin → src/migrations/sql
    resolve(__dirname, '../../migrations/sql'),
    // prod: dist/modules/superadmin → dist/migrations/sql (build копирует сюда)
    // (это тот же '../../migrations/sql', но dist; оставляем явный src-фолбэк ниже)
    // prod-фолбэк: dist/modules/superadmin → src/migrations/sql
    resolve(__dirname, '../../../src/migrations/sql'),
  ]
  for (const dir of candidates) {
    try {
      const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
      if (files.length > 0) return files
    } catch {
      /* каталога нет — пробуем следующего */
    }
  }
  throw new Error('Каталог миграций (migrations/sql) не найден или пуст')
}

export interface ProvisionInput {
  slug: string
  name: string
  subdomain?: string | undefined
}

/**
 * Поднять нового клуба: app-БД club_<slug> + запись в control-plane.
 * Идемпотентность не гарантируется — повторный вызов с тем же slug упадёт
 * (и это правильно: клуб уже есть). При сбое на шагах b–d делаем cleanup
 * (DROP DATABASE, если создавали) и НЕ оставляем записей в control-plane.
 */
export async function provisionClub(input: ProvisionInput): Promise<Club> {
  const slug = input.slug?.trim()
  const name = input.name?.trim()
  const subdomain = input.subdomain?.trim() || undefined

  // a. Валидация входа -------------------------------------------------------
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(
      'Некорректный slug: ожидается /^[a-z][a-z0-9-]{1,30}$/ (строчные латиница/цифры/дефис, начинается с буквы)',
    )
  }
  if (!name) {
    throw new Error('Не указано название клуба (name)')
  }
  if (subdomain && !SUBDOMAIN_RE.test(subdomain)) {
    throw new Error('Некорректный subdomain')
  }

  const dbName = `club_${slug}` // безопасно: slug прошёл SLUG_RE

  const adminUrl = process.env['DATABASE_URL']
  if (!adminUrl) {
    throw new Error('DATABASE_URL не задан (нужен для CREATE DATABASE)')
  }

  const control = getControlDb()

  // Проверяем, что клуба с таким slug/db_name/subdomain ещё нет в реестре.
  const existing = await control
    .select({ id: clubs.id })
    .from(clubs)
    .where(eq(clubs.slug, slug))
    .limit(1)
  if (existing.length > 0) {
    throw new Error(`Клуб со slug «${slug}» уже существует`)
  }
  if (subdomain) {
    const bySub = await control
      .select({ id: clubs.id })
      .from(clubs)
      .where(eq(clubs.subdomain, subdomain))
      .limit(1)
    if (bySub.length > 0) {
      throw new Error(`Поддомен «${subdomain}» уже занят`)
    }
  }

  // Окружение psql: admin-коннект (CREATE/DROP DATABASE) и club-коннект (baseline).
  const adminEnv = pgEnvFor(adminUrl) // PGDATABASE = БД из DATABASE_URL (admin)
  const clubEnv = pgEnvFor(adminUrl, dbName) // тот же сервер, но БД = club_<slug>

  // Идентификатор БД для psql -c: оборачиваем в двойные кавычки. Алфавит slug
  // не содержит кавычек/пробелов (SLUG_RE), поэтому инъекция невозможна.
  const dbIdent = `"${dbName}"`

  let dbCreated = false

  try {
    // b. CREATE DATABASE (нетранзакционно) ----------------------------------
    // Если БД уже существует — psql вернёт ошибку, exec бросит → уходим в catch.
    // -v ON_ERROR_STOP=1 гарантирует ненулевой код при любой ошибке.
    await exec(
      `psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${dbIdent}"`,
      { env: adminEnv, maxBuffer: BIG },
    )
    dbCreated = true

    // c. baseline.sql на новой БД -------------------------------------------
    // psql -f <baseline> с коннектом к club_<slug>. Дамп содержит \restrict и
    // SET-директивы → прогоняется именно через psql, а не через drizzle-раннер.
    const baselinePath = await resolveBaselinePath()
    await exec(
      `psql -v ON_ERROR_STOP=1 -f "${baselinePath}"`,
      { env: clubEnv, maxBuffer: BIG },
    )

    // d. _migrations + пометка всех файлов миграций применёнными --------------
    // baseline уже создал _migrations (он есть в дампе), но на всякий случай
    // создаём IF NOT EXISTS, затем вставляем имена файлов (ON CONFLICT DO NOTHING).
    const migrationIds = await readMigrationIds()
    // Формируем VALUES безопасно: имена файлов — литералы, экранируем кавычки.
    // (Имена контролируем мы — это файлы в репозитории, не пользовательский ввод.)
    const valuesSql = migrationIds
      .map((id) => `('${id.replace(/'/g, "''")}')`)
      .join(', ')
    const seedMigrationsSql = `
      CREATE TABLE IF NOT EXISTS _migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO _migrations (id) VALUES ${valuesSql}
      ON CONFLICT (id) DO NOTHING;
    `
    // Передаём SQL через stdin (psql -f -), чтобы НЕ светить в argv и не упереться
    // в лимит длины командной строки на большом списке миграций.
    await execWithStdin('psql -v ON_ERROR_STOP=1 -f -', seedMigrationsSql, clubEnv)

    // e. Запись в control-plane (по возможности — в транзакции) ---------------
    const club = await control.transaction(async (tx) => {
      const [created] = await tx
        .insert(clubs)
        .values({
          slug,
          name,
          dbName,
          subdomain: subdomain ?? null,
          status: 'active',
        })
        .returning()

      // Дефолтные фиче-флаги модулей.
      const moduleRows = [
        ...DEFAULT_ENABLED_MODULES.map((m) => ({ clubId: created!.id, moduleKey: m, enabled: true })),
        ...DEFAULT_DISABLED_MODULES.map((m) => ({ clubId: created!.id, moduleKey: m, enabled: false })),
      ]
      await tx.insert(clubModules).values(moduleRows)

      // Триал 7 дней: started_at = now(), paid_until = now() + 7 days.
      await tx.insert(subscriptions).values({
        clubId: created!.id,
        period: 'trial_7d',
        status: 'trial',
        amount: '0',
        startedAt: csql`now()`,
        paidUntil: csql`now() + interval '7 days'`,
      })

      return created!
    })

    console.log(`[provision] Клуб «${slug}» создан: БД ${dbName}, control id=${club.id}`)
    return club
  } catch (err) {
    // f. CLEANUP при сбое на шагах b–e --------------------------------------
    // Если БД создавали — пытаемся её удалить (чтобы не оставить «висящую» БД).
    // Записи в control-plane не остаётся: INSERT'ы шли в одной транзакции (e),
    // а её падение откатывает всё; до (e) записей вообще не было.
    console.error(`[provision] Ошибка провижининга клуба «${slug}»:`, err)
    if (dbCreated) {
      try {
        // WITH (FORCE) обрывает чужие коннекты к БД (Postgres 13+), чтобы DROP прошёл.
        await exec(
          `psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbIdent} WITH (FORCE)"`,
          { env: adminEnv, maxBuffer: BIG },
        )
        console.error(`[provision] Cleanup: БД ${dbName} удалена`)
      } catch (cleanupErr) {
        console.error(
          `[provision] Cleanup НЕ удался: БД ${dbName} могла остаться, требуется ручное удаление`,
          cleanupErr,
        )
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Провижининг клуба «${slug}» не удался: ${msg}`)
  }
}

/**
 * Выполнить команду, передав SQL через stdin (а не argv). Нужно для psql -f -.
 */
function execWithStdin(
  command: string,
  stdin: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((res, rej) => {
    const child = _exec(command, { env, maxBuffer: BIG }, (error, _stdout, stderr) => {
      if (error) {
        rej(new Error(stderr || error.message))
        return
      }
      res()
    })
    child.stdin?.write(stdin)
    child.stdin?.end()
  })
}
