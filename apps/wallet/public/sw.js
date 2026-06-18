/**
 * Titan Resident — Service Worker (офлайн-оболочка + заготовка Web Push)
 *
 * Контекст: consumer-PWA `apps/wallet` собран с basePath `/residents`
 * (см. next.config.ts). Файл отдаётся как /residents/sw.js, поэтому максимальный
 * скоуп воркера — /residents/. ВСЕ пути к кэшу/ассетам прописаны с этим префиксом
 * (assetPrefix кладёт чанки в /residents/_next/static/...).
 *
 * Стратегии fetch:
 *  - Навигации (HTML): network-first → при офлайне фолбэк на закэшированную
 *    оболочку (устраняет белый экран при потере сети у барной стойки);
 *  - Статика /residents/_next/static/: cache-first (имена с build-хэшем,
 *    содержимое иммутабельно);
 *  - Иконки/манифест и прочие GET: cache-first с дозаписью (stale-while-ok);
 *  - /api/*: НЕ перехватываем (network-only) — балансы/чеки/деньги должны быть
 *    свежими и не должны оседать в кэше (приватность на общем устройстве).
 *
 * Версионирование: бампим CACHE_VERSION при каждом фронт-деплое, старые кэши
 * чистятся в activate.
 *
 * Управляемое обновление: НЕ делаем безусловный skipWaiting() в install — иначе
 * новый воркер активируется под открытой сессией и роняет её при деплое. Вместо
 * этого ждём команду {type:'SKIP_WAITING'} от клиента (см. SwRegister.tsx),
 * а клиент перезагружается по событию controllerchange.
 */
const CACHE_VERSION = 'rv1'
const STATIC_CACHE = `resident-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `resident-runtime-${CACHE_VERSION}`

// Префикс приложения — должен совпадать с basePath/assetPrefix в next.config.ts.
const BASE = '/residents'

// App-shell: минимальный набор для запуска офлайна. Корневой документ кэшируем
// сразу, чтобы при первом же офлайне отдать оболочку вместо белого экрана.
const APP_SHELL = [
  `${BASE}`,
  `${BASE}/`,
  `${BASE}/manifest.json`,
  `${BASE}/favicon.svg`,
  `${BASE}/favicon-32.png`,
  `${BASE}/apple-touch-icon.png`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`,
  `${BASE}/icon-512-maskable.png`,
]

self.addEventListener('install', (event) => {
  // Предзагружаем оболочку, но НЕ вызываем skipWaiting — обновление управляемое.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // addAll падает целиком при одном 404 — кладём пермиссивно по одному.
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => {
            /* ассета может не быть — не валим установку */
          })
        )
      )
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Удаляем кэши прошлых версий.
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// Команда от клиента: активировать ожидающего воркера прямо сейчас (после того,
// как пользователь принял обновление). Триггерит controllerchange на клиенте.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Только GET и только свой origin — чужие домены (telegram.org SDK, эквайеры)
  // не трогаем.
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // SSE/стримы — мимо воркера.
  if (request.headers.get('accept')?.includes('text/event-stream')) return

  // API: network-only. Деньги/баланс не кэшируем и не отдаём из кэша.
  if (url.pathname.startsWith('/api/')) return

  // Статика сборки: cache-first (иммутабельные хэш-имена).
  if (url.pathname.startsWith(`${BASE}/_next/static/`)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // Навигации (открытие страницы): network-first с фолбэком на оболочку.
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }

  // Прочие same-origin GET (иконки, манифест, картинки): cache-first с дозаписью.
  event.respondWith(cacheFirst(request, RUNTIME_CACHE))
})

// ─── Web Push (заготовка) ─────────────────────────────────────────────────────
// Подписку на push здесь НЕ оформляем (нет VAPID-ключей) — это сервер-готовые
// обработчики: когда бэкенд начнёт слать push, уведомления заработают без правок SW.

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = {}
  }
  const title = payload.title || 'Titan Resident'
  const body = payload.body || ''
  // url приходит относительным/абсолютным; по умолчанию — корень PWA c basePath.
  const url = payload.url || `${BASE}/`
  // Тег группирует уведомления на уровне ОС: новое по тому же объекту заменяет
  // прежнее, а не плодит дубли.
  const tag = (payload.meta && payload.meta.groupKey) || payload.type || undefined
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: `${BASE}/icon-192.png`,
      badge: `${BASE}/icon-192.png`,
      data: { url, meta: payload.meta },
      tag,
      renotify: !!tag,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || `${BASE}/`
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Уже открыта вкладка PWA — фокусируем её (и по возможности ведём на target).
      for (const c of list) {
        if ('focus' in c) {
          try {
            await c.navigate?.(target)
          } catch (e) {
            /* navigate может отклониться для кросс-скоуп URL — просто фокус */
          }
          return c.focus()
        }
      }
      // Иначе открываем новое окно.
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })()
  )
})

// ─── Хелперы стратегий ────────────────────────────────────────────────────────

/** Навигация: пробуем сеть, при сбое — закэшированный документ или оболочка. */
async function navigationHandler(request) {
  const cache = await caches.open(STATIC_CACHE)
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      // Обновляем закэшированную оболочку свежим документом.
      cache.put(request, res.clone())
    }
    return res
  } catch (e) {
    // Офлайн: отдаём ранее закэшированную версию этого URL…
    const cached = await cache.match(request)
    if (cached) return cached
    // …или корневую оболочку PWA (любой из вариантов basePath).
    const shell =
      (await cache.match(`${BASE}/`)) ||
      (await cache.match(`${BASE}`)) ||
      (await caches.match(`${BASE}/`))
    if (shell) return shell
    return new Response('Офлайн', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

/** Cache-first: отдаём из кэша, иначе тянем из сети и дозаписываем. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, res.clone())
    }
    return res
  } catch (e) {
    return new Response('Офлайн', { status: 503 })
  }
}
