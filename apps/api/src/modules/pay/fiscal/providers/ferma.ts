/**
 * Платформа ОФД (ИС «Ferma», ofd.ru) — облачная фискализация 54-ФЗ.
 *
 * Поток: CreateAuthToken (Login/Password → AuthToken) → POST /kkt/cloud/receipt
 * с чеком → Data.ReceiptId. Форма оплаты (нал/безнал) — в CustomerReceipt.
 * PaymentItems[{PaymentType:0|1,Sum}]. Суммы — рубли. Тест — ferma-test.ofd.ru.
 *
 * Структура и enum-ы сверены с офиц. API Ferma v2.20 (static.ofd.ru): Vat
 * (VatNo/Vat20/…), TaxationSystem (Common/SimpleIn/SimpleInOut/Unified/
 * UnifiedAgricultural/Patent), предмет расчёта PaymentType=4 (услуга),
 * способ расчёта PaymentMethod=4 (полный расчёт).
 */
import { round2 } from '../../../../lib/money.js'
import type { FiscalProvider, FiscalReceiptInput } from '../types.js'

const VAT_MAP: Record<number, string> = { 1: 'VatNo', 2: 'Vat0', 3: 'Vat10', 4: 'Vat20', 5: 'CalculatedVat10110', 6: 'CalculatedVat20120' }
const VALID_SNO = ['Common', 'SimpleIn', 'SimpleInOut', 'Unified', 'UnifiedAgricultural', 'Patent']

function baseUrl(test?: boolean): string {
  return test ? 'https://ferma-test.ofd.ru' : 'https://ferma.ofd.ru'
}

export const fermaProvider: FiscalProvider = {
  id: 'platform_ofd',
  label: 'Платформа ОФД',
  credKeys: ['ferma_login', 'ferma_password', 'ferma_inn', 'ferma_taxation'],
  requiredKeys: ['ferma_login', 'ferma_password', 'ferma_inn'],

  async registerReceipt({ creds, receipt, test }) {
    const base = baseUrl(test)
    if (!creds['ferma_login'] || !creds['ferma_password'] || !creds['ferma_inn']) {
      throw new Error('FERMA_NOT_CONFIGURED')
    }

    const authRes = await fetch(`${base}/api/Authorization/CreateAuthToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Login: creds['ferma_login'], Password: creds['ferma_password'] }),
    })
    const auth = (await authRes.json().catch(() => ({}))) as Record<string, unknown>
    const token = (auth['Data'] as Record<string, unknown> | undefined)?.['AuthToken'] as string | undefined
    if (!token) {
      const err = auth['Error'] as Record<string, unknown> | undefined
      throw new Error(`FERMA_AUTH_FAILED: ${String(err?.['Message'] ?? authRes.status)}`)
    }

    const taxation = VALID_SNO.includes(creds['ferma_taxation'] ?? '') ? creds['ferma_taxation'] : 'SimpleIn'
    const customerReceipt: Record<string, unknown> = {
      TaxationSystem: taxation,
      PaymentType: 4, // признак предмета расчёта для всего чека: 4 — услуга
      Items: receipt.items.map((it) => ({
        Label: it.name.slice(0, 128),
        Price: round2(it.price),
        Quantity: it.quantity,
        Amount: round2(it.price * it.quantity),
        Vat: VAT_MAP[it.vatCode] ?? 'VatNo',
        PaymentMethod: 4, // полный расчёт
        PaymentType: 4, // услуга
      })),
      // Форма оплаты: 0 — наличными, 1 — безналичными.
      PaymentItems: [{ PaymentType: receipt.payment === 'cash' ? 0 : 1, Sum: round2(receipt.total) }],
    }
    if (receipt.customerEmail) customerReceipt['Email'] = receipt.customerEmail
    if (receipt.customerPhone) customerReceipt['Phone'] = receipt.customerPhone

    const body = {
      Request: {
        Inn: creds['ferma_inn'],
        Type: 'Income',
        InvoiceId: receipt.checkId,
        CustomerReceipt: customerReceipt,
      },
    }

    const res = await fetch(`${base}/api/kkt/cloud/receipt?AuthToken=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const receiptId = (data['Data'] as Record<string, unknown> | undefined)?.['ReceiptId'] as string | undefined
    if (!receiptId) {
      const err = data['Error'] as Record<string, unknown> | undefined
      throw new Error(`FERMA_RECEIPT_FAILED: ${String(err?.['Message'] ?? res.status)}`)
    }
    return { externalId: String(receiptId) }
  },
}
