/**
 * Контракт самостоятельного фискального провайдера 54-ФЗ (АТОЛ Онлайн, Эвотор,
 * Платформа ОФД). В отличие от встроенной фискализации ЮKassa (чек уходит вместе
 * с платежом), эти провайдеры пробивают чек на ЛЮБУЮ оплату (включая наличные) —
 * их вызывает фоновый воркер cron/fiscalize по закрытым чекам.
 */

export type FiscalPaymentKind = 'cash' | 'electronic'

export interface FiscalLineItem {
  name: string
  price: number // цена за единицу, рубли
  quantity: number
  vatCode: number // код ставки НДС (ФФД): 1 без НДС, 2 0%, 3 10%, 4 20%, 5 10/110, 6 20/120
}

export interface FiscalReceiptInput {
  checkId: string
  items: FiscalLineItem[]
  total: number // рубли; сумма позиций должна сходиться с total
  payment: FiscalPaymentKind
  customerPhone?: string
  customerEmail?: string
}

export interface FiscalProvider {
  id: string
  label: string
  /** Все поля мастера (хранятся в integrations, шифрованно). */
  credKeys: string[]
  /** Подмножество credKeys, по наличию которого провайдер считается настроенным. */
  requiredKeys: string[]
  /** Отправляет фискальный чек. Возвращает внешний id операции у провайдера. */
  registerReceipt(args: {
    creds: Record<string, string | undefined>
    receipt: FiscalReceiptInput
    test?: boolean
  }): Promise<{ externalId: string }>
}
