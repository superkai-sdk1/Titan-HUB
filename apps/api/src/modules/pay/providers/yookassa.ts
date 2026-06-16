/**
 * ЮKassa (ЮMoney) API v3 — СБП QR + фискальный чек 54-ФЗ.
 *
 * Поток: POST /v3/payments (confirmation.type='qr') → confirmation_data = СБП
 * payload → вебхук payment.succeeded + серверная сверка GET /v3/payments/{id}.
 * Авторизация — HTTP Basic shopId:secretKey. Idempotence-Key обязателен. Суммы —
 * рубли строкой "100.00". ЮKassa умеет сама пробить чек 54-ФЗ (receipt в платеже).
 *
 * Вебхуки ЮKassa не подписывает — аутентичность подтверждаем повторным запросом
 * статуса (как у Platega: тело не авторитетно). Поэтому verifyWebhook доверяет
 * полю metadata.checkId, а истину о статусе/сумме роутер берёт из fetchStatus.
 */
import { randomUUID } from 'node:crypto'
import type {
  SbpProvider, CreatePaymentArgs, SbpCreateResult, SbpStatusResult, WebhookVerifyResult, ProviderCreds, ReceiptData,
} from '../types.js'

const BASE = 'https://api.yookassa.ru/v3'

function authHeader(creds: ProviderCreds): string {
  const shopId = creds['yookassa_shop_id'] ?? ''
  const secret = creds['yookassa_secret_key'] ?? ''
  return 'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64')
}

function buildReceipt(r: ReceiptData): Record<string, unknown> {
  const customer: Record<string, string> = {}
  if (r.customerEmail) customer['email'] = r.customerEmail
  if (r.customerPhone) customer['phone'] = r.customerPhone
  return {
    customer,
    items: r.items.map((it) => ({
      description: it.description.slice(0, 128),
      quantity: String(it.quantity),
      amount: { value: it.amount.toFixed(2), currency: 'RUB' },
      vat_code: it.vatCode,
      payment_mode: 'full_payment',
      payment_subject: 'commodity',
    })),
  }
}

function statusOf(raw: string | undefined): SbpStatusResult['status'] {
  if (raw === 'succeeded') return 'confirmed'
  if (raw === 'canceled') return 'failed'
  return 'pending'
}

export const yookassaProvider: SbpProvider = {
  id: 'yookassa',
  label: 'ЮKassa СБП',
  credKeys: ['yookassa_shop_id', 'yookassa_secret_key'],
  supportsReceipt: true,

  async createSbpPayment(args: CreatePaymentArgs): Promise<SbpCreateResult> {
    if (!args.creds['yookassa_shop_id'] || !args.creds['yookassa_secret_key']) {
      throw new Error('YOOKASSA_NOT_CONFIGURED')
    }
    const body: Record<string, unknown> = {
      amount: { value: args.amount.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'qr' },
      description: args.description.slice(0, 128),
      metadata: { checkId: args.checkId },
    }
    if (args.receipt) body['receipt'] = buildReceipt(args.receipt)

    const res = await fetch(`${BASE}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(args.creds),
        'Idempotence-Key': randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || !data['id']) {
      throw new Error(`YOOKASSA_CREATE_FAILED: ${String(data['description'] ?? res.status)}`)
    }
    const confirmation = data['confirmation'] as Record<string, unknown> | undefined
    const qrString = confirmation?.['confirmation_data'] ? String(confirmation['confirmation_data']) : undefined
    if (!qrString) throw new Error('YOOKASSA_NO_QR')
    return { transactionId: String(data['id']), qrString }
  },

  async fetchStatus({ creds, transactionId }): Promise<SbpStatusResult> {
    const res = await fetch(`${BASE}/payments/${transactionId}`, {
      headers: { 'Authorization': authHeader(creds) },
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const amountObj = data['amount'] as Record<string, unknown> | undefined
    const amount = amountObj?.['value'] != null ? Number(amountObj['value']) : undefined
    return { status: statusOf(data['status'] as string | undefined), amount }
  },

  async verifyWebhook({ rawBody }): Promise<WebhookVerifyResult> {
    let body: Record<string, unknown>
    try { body = JSON.parse(rawBody) } catch { return { ok: false } }
    const obj = body['object'] as Record<string, unknown> | undefined
    if (!obj) return { ok: false }
    const metadata = obj['metadata'] as Record<string, unknown> | undefined
    const amountObj = obj['amount'] as Record<string, unknown> | undefined
    // ok:true — но истину о статусе роутер берёт из fetchStatus (re-fetch).
    return {
      ok: true,
      status: statusOf(obj['status'] as string | undefined),
      transactionId: obj['id'] != null ? String(obj['id']) : undefined,
      checkId: metadata?.['checkId'] != null ? String(metadata['checkId']) : undefined,
      amount: amountObj?.['value'] != null ? Number(amountObj['value']) : undefined,
    }
  },
}
