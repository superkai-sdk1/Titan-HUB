// Резервное копирование/восстановление БД из самого API (кнопки в «О системе»).
// Использует pg_dump/psql (postgresql16-client) поверх DATABASE_URL и rclone для
// выгрузки/скачивания в Google Drive. Все эти бинарники добавлены в образ api
// (apps/api/Dockerfile), а /backups и конфиг rclone примонтированы (docker-compose).
import { promisify } from 'node:util'
import { exec as _exec } from 'node:child_process'
import { mkdir, stat, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const exec = promisify(_exec)
const BIG = 1024 * 1024 * 256 // maxBuffer для exec

const BACKUP_DIR = process.env['BACKUP_DIR'] ?? '/backups'
const REMOTE = process.env['BACKUP_RCLONE_REMOTE'] ?? 'gdrive'
const REMOTE_DIR = process.env['BACKUP_RCLONE_DIR'] ?? 'titan-backups'
const KEEP_DAYS = Number(process.env['BACKUP_KEEP_DAYS'] ?? 14)

// PG-переменные окружения из DATABASE_URL (пароль НЕ попадает в командную строку).
function pgEnv(): NodeJS.ProcessEnv {
  const u = new URL(process.env['DATABASE_URL'] ?? '')
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, ''),
  }
}

export async function rcloneConfigured(): Promise<boolean> {
  try {
    const { stdout } = await exec('rclone listremotes')
    return stdout.split('\n').map((s) => s.trim()).includes(`${REMOTE}:`)
  } catch {
    return false
  }
}

function tsName(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `titan_${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.sql.gz`
}

export interface BackupResult { name: string; size: number; at: string; uploaded: boolean }
export interface BackupEntry { name: string; size: number; at: string; location: 'drive' | 'local' }

export async function createBackup(): Promise<BackupResult> {
  await mkdir(BACKUP_DIR, { recursive: true })
  const name = tsName()
  const file = path.join(BACKUP_DIR, name)
  // --clean --if-exists → дамп восстановим поверх существующей БД.
  await exec(`pg_dump --clean --if-exists --no-owner --no-privileges | gzip > "${file}"`, { env: pgEnv(), shell: '/bin/sh', maxBuffer: BIG })
  const st = await stat(file)
  if (st.size < 1024) { await unlink(file).catch(() => {}); throw new Error('Бэкап подозрительно мал — БД недоступна?') }

  let uploaded = false
  if (await rcloneConfigured()) {
    try {
      await exec(`rclone copy "${file}" "${REMOTE}:${REMOTE_DIR}/" --no-traverse`, { maxBuffer: BIG })
      uploaded = true
      await exec(`rclone delete "${REMOTE}:${REMOTE_DIR}/" --min-age ${KEEP_DAYS}d`).catch(() => {})
    } catch {
      uploaded = false
    }
  }
  await rotateLocal()
  return { name, size: st.size, at: st.mtime.toISOString(), uploaded }
}

async function rotateLocal(): Promise<void> {
  try {
    const files = (await readdir(BACKUP_DIR)).filter((f) => /^titan_.*\.sql\.gz$/.test(f))
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000
    for (const f of files) {
      const s = await stat(path.join(BACKUP_DIR, f)).catch(() => null)
      if (s && s.mtimeMs < cutoff) await unlink(path.join(BACKUP_DIR, f)).catch(() => {})
    }
  } catch { /* ignore */ }
}

export async function listBackups(): Promise<{ entries: BackupEntry[]; driveConfigured: boolean }> {
  const driveConfigured = await rcloneConfigured()
  if (driveConfigured) {
    try {
      const { stdout } = await exec(`rclone lsjson "${REMOTE}:${REMOTE_DIR}/"`, { maxBuffer: BIG })
      const arr = JSON.parse(stdout) as { Name: string; Size: number; ModTime: string; IsDir: boolean }[]
      const entries = arr
        .filter((x) => !x.IsDir && /\.sql\.gz$/.test(x.Name))
        .map((x) => ({ name: x.Name, size: x.Size, at: x.ModTime, location: 'drive' as const }))
        .sort((a, b) => b.at.localeCompare(a.at))
      return { entries, driveConfigured }
    } catch { /* падаем на локальный список */ }
  }
  const files = (await readdir(BACKUP_DIR).catch(() => [] as string[])).filter((f) => /^titan_.*\.sql\.gz$/.test(f))
  const entries: BackupEntry[] = []
  for (const f of files) {
    const s = await stat(path.join(BACKUP_DIR, f)).catch(() => null)
    if (s) entries.push({ name: f, size: s.size, at: s.mtime.toISOString(), location: 'local' })
  }
  entries.sort((a, b) => b.at.localeCompare(a.at))
  return { entries, driveConfigured }
}

export async function lastBackup(): Promise<BackupEntry | null> {
  const { entries } = await listBackups()
  return entries[0] ?? null
}

// Восстановление поверх текущей БД (DROP+CREATE из --clean дампа).
export async function restoreFromPath(file: string): Promise<void> {
  const env = pgEnv()
  // Освобождаем блокировки: гасим прочие подключения к БД (пул API переподключится сам).
  await exec(`psql -v ON_ERROR_STOP=0 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"`, { env, maxBuffer: BIG }).catch(() => {})
  await exec(`gunzip -c "${file}" | psql -v ON_ERROR_STOP=0`, { env, shell: '/bin/sh', maxBuffer: BIG })
}

const SAFE_NAME = /^[A-Za-z0-9._-]+\.sql\.gz$/

// Восстановление по имени из Drive (скачиваем) или из локального каталога.
export async function restoreNamed(name: string, source: 'drive' | 'local'): Promise<void> {
  if (!SAFE_NAME.test(name)) throw new Error('Недопустимое имя файла')
  const file = path.join(BACKUP_DIR, name)
  if (source === 'drive') {
    await exec(`rclone copy "${REMOTE}:${REMOTE_DIR}/${name}" "${BACKUP_DIR}/" --no-traverse`, { maxBuffer: BIG })
  }
  await stat(file) // должен существовать
  await restoreFromPath(file)
}

// Восстановление из загруженного с устройства файла (буфер .sql.gz).
export async function restoreFromUpload(buf: Buffer): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true })
  const tmp = path.join(BACKUP_DIR, `upload_${Date.now()}.sql.gz`)
  await writeFile(tmp, buf)
  try {
    await restoreFromPath(tmp)
  } finally {
    await unlink(tmp).catch(() => {})
  }
}
