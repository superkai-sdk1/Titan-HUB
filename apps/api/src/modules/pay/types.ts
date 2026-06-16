/**
 * Провайдеро-независимый слой приёма СБП-оплат (эквайеры заведения).
 *
 * Архитектура: уже работающий Platega — частный случай этой же модели (создать
 * платёж → получить QR → подтверждение вебхуком/поллингом → закрыть чек). Здесь
 * описан общий интерфейс эквайера; конкретные банки (Т-Банк, ЮKassa, Сбер,
 * Точка/Альфа) реализуют его в providers/*. Расчёт и закрытие чека — общий
 * settleCheckPayment (settle.ts), один к одному с логикой Platega-вебхука.
 *
 * ВАЖНО (безопасность): креды эквайера — пер-клубные, шифруются в таблице
 * integrations (lib/secrets), наружу никогда не отдаются. Тело вебхука не
 * авторитетно: подпись провайдера + серверная сверка статуса (fetchStatus).
 */

/** Расшифрованные креды провайдера (ключи из INTEGRATION_KEYS). */
export type ProviderCreds = Record<string, string | undefined>

/** Нормализованный статус транзакции у эквайера. */
export type PayStatus = 'confirmed' | 'failed' | 'pending'

/** Позиция фискального чека 54-ФЗ (для провайдеров, умеющих слать чек: ЮKassa). */
export interface ReceiptItem {
  description: string
  quantity: number
  amount: number // цена за единицу, рубли
  vatCode: number // код ставки НДС (1=без НДС, см. ФФД); по умолчанию настройка клуба
}

/** Данные для фискального чека, если провайдер шлёт его сам (ЮKassa). */
export interface ReceiptData {
  items: ReceiptItem[]
  customerEmail?: string
  customerPhone?: string
}

/** Результат создания платежа: QR-строка СБП и/или ссылка на платёжную страницу. */
export interface SbpCreateResult {
  transactionId: string
  /** Сырая СБП-payload-строка для рендера в QR-картинку (Т-Банк/ЮKassa). */
  qrString?: string
  /** Ссылка на платёжную страницу провайдера (Сбер/Альфа RBS отдают formUrl). */
  redirectUrl?: string
}

export interface SbpStatusResult {
  status: PayStatus
  /** Фактическая сумма по данным провайдера, рубли (для серверной сверки). */
  amount?: number
}

/** Результат верификации входящего вебхука провайдера. */
export interface WebhookVerifyResult {
  /** Подпись/аутентичность вебхука прошла проверку. */
  ok: boolean
  status?: PayStatus
  transactionId?: string
  /** Наш идентификатор чека (передаётся в metadata/OrderId/DATA при создании). */
  checkId?: string
  /** Сумма из тела вебхука, рубли. */
  amount?: number
  /** HTTP-ответ, который ждёт именно этот провайдер (Т-Банк ждёт тело "OK"). */
  ackBody?: string
}

export interface CreatePaymentArgs {
  creds: ProviderCreds
  /** Полная сумма к списанию с гостя (товары+аренда+чаевые+надбавка), рубли. */
  amount: number
  /** Наш id чека — кладётся в metadata/OrderId для сопоставления в вебхуке. */
  checkId: string
  description: string
  /** Абсолютный URL приёма вебхука: /api/pay/<id>/webhook. */
  notificationUrl: string
  /** Куда вернуть гостя после оплаты на платёжной странице (Сбер/Альфа). */
  returnUrl?: string
  /** Фискальный чек 54-ФЗ, если провайдер шлёт его сам (ЮKassa). */
  receipt?: ReceiptData
  /** Песочница провайдера (тестовый контур) вместо боевого. */
  test?: boolean
}

/** Контракт эквайера. Каждый банк реализует это в providers/<id>.ts. */
export interface SbpProvider {
  /** Стабильный id (часть пути вебхука /api/pay/<id>/webhook). */
  id: string
  label: string
  /** Ключи INTEGRATION_KEYS, которые заведение вводит в мастере. */
  credKeys: string[]
  /** Может ли провайдер сам отправить фискальный чек 54-ФЗ (ЮKassa — да). */
  supportsReceipt: boolean
  createSbpPayment(args: CreatePaymentArgs): Promise<SbpCreateResult>
  fetchStatus(args: { creds: ProviderCreds; transactionId: string; test?: boolean }): Promise<SbpStatusResult>
  verifyWebhook(args: {
    headers: Record<string, string | undefined>
    rawBody: string
    creds: ProviderCreds
  }): Promise<WebhookVerifyResult>
}
