import webpush from 'web-push'
import { Redis } from 'ioredis'
import {
  db, notifications, userNotificationSettings, pushSubscriptions, profiles,
  eq, and, inArray, isNull,
} from '@titan/database'

const NOTIF_CHANNEL = 'titan:staff-notifications'

// ── VAPID init ─────────────────────────────────────────────────────────────
// Поднимаем web-push только если есть все три переменные. Иначе sendWebPush —
// no-op: приложение должно работать (SSE-уведомления + запись в БД) даже без
// настроенного push.
const VAPID_PUBLIC = process.env['VAPID_PUBLIC_KEY']
const VAPID_PRIVATE = process.env['VAPID_PRIVATE_KEY']
const VAPID_SUBJECT = process.env['VAPID_SUBJECT']
let pushEnabled = false

if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    pushEnabled = true
  } catch (err) {
    console.warn('[push] Не удалось инициализировать VAPID, web push отключён:', err)
  }
} else {
  console.warn('[push] VAPID_* переменные не заданы — web push отключён (no-op).')
}

// ── Типы уведомлений ───────────────────────────────────────────────────────
export interface NotificationTypeDef {
  key: string
  label: string
  description: string
  defaultEnabled: boolean
}

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  { key: 'staff_call', label: 'Вызов персонала', description: 'Гость вызывает персонал с планшета', defaultEnabled: true },
  { key: 'request_bill', label: 'Запрос счёта', description: 'Гость запрашивает счёт с планшета', defaultEnabled: true },
  { key: 'shift_open', label: 'Открытие смены', description: 'Смена открыта', defaultEnabled: true },
  { key: 'shift_close', label: 'Закрытие смены', description: 'Смена закрыта', defaultEnabled: true },
  { key: 'cash_discrepancy', label: 'Расхождение в кассе', description: 'Излишек или недостача наличных', defaultEnabled: true },
  { key: 'check_paid', label: 'Оплата чека', description: 'Чек оплачен и закрыт', defaultEnabled: false },
  { key: 'large_check', label: 'Крупный чек', description: 'Оплачен чек на крупную сумму', defaultEnabled: true },
  { key: 'low_stock', label: 'Низкий остаток на складе', description: 'Остаток товара упал ниже порога', defaultEnabled: true },
  { key: 'refund', label: 'Возврат', description: 'Оформлен возврат по чеку', defaultEnabled: true },
  { key: 'birthday', label: 'День рождения клиента', description: 'У клиента сегодня день рождения', defaultEnabled: true },
  { key: 'check_opened', label: 'Новый чек', description: 'Открыт новый чек', defaultEnabled: false },
  { key: 'rental_started', label: 'Аренда зоны начата', description: 'Начата аренда игровой зоны', defaultEnabled: true },
  { key: 'deposit_topup', label: 'Пополнение депозита', description: 'Клиент пополнил баланс депозита', defaultEnabled: false },
  { key: 'debt_created', label: 'Новый долг клиента', description: 'У клиента образовался долг', defaultEnabled: true },
  { key: 'certificate_used', label: 'Сертификат использован', description: 'При оплате использован сертификат', defaultEnabled: false },
  { key: 'event_created', label: 'Создано мероприятие', description: 'Создано новое мероприятие', defaultEnabled: true },
  { key: 'event_completed', label: 'Мероприятие завершено', description: 'Мероприятие завершено', defaultEnabled: false },
  { key: 'new_client', label: 'Новый клиент', description: 'Зарегистрирован новый клиент', defaultEnabled: false },
  { key: 'supply_received', label: 'Приход на склад', description: 'Оформлен приход товара на склад', defaultEnabled: true },
  { key: 'large_refund', label: 'Крупный возврат', description: 'Оформлен возврат на крупную сумму', defaultEnabled: true },
]

const DEFAULT_ENABLED: Record<string, boolean> = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t.key, t.defaultEnabled]),
)

function getNotifRedis() {
  return new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', { lazyConnect: true })
}

// ── Telegram-канал ─────────────────────────────────────────────────────────
// Шлём через Bot API напрямую (токен админ-бота доступен API через env_file).
// No-op, если токен не задан. Никогда не бросает.
const TG_TOKEN = process.env['ADMIN_BOT_TOKEN']
async function sendTelegram(tgId: string, text: string): Promise<void> {
  if (!TG_TOKEN || !tgId) return
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tgId, text, disable_web_page_preview: true }),
    })
  } catch (err) {
    console.warn('[push] telegram send error:', err)
  }
}

// Слать ли в Telegram этому пользователю по этому типу: только если явно включено
// (telegram=true) в настройках. По умолчанию Telegram-доставка ВЫКЛ (opt-in).
function isTelegramEnabledForUser(
  type: string,
  settings: { types?: Record<string, { enabled: boolean; channel?: string; telegram?: boolean }> | null } | undefined,
): boolean {
  return settings?.types?.[type]?.telegram === true
}

// Решение «слать ли push этому пользователю по этому типу»: берём настройку
// userNotificationSettings.types[type].enabled, иначе — defaultEnabled типа,
// иначе (неизвестный тип) — true.
function isTypeEnabledForUser(
  type: string,
  settings: { types?: Record<string, { enabled: boolean; channel?: string; telegram?: boolean }> | null } | undefined,
): boolean {
  const t = settings?.types?.[type]
  if (t && typeof t.enabled === 'boolean') return t.enabled
  if (type in DEFAULT_ENABLED) return DEFAULT_ENABLED[type]!
  return true
}

