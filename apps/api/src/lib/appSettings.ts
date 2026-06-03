import { db, appSettings, eq } from '@titan/database'

/**
 * Числовая настройка из app_settings с дефолтом. Используется для настраиваемых
 * порогов (крупный чек / крупный возврат и т.п.). Никогда не бросает — при любой
 * ошибке/отсутствии возвращает дефолт.
 */
export async function getNumericSetting(key: string, fallback: number): Promise<number> {
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key))
    const n = parseFloat(String(row?.value ?? ''))
    return Number.isFinite(n) && n >= 0 ? n : fallback
  } catch {
    return fallback
  }
}

// Ключи настроек порогов (валидны под regex /^[a-z][a-z0-9_]{0,63}$/).
export const LARGE_CHECK_KEY = 'large_check_threshold'
export const LARGE_REFUND_KEY = 'large_refund_threshold'
export const DEFAULT_LARGE_CHECK = 3000
export const DEFAULT_LARGE_REFUND = 3000
