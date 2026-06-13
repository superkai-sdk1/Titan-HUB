import { Redis } from 'ioredis'

// ── Изоляция Redis pub/sub каналов реального времени ПО КЛУБУ ────────────────
// База-на-клуб: события/уведомления одного клуба не должны утекать в SSE другого.
// Канал каждого клуба получает суффикс = его clubId. На основном/дефолтном домене
// club=null → суффикс 'default' (и pub, и sub) → для одного клуба канал ИДЕНТИЧЕН
// прежнему поведению (titan:updates:default / titan:staff-notifications:default).
// ВАЖНО: pub и sub для одного клуба ОБЯЗАНЫ использовать один суффикс.

/** Суффикс канала по клубу: clubId либо 'default' (основной/одно-клубный домен). */
export function clubChannelSuffix(clubId: string | null | undefined): string {
  return clubId ?? 'default'
}

/** Канал realtime-обновлений чеков для клуба. */
export function updatesChannel(clubId: string | null | undefined): string {
  return `titan:updates:${clubChannelSuffix(clubId)}`
}

/** Канал уведомлений персонала для клуба. */
export function notifChannel(clubId: string | null | undefined): string {
  return `titan:staff-notifications:${clubChannelSuffix(clubId)}`
}

/**
 * Опубликовать realtime-событие чека в канал клуба.
 * Логика перенесена байт-в-байт из локальных publishEvent в pos.router/platega.router
 * (они дублировались), но канал теперь пер-клубный: updatesChannel(clubId).
 * Никогда не бросает: ошибки глотаются (catch пусто), соединение закрывается в finally.
 */
export function publishEvent(clubId: string | null | undefined, event: string, data: unknown): void {
  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  redis.publish(updatesChannel(clubId), JSON.stringify({ event, data, ts: Date.now() }))
    .finally(() => redis.disconnect())
    .catch(() => {})
}
