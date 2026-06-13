import { db, appSettings, eq, type Database } from '@titan/database'

// Пер-клубный db (Фаза 1): сервис принимает БД арендатора. Параметр опционален и
// по умолчанию = синглтон — это переходный режим: немигрированные вызывающие
// работают как раньше (на основном домене синглтон === c.var.db, поведение
// идентично). Перед включением клуб-поддоменов параметр станет обязательным
// (компилятор поймает забытых вызывающих = защита от cross-tenant утечки).
type DbLike = Database

/**
 * Числовая настройка из app_settings с дефолтом. Используется для настраиваемых
 * порогов (крупный чек / крупный возврат и т.п.). Никогда не бросает — при любой
 * ошибке/отсутствии возвращает дефолт.
 */
export async function getNumericSetting(key: string, fallback: number, database: DbLike = db): Promise<number> {
  try {
    const [row] = await database.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key))
    const n = parseFloat(String(row?.value ?? ''))
    return Number.isFinite(n) && n >= 0 ? n : fallback
  } catch {
    return fallback
  }
}

// Булева настройка из app_settings ('1'/'true' → true). При ошибке → дефолт.
export async function getBoolSetting(key: string, fallback = false, database: DbLike = db): Promise<boolean> {
  try {
    const [row] = await database.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key))
    if (row?.value == null) return fallback
    const v = String(row.value).trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'on' || v === 'yes'
  } catch {
    return fallback
  }
}

export const STAFF_DISCOUNT_KEY = 'staff_discount_enabled'

// Ключи настроек порогов (валидны под regex /^[a-z][a-z0-9_]{0,63}$/).
export const LARGE_CHECK_KEY = 'large_check_threshold'
export const LARGE_REFUND_KEY = 'large_refund_threshold'
export const DEFAULT_LARGE_CHECK = 3000
export const DEFAULT_LARGE_REFUND = 3000

// Максимальная СУММАРНАЯ скидка (в % от суммы позиций), которую может навесить
// сотрудник (staff). Owner — без лимита. Защита от обнуления чека несколькими
// скидками подряд. Настраивается; 0 = staff вообще не может давать скидки.
export const STAFF_MAX_DISCOUNT_KEY = 'staff_max_discount_percent'
export const DEFAULT_STAFF_MAX_DISCOUNT = 50
