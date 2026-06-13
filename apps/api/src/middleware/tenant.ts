import { createMiddleware } from 'hono/factory'
import { db, getClubDb } from '@titan/database'
import type { AppEnv } from '../types.js'
import {
  normalizeHost,
  isDefaultHost,
  resolveClubByHost,
  buildClubConnString,
} from '../lib/clubResolver.js'

/**
 * tenantContext — инжектит в запрос БД клуба (c.var.db) и его описание (c.var.club).
 *
 * Резолюция арендатора по поддомену (database-per-club):
 *
 *  1. БЫСТРЫЙ ПУТЬ (isDefaultHost) — основной/служебный домен (пусто, localhost, IP,
 *     ровно titanpos.ru, www.<base>, admin.<base>): ставим ДЕФОЛТНЫЙ синглтон `db`
 *     (club=null) БЕЗ единого обращения к control-БД. Поведение на основном домене
 *     остаётся байт-в-байт прежним — это ключевая гарантия безопасности.
 *
 *  2. Иначе host = '<slug>.titanpos.ru' → резолвим клуб через control-plane
 *     (clubs.subdomain / clubs.slug, status='active'; кэш host→клуб с TTL 60с) и
 *     подставляем getClubDb(<строка подключения БД клуба>). Роутеры, читающие
 *     c.var.db, автоматически начинают ходить в БД нужного клуба.
 *
 *  3. Клуб не найден / не active → 404 (поддомен есть, но клуба нет — это НЕ дефолт).
 *
 * FAIL-SAFE: основной домен ушёл в дефолт ДО любых обращений к БД (шаг 1), поэтому
 * сбой резолюции возможен лишь на клубном поддомене. Там при ЛЮБОЙ ошибке отдаём
 * 503 (а НЕ дефолтный синглтон) — чтобы исключить риск показать НЕ ту БД.
 */
export const tenantContext = createMiddleware<AppEnv>(async (c, next) => {
  const host = normalizeHost(c.req.header('host'))

  // 1. Быстрый путь: основной/служебный домен → дефолтный синглтон, без control-БД.
  if (isDefaultHost(host)) {
    c.set('db', db)
    c.set('club', null)
    return next()
  }

  // 2. Клубный поддомен: резолвим клуб. Любая ошибка резолюции → 503 (см. fail-safe).
  let club
  try {
    club = await resolveClubByHost(host)
  } catch (err) {
    // Control-БД недоступна, ошибка парсинга и т.п. На основной домен это НЕ влияет
    // (он ушёл в дефолт на шаге 1). Здесь — НЕ синглтон, иначе риск чужой БД.
    console.error(`[tenant] Ошибка резолюции клуба для host «${host}»:`, err)
    return c.json({ error: 'tenant unavailable' }, 503)
  }

  // 3. Поддомен есть, но клуба нет / он не active → 404 (это не дефолт-домен).
  if (!club) {
    return c.json({ error: 'Клуб не найден' }, 404)
  }

  // Клуб найден: строим строку подключения его app-БД и подставляем инстанс.
  // buildClubConnString может бросить (нет DATABASE_URL) — это тоже fail-safe 503.
  let clubDb
  try {
    const connString = buildClubConnString(club.dbName)
    clubDb = getClubDb(connString)
  } catch (err) {
    console.error(`[tenant] Не удалось подключиться к БД клуба «${club.slug}»:`, err)
    return c.json({ error: 'tenant unavailable' }, 503)
  }

  c.set('db', clubDb)
  c.set('club', {
    id: club.id,
    slug: club.slug,
    name: club.name,
    dbName: club.dbName,
    subscription: club.subscription,
    modules: club.modules,
  })
  return next()
})
