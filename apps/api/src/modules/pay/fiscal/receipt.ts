/**
 * Конструктор фискального чека 54-ФЗ для провайдеров, умеющих пробить его сами
 * (сейчас — ЮKassa: receipt передаётся прямо в платёж).
 *
 * Включается, только если заведение выбрало фискальный провайдер 'yookassa'
 * (app_settings.fiscal_provider) — иначе возвращаем undefined и платёж идёт без
 * чека (фискализацию делает отдельный CCT/ОФД-провайдер или она выключена).
 *
 * ВАЖНО: ЮKassa требует контакт покупателя (телефон/почта) и сходимость суммы
 * чека с суммой платежа. Позиции строит общий buildReceiptLines (детально или одной
 * строкой — по настройке fiscal_itemized). При отсутствии контакта чек НЕ
 * прикладываем (чтобы не уронить оплату), о чём пишем в лог. Оплата по СБП = метод
 * 'transfer' — если он исключён из fiscal_methods, чек не шлём.
 */
import { appSettings, profiles, eq } from '@titan/database'
import type { Database } from '@titan/database'
import type { ReceiptData } from '../types.js'
import { buildReceiptLines, getFiscalMethods } from './buildReceipt.js'

async function getSetting(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return row?.value ?? null
}

interface CheckRow {
  id: string
  playerId?: string | null
}

/**
 * Возвращает данные чека 54-ФЗ для встроенной фискализации (ЮKassa) или undefined.
 * @param totalAmount сумма платежа (рубли) — чек должен сходиться с ней.
 */
export async function buildCheckReceipt(
  db: Database,
  check: CheckRow,
  totalAmount: number,
): Promise<ReceiptData | undefined> {
  if ((await getSetting(db, 'fiscal_provider')) !== 'yookassa') return undefined
  // СБП-оплата = метод 'transfer'; уважаем фильтр способов оплаты.
  if (!(await getFiscalMethods(db)).has('transfer')) return undefined

  const vatCode = Number(await getSetting(db, 'fiscal_vat_code')) || 1
  const fallbackPhone = (await getSetting(db, 'fiscal_default_phone')) || undefined

  let phone: string | undefined = fallbackPhone
  if (check.playerId) {
    const [p] = await db.select({ phone: profiles.phone }).from(profiles).where(eq(profiles.id, check.playerId)).limit(1)
    if (p?.phone) phone = p.phone
  }
  if (!phone) {
    console.error(`[fiscal] ЮKassa-чек пропущен: нет телефона покупателя (чек ${check.id.slice(0, 8)})`)
    return undefined
  }

  const lines = await buildReceiptLines(db, check.id, totalAmount, vatCode)
  return {
    items: lines.map((l) => ({ description: l.name, quantity: l.quantity, amount: l.price, vatCode: l.vatCode })),
    customerPhone: phone,
  }
}
