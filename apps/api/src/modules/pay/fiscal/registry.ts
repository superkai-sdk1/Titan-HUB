/**
 * Реестр фискальных провайдеров + резолв активного.
 *
 * Активный фискальный провайдер ВЫВОДИТСЯ: если настроена самостоятельная касса
 * (по введённым ключам — АТОЛ и т.п.) → она; иначе встроенная ЮKassa, если
 * включён тумблер (app_settings.fiscal_provider='yookassa'); иначе фискализация
 * выключена (''). Самостоятельная касса приоритетнее встроенной.
 */
import { integrations, appSettings, eq } from '@titan/database'
import type { Database } from '@titan/database'
import { getClubIntegration } from '../../../lib/secrets.js'
import type { FiscalProvider } from './types.js'
import { atolProvider } from './providers/atol.js'

export const FISCAL_PROVIDERS: Record<string, FiscalProvider> = {
  atol: atolProvider,
}

/** Самостоятельные кассы (вызываются воркером). 'yookassa' сюда НЕ входит — она
 * пробивает чек вместе с платежом, воркер её не трогает. */
const STANDALONE_ORDER = ['atol'] as const

export function getFiscalProvider(id: string): FiscalProvider | null {
  return FISCAL_PROVIDERS[id] ?? null
}

/** Активный фискальный провайдер: 'atol' | … | 'yookassa' | '' (выкл). */
export async function getActiveFiscalProvider(db: Database): Promise<string> {
  const rows = await db.select({ key: integrations.key }).from(integrations)
  const configured = new Set(rows.map((r) => r.key))
  for (const id of STANDALONE_ORDER) {
    const p = FISCAL_PROVIDERS[id]
    if (p && p.requiredKeys.every((k) => configured.has(k))) return id
  }
  const [s] = await db.select().from(appSettings).where(eq(appSettings.key, 'fiscal_provider')).limit(1)
  if (s?.value === 'yookassa') return 'yookassa'
  return ''
}

export async function resolveFiscalCreds(db: Database, provider: FiscalProvider): Promise<Record<string, string | undefined>> {
  const creds: Record<string, string | undefined> = {}
  for (const key of provider.credKeys) {
    creds[key] = (await getClubIntegration(db, key)) ?? undefined
  }
  return creds
}
