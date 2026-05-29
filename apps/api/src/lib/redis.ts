import { Redis } from 'ioredis'

// Единый Redis-клиент на процесс (вместо new Redis на каждый запрос).
// Используется для проверки отзыва токенов в auth-middleware.
let client: Redis | null = null

export function getSharedRedis(): Redis {
  if (!client) {
    client = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    })
    // Не роняем процесс на ошибках соединения — потребители обрабатывают сами.
    client.on('error', () => {})
  }
  return client
}
