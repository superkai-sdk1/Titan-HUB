import { api } from '@/lib/api'

/**
 * Web Push (frontend helpers).
 *
 * Поток включения:
 *  1. Спрашиваем разрешение у браузера (Notification.requestPermission()).
 *  2. Берём активную регистрацию service-worker'а.
 *  3. Тянем VAPID public key с бэкенда и конвертируем в Uint8Array.
 *  4. pushManager.subscribe(...) → получаем endpoint + keys (p256dh, auth).
 *  5. Отправляем подписку на бэкенд (POST /notifications/push/subscribe).
 */

export interface PushStatus {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
}

/** Поддерживает ли окружение Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Стандартная конвертация base64url VAPID-ключа в Uint8Array. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  // ready ждёт активный SW; на всякий случай fallback на getRegistration.
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  }
}

/** Текущий статус: поддержка, разрешение и наличие активной подписки. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false }
  }
  const permission = Notification.permission
  let subscribed = false
  try {
    const reg = await getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    subscribed = !!sub
  } catch {
    subscribed = false
  }
  return { supported: true, permission, subscribed }
}

/**
 * Запрашивает разрешение, подписывает на push и регистрирует подписку
 * на бэкенде. Возвращает true при успехе.
 */
export async function enablePush(): Promise<boolean> {
  if (!isPushSupported()) {
    throw new Error('Push-уведомления не поддерживаются этим браузером')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не выдано')
  }

  const reg = await getRegistration()
  if (!reg) throw new Error('Service worker не зарегистрирован')

  const { key } = await api.get<{ key: string }>('/notifications/vapid-public-key')
  if (!key) throw new Error('VAPID-ключ недоступен')

  // Если уже есть подписка — переиспользуем, иначе создаём новую.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    // .buffer (ArrayBuffer) — корректный BufferSource для applicationServerKey;
    // обходит расхождение дженериков Uint8Array<ArrayBufferLike> в lib.dom.
    const appServerKey = urlBase64ToUint8Array(key).buffer as ArrayBuffer
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    })
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const endpoint = json.endpoint ?? sub.endpoint
  await api.post('/notifications/push/subscribe', {
    endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    userAgent: navigator.userAgent,
  })

  return true
}

/** Отписывает устройство: снимает подписку на бэкенде и в браузере. */
export async function disablePush(): Promise<boolean> {
  if (!isPushSupported()) return false
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return false

  // Сначала уведомляем бэкенд, затем отписываемся локально.
  try {
    await api.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint })
  } catch {
    // Даже если бэкенд не ответил — снимаем локальную подписку.
  }
  await sub.unsubscribe()
  return true
}
