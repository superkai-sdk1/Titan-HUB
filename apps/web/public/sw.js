/**
 * Titan HUB — Service Worker (basic offline support)
 *
 * Стратегии:
 *  - Static assets (`/_next/static/`): cache-first (immutable build hashes)
 *  - HTML и API: network-first с fallback на кэш
 *  - Picture/font: cache-first
 *
 * Версионирование: при изменении CACHE_VERSION пересоздаём кэш.
 */
const CACHE_VERSION = 'v31'
const STATIC_CACHE = `titan-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `titan-runtime-${CACHE_VERSION}`

self.addEventListener('install', (event) => {
  // Не предзагружаем — кэшируем по факту использования
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Удаляем устаревшие версии кэша
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Не вмешиваемся в WebSocket, SSE, POST/PUT/DELETE
  if (request.method !== 'GET') return
  if (url.pathname.includes('/notifications/stream')) return
  if (request.headers.get('accept')?.includes('text/event-stream')) return

  // Static: cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // API: network-first, fallback to cache for GET requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, 5000))
    return
  }

  // Прочее (HTML, JSON, изображения) — network-first с fallback кэшем
  event.respondWith(networkFirst(request, RUNTIME_CACHE, 8000))
})

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, res.clone())
    }
    return res
  } catch (e) {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName)
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch (e) {
    const cached = await cache.match(request)
    if (cached) return cached
    // Для HTML — отдаём fallback страницу (если есть)
    if (request.headers.get('accept')?.includes('text/html')) {
      const offlinePage = await cache.match('/offline')
      if (offlinePage) return offlinePage
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
}
