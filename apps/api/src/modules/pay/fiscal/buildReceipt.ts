/**
 * Построение фискального чека 54-ФЗ для самостоятельных касс (АТОЛ и т.п.) из
 * закрытого чека. v1 — единая строка «Оплата по чеку» на итоговую сумму (детальная
 * разбивка по позициям со скидками/арендой — отдельный шаг). Контакт покупателя
 * обязателен (касса шлёт электронный чек): берём телефон гостя из карточки, иначе
 * запасной fiscal_default_phone; без контакта чек пробить нельзя → null.
 */
import { appSettings, profiles, eq } from '@titan/database'
import type { Database } from '@titan/database'
import type { FiscalReceiptInput, FiscalPaymentKind } from './types.js'

async function getSetting(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return row?.value ?? null
}

export interface FiscalCheckRow {
  id: string
  totalAmount: string
  paymentMethod: string | null
  playerId: string | null
}

export async function buildFiscalReceipt(db: Database, check: FiscalCheckRow): Promise<FiscalReceiptInput | null> {
  const total = parseFloat(check.totalAmount) || 0
  if (total <= 0) return null

  const vatCode = Number(await getSetting(db, 'fiscal_vat_code')) || 1
  const fallbackPhone = (await getSetting(db, 'fiscal_default_phone')) || undefined

  let phone: string | undefined = fallbackPhone
  if (check.playerId) {
    const [p] = await db.select({ phone: profiles.phone }).from(profiles).where(eq(profiles.id, check.playerId)).limit(1)
    if (p?.phone) phone = p.phone
  }
  if (!phone) return null

  const payment: FiscalPaymentKind = check.paymentMethod === 'cash' ? 'cash' : 'electronic'
  return {
    checkId: check.id,
    items: [{ name: `Оплата по чеку №${check.id.slice(0, 8)}`, price: total, quantity: 1, vatCode }],
    total,
    payment,
    customerPhone: phone,
  }
}