// Низкоуровневая отправка одной подписке. Возвращает 'pruned', если подписка
// мертва (404/410) и была удалена.
async function sendToSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<void> {
  if (!pushEnabled) return
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    )
  } catch (err: any) {
    const status = err?.statusCode
    if (status === 404 || status === 410) {
      // Подписка протухла — чистим, чтобы не слать впустую.
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).catch(() => {})
    } else {
      console.warn('[push] sendNotification error:', status, err?.body ?? err?.message ?? err)
    }
  }
}

function buildPushPayload(opts: {
  type: string
  title: string
  body: string
  meta?: Record<string, unknown>
}): string {
  const meta = opts.meta ?? {}
  // Deep link: если в meta есть готовый url — берём его, иначе пытаемся собрать
  // из известных идентификаторов, иначе '/'.
  let url = '/'
  if (typeof meta['url'] === 'string') {
    url = meta['url'] as string
  } else if (typeof meta['checkId'] === 'string') {
    url = `/pos/checks/${meta['checkId']}`
  } else if (typeof meta['itemId'] === 'string') {
    url = '/inventory'
  }
  return JSON.stringify({
    title: opts.title,
    body: opts.body,
    type: opts.type,
    meta,
    url,
  })
}

// Отправить push конкретному пользователю по всем его подпискам.
async function sendWebPushToUser(
  userId: string,
  payload: string,
): Promise<void> {
  if (!pushEnabled) return
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
  await Promise.all(subs.map((s) => sendToSubscription(s, payload)))
}

/**
 * Единая точка отправки уведомления:
 *  1) пишем строку в notifications (userId = opts.userId ?? null = broadcast);
 *  2) публикуем в Redis-канал SSE (та же форма, что и старый publishStaffNotification);
 *  3) шлём web push получателям с учётом их настроек типов.
 *
 * notify НИКОГДА не бросает наверх — все ошибки логируются. Вызывать
 * fire-and-forget: `void notify(...).catch(() => {})`.
 */
export async function notify(opts: {
  type: string
  title: string
  body: string
  meta?: Record<string, unknown>
  userId?: string | null
}): Promise<void> {
  const targetUserId = opts.userId ?? null
  try {
    // 1) Persist
    const [row] = await db
      .insert(notifications)
      .values({
        type: opts.type,
        title: opts.title,
        body: opts.body,
        meta: opts.meta ?? {},
        userId: targetUserId,
      })
      .returning()

    // 2) Redis SSE (та же форма, что использовал publishStaffNotification)
    if (row) {
      const redis = getNotifRedis()
      try {
        await redis.connect()
        await redis.publish(
          NOTIF_CHANNEL,
          JSON.stringify({
            id: row.id,
            type: row.type,
            title: row.title,
            body: row.body,
            meta: row.meta,
            createdAt: row.createdAt,
          }),
        )
      } catch (err) {
        console.warn('[push] redis publish error:', err)
      } finally {
        redis.disconnect()
      }
    }

    // 3) Доставка по каналам (web push + Telegram). Каналы независимы:
    //    Telegram работает даже без настроенного VAPID.
    const tgText = `🔔 ${opts.title}\n${opts.body}`

    // Спец-тип 'test' — только самому пользователю, без проверки настроек типов.
    if (opts.type === 'test') {
      if (targetUserId) {
        const payload = buildPushPayload(opts)
        if (pushEnabled) await sendWebPushToUser(targetUserId, payload)
        const [p] = await db.select({ tgId: profiles.tgId }).from(profiles).where(eq(profiles.id, targetUserId))
        if (p?.tgId) await sendTelegram(p.tgId, tgText)
      }
      return
    }

    // Получатели: конкретный user или broadcast → весь персонал.
    let recipientIds: string[]
    if (targetUserId) {
      recipientIds = [targetUserId]
    } else {
      const staff = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.role, ['owner', 'staff']), isNull(profiles.deletedAt)))
      recipientIds = staff.map((s) => s.id)
    }
    if (!recipientIds.length) return

    // Настройки типов + tgId получателей одним проходом.
    const settingsRows = await db
      .select()
      .from(userNotificationSettings)
      .where(inArray(userNotificationSettings.userId, recipientIds))
    const settingsByUser = new Map(settingsRows.map((s) => [s.userId, s]))
    const profRows = await db
      .select({ id: profiles.id, tgId: profiles.tgId })
      .from(profiles)
      .where(inArray(profiles.id, recipientIds))
    const tgByUser = new Map(profRows.map((p) => [p.id, p.tgId]))

    // Web push — по настройке enabled.
    if (pushEnabled) {
      const payload = buildPushPayload(opts)
      const enabledIds = recipientIds.filter((uid) => isTypeEnabledForUser(opts.type, settingsByUser.get(uid)))
      await Promise.all(enabledIds.map((uid) => sendWebPushToUser(uid, payload)))
    }

    // Telegram — по настройке telegram + наличию привязки.
    const tgRecipients = recipientIds.filter(
      (uid) => isTelegramEnabledForUser(opts.type, settingsByUser.get(uid)) && tgByUser.get(uid),
    )
    await Promise.all(tgRecipients.map((uid) => sendTelegram(tgByUser.get(uid)!, tgText)))
  } catch (err) {
    // notify не должен ронять вызывающий код ни при каких условиях.
    console.error('[push] notify failed:', err)
  }
}
