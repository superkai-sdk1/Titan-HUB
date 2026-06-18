/**
 * Геосаджест (Яндекс) — прокси подсказок адресов. GET /api/geo/suggest?text=...
 *
 * Ключ Яндекса хранится в integrations (пер-клуб, зашифрован) и НЕ уходит в браузер —
 * запрос к Яндексу делает сервер. Публичный (монтируется ДО requireActiveSubscription),
 * т.к. используется и на публичной странице бронирования /book; защищён пер-IP лимитом
 * (бережём квоту ключа). Без ключа → { enabled:false } — поле работает как обычный ввод.
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../types.js'
import { getClubIntegration } from '../../lib/secrets.js'
import { clientIp } from '../../lib/clientIp.js'
import { getSharedRedis } from '../../lib/redis.js'

export const geoRouter = new Hono<AppEnv>()

geoRouter.get('/suggest', async (c) => {
  const db = c.var.db
  const key = await getClubIntegration(db, 'yandex_geosuggest_key').catch(() => null)
  if (!key) return c.json({ enabled: false, suggestions: [] })

  const text = (c.req.query('text') ?? '').trim()
  if (text.length < 3) return c.json({ enabled: true, suggestions: [] })

  // Пер-IP лимит (публичный эндпоинт → защита квоты ключа от перебора).
  try {
    const r = getSharedRedis()
    const k = `geosuggest:${clientIp(c)}`
    const n = await r.incr(k)
    if (n === 1) await r.expire(k, 60)
    if (n > 120) return c.json({ enabled: true, suggestions: [] })
  } catch { /* нет Redis — лимит не критичен, продолжаем */ }

  try {
    const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${encodeURIComponent(key)}`
      + `&text=${encodeURIComponent(text)}&lang=ru_RU&results=7&types=geo&print_address=1`
    const res = await fetch(url)
    if (!res.ok) return c.json({ enabled: true, suggestions: [] })
    const data = (await res.json()) as { results?: any[] }
    const suggestions = (data.results ?? []).map((r) => {
      const title = r?.title?.text ?? ''
      const subtitle = r?.subtitle?.text ?? ''
      const formatted = r?.address?.formatted_address
        ?? (Array.isArray(r?.address?.component) ? r.address.component.map((x: any) => x?.name).filter(Boolean).join(', ') : '')
      const value = formatted || [subtitle, title].filter(Boolean).join(', ') || title
      return { title, subtitle, value }
    }).filter((s) => s.value)
    return c.json({ enabled: true, suggestions })
  } catch (e) {
    console.error('[geosuggest] error', e)
    return c.json({ enabled: true, suggestions: [] })
  }
})
