/**
 * Реестр эквайеров + резолв активного провайдера и его кред.
 *
 * Активный СБП-эквайер хранится в app_settings (ключ sbp_provider). 'platega' —
 * дефолт и существующий путь (pos.router /checks/:id/qr + platega.router). Новые
 * провайдеры — из PAY_PROVIDERS. Креды — пер-клубные (integrations) с фолбэком на
 * env (как Platega), чтобы основной одно-клубный прод можно было настроить через
 * переменные окружения.
 */
import { appSettings, integrations, eq } from '@titan/database'
import type { Database } from '@titan/database'
import { getClubIntegration } from '../../lib/secrets.js'
import type { SbpProvider, ProviderCreds } from './types.js'
import { tbankProvider } from './providers/tbank.js'
import { yookassaProvider } from './providers/yookassa.js'
import { sberProvider, alfaProvider } from './providers/rbs.js'

export const PAY_PROVIDERS: Record<string, SbpProvider> = {
  tbank: tbankProvider,
  yookassa: yookassaProvider,
  sber: sberProvider,
  alfa: alfaProvider,
}

export function getProvider(id: string): SbpProvider | null {
  return PAY_PROVIDERS[id] ?? null
}

/** Расшифрованные креды провайдера: integrations клуба → фолбэк env (UPPER_CASE). */
export async function resolveCreds(db: Database, provider: SbpProvider): Promise<ProviderCreds> {
  const creds: ProviderCreds = {}
  for (const key of provider.credKeys) {
    creds[key] = (await getClubIntegration(db, key)) ?? process.env[key.toUpperCase()] ?? undefined
  }
  return creds
}

async function getSetting(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return row?.value ?? null
}

const NEW_PROVIDER_ORDER = ['tbank', 'yookassa', 'sber', 'alfa'] as const

/**
 * Активный СБП-эквайер ВЫВОДИТСЯ из того, чьи ключи введены (одно заведение —
 * один эквайер, без ручного выбора): если настроен новый эквайер — он, иначе
 * 'platega' (дефолт; работает через platega-ключи или env основного инстанса).
 */
export async function getActiveSbpProvider(db: Database): Promise<string> {
  const rows = await db.select({ key: integrations.key }).from(integrations)
  const configured = new Set(rows.map((r) => r.key))
  for (const id of NEW_PROVIDER_ORDER) {
    const p = PAY_PROVIDERS[id]
    if (p && p.credKeys.every((k) => configured.has(k))) return id
  }
  return 'platega'
}

/** Тестовый контур провайдера (песочница) вместо боевого. */
export async function getPaymentTestMode(db: Database): Promise<boolean> {
  return (await getSetting(db, 'payment_test_mode')) === 'true'
}
