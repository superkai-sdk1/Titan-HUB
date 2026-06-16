/**
 * Т-Банк (Тинькофф) Эквайринг — СБП QR.
 *
 * Поток: Init (создать платёж) → GetQr (получить СБП-payload) → подтверждение
 * вебхуком (Status=CONFIRMED) + серверная сверка GetState. Подпись Token —
 * SHA-256 от значений корневых скалярных полей + Password, отсортированных по
 * ключу (вложенные DATA/Receipt в подпись не входят). Суммы — в копейках.
 *
 * Боевой контур: https://securepay.tinkoff.ru/v2/. Тестовый — тот же URL с
 * тестовым терминалом (Т-Банк разделяет контуры по терминалу, не по хосту).
 */
import { createHash } from 'node:crypto'
import type {
  SbpProvider, CreatePaymentArgs, SbpCreateResult, SbpStatusResult, WebhookVerifyResult, ProviderCreds,
} from '../types.js'

const BASE = 'https://securepay.tinkoff.ru/v2'

/** Token = sha256( concat(values of scalar root params + Password, sorted by key) ). */
function sign(params: Record<string, string | number | boolean>, password: string): string {
  const merged: Record<string, string> = { Password: password }
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    merged[k] = typeof v === 'boolean' ? String(v) : String(v)
  }
  const concat = Object.keys(merged).sort().map((k) => merged[k]).join('')
  return createHash('sha256').update(concat, 'utf8').digest('hex')
}

async function call(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

function statusOf(raw: string | undefined): SbpStatusResult['status'] {
  const s = (raw ?? '').toUpperCase()
  if (s === 'CONFIRMED' || s === 'AUTHORIZED') return 'confirmed'
  if (['REJECTED', 'DEADLINE_EXPIRED', 'CANCELED', 'CANCELLED', 'REVERSED', 'REFUNDED', 'AUTH_FAIL'].includes(s)) return 'failed'
  return 'pending'
}

export const tbankProvider: SbpProvider = {
  id: 'tbank',
  label: 'Т-Банк СБП',
  credKeys: ['tbank_terminal_key', 'tbank_password'],
  supportsReceipt: false, // 54-ФЗ — отдельным фискальным провайдером

  async createSbpPayment(args: CreatePaymentArgs): Promise<SbpCreateResult> {
    const terminalKey = args.creds['tbank_terminal_key']
    const password = args.creds['tbank_password']
    if (!terminalKey || !password) throw new Error('TBANK_NOT_CONFIGURED')

    const amountKopecks = Math.round(args.amount * 100)
    const initScalars = {
      TerminalKey: terminalKey,
      Amount: amountKopecks,
      OrderId: args.checkId,
      Description: args.description.slice(0, 250),
      NotificationURL: args.notificationUrl,
    }
    const initBody: Record<string, unknown> = {
      ...initScalars,
      Token: sign(initScalars, password),
    }
    const init = await call('Init', initBody)
    if (init['Success'] !== true || !init['PaymentId']) {
      throw new Error(`TBANK_INIT_FAILED: ${String(init['Message'] ?? init['ErrorCode'] ?? 'unknown')}`)
    }
    const paymentId = String(init['PaymentId'])

    const qrScalars = { TerminalKey: terminalKey, PaymentId: paymentId, DataType: 'PAYLOAD' }
    const qr = await call('GetQr', { ...qrScalars, Token: sign(qrScalars, password) })
    const qrString = qr['Data'] ? String(qr['Data']) : undefined
    if (!qrString) throw new Error('TBANK_QR_FAILED')

    return { transactionId: paymentId, qrString }
  },

  async fetchStatus({ creds, transactionId }): Promise<SbpStatusResult> {
    const terminalKey = creds['tbank_terminal_key']
    const password = creds['tbank_password']
    if (!terminalKey || !password) return { status: 'pending' }
    const scalars = { TerminalKey: terminalKey, PaymentId: transactionId }
    const res = await call('GetState', { ...scalars, Token: sign(scalars, password) })
    const amount = res['Amount'] != null ? Number(res['Amount']) / 100 : undefined
    return { status: statusOf(res['Status'] as string | undefined), amount }
  },

  async verifyWebhook({ rawBody, creds }): Promise<WebhookVerifyResult> {
    const password = creds['tbank_password']
    let body: Record<string, unknown>
    try { body = JSON.parse(rawBody) } catch { return { ok: false } }

    // Проверка подписи: пересчитываем Token по корневым скалярным полям + Password.
    const token = body['Token'] as string | undefined
    const scalars: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k === 'Token') continue
      if (v == null || typeof v === 'object') continue // вложенные DATA/Receipt вне подписи
      scalars[k] = v as string | number | boolean
    }
    const ok = !!password && !!token && sign(scalars, password) === token
    if (!ok) return { ok: false }

    return {
      ok: true,
      status: statusOf(body['Status'] as string | undefined),
      transactionId: body['PaymentId'] != null ? String(body['PaymentId']) : undefined,
      checkId: body['OrderId'] != null ? String(body['OrderId']) : undefined,
      amount: body['Amount'] != null ? Number(body['Amount']) / 100 : undefined,
      ackBody: 'OK', // Т-Банк ждёт тело "OK", иначе ретраит вебхук
    }
  },
}

export type { ProviderCreds }
