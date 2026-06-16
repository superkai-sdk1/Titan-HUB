/**
 * RBS / Way4 — общий платёжный шлюз Сбера и Альфа-Банка (и ряда др. банков).
 *
 * Оба банка используют одинаковый REST: register.do (создать заказ → formUrl) и
 * getOrderStatusExtended.do (статус). СБП-оплата выбирается гостем на платёжной
 * странице formUrl, поэтому провайдер отдаёт redirectUrl (а не сырой СБП-payload).
 * Истину о статусе/сумме берём серверной сверкой getOrderStatusExtended (как у
 * Platega: тело callback не авторитетно). Суммы — в копейках.
 *
 * Фабрика makeRbsProvider параметризуется хостом и именами cred-ключей, отсюда
 * sberProvider и alfaProvider.
 */
import type {
  SbpProvider, CreatePaymentArgs, SbpCreateResult, SbpStatusResult, WebhookVerifyResult, ProviderCreds,
} from '../types.js'

interface RbsConfig {
  id: string
  label: string
  base: string // напр. https://securepayments.sberbank.ru/payment/rest
  userKey: string
  passKey: string
}

async function rbsCall(base: string, method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

// orderStatus RBS: 2 — оплачен (deposited), 4 — возврат, 6 — отклонён.
function statusOf(orderStatus: unknown): SbpStatusResult['status'] {
  const n = Number(orderStatus)
  if (n === 2) return 'confirmed'
  if (n === 3 || n === 4 || n === 6) return 'failed'
  return 'pending'
}

function makeRbsProvider(cfg: RbsConfig): SbpProvider {
  const creds = (c: ProviderCreds) => ({ userName: c[cfg.userKey], password: c[cfg.passKey] })
  return {
    id: cfg.id,
    label: cfg.label,
    credKeys: [cfg.userKey, cfg.passKey],
    supportsReceipt: false,

    async createSbpPayment(args: CreatePaymentArgs): Promise<SbpCreateResult> {
      const { userName, password } = creds(args.creds)
      if (!userName || !password) throw new Error('RBS_NOT_CONFIGURED')
      const params: Record<string, string> = {
        userName,
        password,
        orderNumber: args.checkId,
        amount: String(Math.round(args.amount * 100)),
        returnUrl: args.returnUrl ?? args.notificationUrl,
      }
      const data = await rbsCall(cfg.base, 'register.do', params)
      if (data['errorCode'] && String(data['errorCode']) !== '0') {
        throw new Error(`RBS_REGISTER_FAILED: ${String(data['errorMessage'] ?? data['errorCode'])}`)
      }
      const orderId = data['orderId'] ? String(data['orderId']) : undefined
      const formUrl = data['formUrl'] ? String(data['formUrl']) : undefined
      if (!orderId || !formUrl) throw new Error('RBS_NO_FORM_URL')
      // СБП гость выбирает на странице formUrl (RBS не отдаёт сырой СБП-payload).
      return { transactionId: orderId, redirectUrl: formUrl }
    },

    async fetchStatus({ creds: c, transactionId }): Promise<SbpStatusResult> {
      const { userName, password } = creds(c)
      if (!userName || !password) return { status: 'pending' }
      const data = await rbsCall(cfg.base, 'getOrderStatusExtended.do', { userName, password, orderId: transactionId })
      const amount = data['amount'] != null ? Number(data['amount']) / 100 : undefined
      return { status: statusOf(data['orderStatus']), amount }
    },

    async verifyWebhook({ headers, rawBody, creds: c }): Promise<WebhookVerifyResult> {
      // RBS шлёт callback как query-параметры (mdOrder, orderNumber, operation,
      // status). Подпись (checksum) требует симметричного ключа из кабинета; здесь
      // полагаемся на серверную сверку статуса роутером (fetchStatus авторитетен).
      const qs = new URLSearchParams(rawBody || '')
      // часть интеграций кладёт параметры в query самого URL — пробуем и его
      const fromUrl = headers['x-callback-query']
      if (fromUrl) for (const [k, v] of new URLSearchParams(fromUrl)) qs.set(k, v)
      const orderId = qs.get('mdOrder') ?? undefined
      const checkId = qs.get('orderNumber') ?? undefined
      const operation = qs.get('operation') ?? ''
      const ok1 = qs.get('status') === '1'
      const status: SbpStatusResult['status'] = operation === 'deposited' && ok1 ? 'confirmed'
        : (operation === 'declinedByMerchant' || operation === 'declined') ? 'failed' : 'pending'
      void c
      return { ok: true, status, transactionId: orderId, checkId }
    },
  }
}

export const sberProvider = makeRbsProvider({
  id: 'sber',
  label: 'СберБизнес СБП',
  base: 'https://securepayments.sberbank.ru/payment/rest',
  userKey: 'sber_username',
  passKey: 'sber_password',
})

export const alfaProvider = makeRbsProvider({
  id: 'alfa',
  label: 'Альфа/Точка СБП',
  base: 'https://pay.alfabank.ru/payment/rest',
  userKey: 'alfa_username',
  passKey: 'alfa_password',
})
