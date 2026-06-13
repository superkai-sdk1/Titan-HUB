import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { integrations, eq } from '@titan/database'
import type { Database } from '@titan/database'

/**
 * Пер-клубное шифрование секретов заведения (токены ботов, AI, Platega).
 *
 * AES-256-GCM (аутентифицированное шифрование: тег ловит порчу/подмену шифртекста).
 * Мастер-ключ — единый на инстанс, секреты лежат в БД КЛУБА (database-per-club),
 * поэтому компрометация одной клуб-БД без мастер-ключа не раскрывает секреты.
 *
 * БЕЗОПАСНОСТЬ: plaintext секрета НИКОГДА не попадает в ответы API/логи —
 * наружу отдаётся только maskSecret(...). Расшифровка нужна лишь серверу
 * (исходящие вызовы Platega/AI/ботов) через getClubIntegration.
 */

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12 // рекомендованный размер nonce для GCM
const KEY_BYTES = 32 // AES-256
const VERSION = 'v1'

/**
 * Мастер-ключ лениво из process.env['SECRETS_MASTER_KEY] — как getSecret в
 * packages/auth/src/jwt.ts: импорт модуля НЕ должен падать в окружениях, где
 * секреты не используются. Ошибка бросается только при первом шифровании/
 * расшифровке без валидного ключа.
 *
 * Формат ключа: 32 байта в hex (64 hex-символа) ИЛИ base64. Любой более
 * короткий/отсутствующий ключ — ошибка с понятным текстом.
 */
function getMasterKey(): Buffer {
  const raw = process.env['SECRETS_MASTER_KEY']
  if (!raw) {
    throw new Error(
      'SECRETS_MASTER_KEY must be set: 32 bytes as hex (64 chars) or base64',
    )
  }

  // Сначала пробуем hex (ровно 64 hex-символа = 32 байта).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }

  // Иначе пробуем base64 (стандартный/url-safe) и требуем ровно 32 байта.
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.length === KEY_BYTES) {
      return buf
    }
  } catch {
    /* падёт в общую ошибку ниже */
  }

  throw new Error(
    'SECRETS_MASTER_KEY invalid: expected 32 bytes as hex (64 chars) or base64',
  )
}

/**
 * Шифрует plaintext в строку формата `v1:<ivB64>:<tagB64>:<cipherB64>`.
 * IV — случайный 12-байт nonce на каждое шифрование (нельзя переиспользовать в GCM).
 */
export function encryptSecret(plaintext: string): string {
  const key = getMasterKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Расшифровывает строку формата `v1:<ivB64>:<tagB64>:<cipherB64>`.
 * Проверяет версию и аутентификационный тег GCM (бросает при подмене/порче).
 */
export function decryptSecret(enc: string): string {
  const parts = enc.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('decryptSecret: unsupported or malformed ciphertext')
  }
  const [, ivB64, tagB64, cipherB64] = parts
  const key = getMasterKey()
  const iv = Buffer.from(ivB64!, 'base64')
  const tag = Buffer.from(tagB64!, 'base64')
  const ciphertext = Buffer.from(cipherB64!, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag) // если тег не сойдётся — decipher.final() бросит
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

/**
 * Маскирует секрет для безопасного показа в UI: `••••` + последние 4 символа.
 * Для коротких значений (≤4 символов) — просто `••••`, чтобы не раскрыть его целиком.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) {
    return '••••'
  }
  return '••••' + plaintext.slice(-4)
}

/**
 * Возвращает расшифрованный секрет клуба по ключу или null, если записи нет.
 * Для будущей привязки Platega/AI/ботов к настройкам конкретного клуба.
 *
 * Доступ к БД — через переданный c.var.db (БД текущего клуба). Plaintext
 * остаётся внутри сервера: вызывающий код использует его только для исходящих
 * вызовов, НИКОГДА не возвращая наружу.
 */
export async function getClubIntegration(
  db: Database,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ valueEnc: integrations.valueEnc })
    .from(integrations)
    .where(eq(integrations.key, key))
    .limit(1)
  if (!row) return null
  return decryptSecret(row.valueEnc)
}
