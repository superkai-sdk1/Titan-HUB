// ─────────────────────────────────────────────────────────────────────────────
// Резолвер клуба по Host (database-per-club). Используется в middleware
// tenantContext: по поддомену <slug>.<ROOT_DOMAIN> находит запись клуба в
// control-plane и строит строку подключения к его app-БД.
//
// Цели:
//   • Быстрый путь для основного/служебного домена — БЕЗ обращения к control-БД
//     (см. isDefaultHost): поведение на titanpos.ru идентично прежнему синглтону.
//   • Кэш host→клуб с коротким TTL, чтобы не бить control-БД на каждый запрос
//     (кэшируем и «нет такого клуба» = null, чтобы не долбить БД промахами).
//
// Control-БД импортируется по относительному пути к собранному dist (закрытый
// exports-map пакета @titan/database не публикует subpath) — тот же приём, что в
// sibling-модулях superadmin (../../../../../packages/.../control/index.js от
// modules/superadmin; отсюда, из src/lib, корректный путь — '../../../../packages/...').
// ─────────────────────────────────────────────────────────────────────────────
import {
  getControlDb,
  clubs,
  eq,
} from '../../../../packages/database/dist/control/index.js'

// Базовый домен платформы. На нём (и служебных поддоменах) — дефолтный синглтон.
const ROOT_DOMAIN = (process.env['ROOT_DOMAIN'] || 'titanpos.ru').toLowerCase()

// Служебные поддомены первого уровня (НЕ клубы): admin → суперадмин-контур.
const RESERVED_LABELS = new Set(['admin'])

// Резолвленный клуб (минимум для подстановки БД).
export interface ResolvedClub {
  id: string
  slug: string
  dbName: string
}

// ─── Кэш host → клуб (или null = «нет такого клуба») с коротким TTL ──────────
interface CacheEntry {
  value: ResolvedClub | null
  expiresAt: number
}
const CACHE_TTL_MS = 60_000 // 60с: компромисс «свежесть реестра ↔ нагрузка на control-БД»
const cache = new Map<string, CacheEntry>()

/**
 * Нормализовать Host: нижний регистр, убрать порт (':3000') и завершающую точку.
 * Пустой/отсутствующий host → пустая строка.
 */
export function normalizeHost(rawHost: string | undefined | null): string {
  if (!rawHost) return ''
  let h = rawHost.trim().toLowerCase()
  // Отрезаем порт. Осторожно с IPv6 в скобках ('[::1]:3000') — берём до ']' + порт.
  if (h.startsWith('[')) {
    const close = h.indexOf(']')
    if (close !== -1) h = h.slice(0, close + 1)
  } else {
    const colon = h.indexOf(':')
    if (colon !== -1) h = h.slice(0, colon)
  }
  // Завершающая точка в FQDN ('club.titanpos.ru.') — нормализуем.
  if (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

/**
 * Похоже ли на IP-адрес (IPv4 или IPv6) — такие хосты в быстрый путь (дефолт).
 */
function isIpAddress(host: string): boolean {
  if (host.startsWith('[') || host.includes(':')) return true // IPv6 (в скобках или с ':')
  // IPv4: четыре числовые группы.
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

/**
 * БЫСТРЫЙ ПУТЬ: основной/служебный домен → дефолтный синглтон (club=null),
 * БЕЗ обращения к control-БД. Сюда относятся:
 *   • пусто;
 *   • localhost / IP-адрес (dev, прямой доступ по адресу);
 *   • ровно базовый домен (titanpos.ru) и www.<base>;
 *   • служебные поддомены (admin.<base> — суперадмин).
 *
 * Возвращает true ⇒ middleware должен поставить синглтон и НЕ ходить в control-БД.
 */
export function isDefaultHost(host: string): boolean {
  if (!host) return true
  if (host === 'localhost') return true
  if (isIpAddress(host)) return true
  if (host === ROOT_DOMAIN) return true
  if (host === `www.${ROOT_DOMAIN}`) return true

  // Поддомен базового домена: '<label>.<...>.titanpos.ru'.
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const label = host.slice(0, host.length - ROOT_DOMAIN.length - 1).split('.')[0] ?? ''
    if (RESERVED_LABELS.has(label)) return true
    return false // настоящий поддомен клуба → дефолтным НЕ считаем
  }

  // Host НЕ принадлежит базовому домену (кастомный/неизвестный) → дефолт-синглтон
  // (НЕ резолвим клуб по чужому домену — на шаге 3 это потенциальный риск чужой БД).
  return true
}

/**
 * Извлечь slug (первая метка) из host вида '<slug>.<...>.<ROOT_DOMAIN>'.
 * Пусто, если host не является поддоменом базового домена.
 */
function extractSlug(host: string): string {
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return ''
  const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1)
  return sub.split('.')[0] ?? ''
}

/**
 * Построить строку подключения к app-БД клуба: берём DATABASE_URL и заменяем имя
 * БД (последний сегмент пути) на dbName клуба. Тот же сервер/креды — другая БД
 * (модель database-per-club; ровно как pgEnvFor(..., dbName) в provisioning.ts).
 */
function buildClubConnString(dbName: string): string {
  const base = process.env['DATABASE_URL']
  if (!base) throw new Error('DATABASE_URL не задан (нужен для подключения к БД клуба)')
  const u = new URL(base)
  // pathname = '/<dbname>'; заменяем последний сегмент на dbName клуба.
  u.pathname = `/${dbName}`
  return u.toString()
}

/**
 * Зарезолвить клуб по host через control-БД. Используется ТОЛЬКО для настоящих
 * клубных поддоменов (isDefaultHost(host) === false). Кэширует результат (включая
 * null — «нет такого клуба») на CACHE_TTL_MS.
 *
 * Возвращает:
 *   ResolvedClub — клуб найден и active (вызвавший строит БД и ставит c.var.club);
 *   null         — клуба нет / он не active (middleware отдаёт 404).
 * Бросает — при недоступности control-БД и пр. (middleware ловит → 503).
 */
export async function resolveClubByHost(host: string): Promise<ResolvedClub | null> {
  const now = Date.now()
  const cached = cache.get(host)
  if (cached && cached.expiresAt > now) return cached.value

  const slug = extractSlug(host)
  const control = getControlDb()

  // Ищем по subdomain (точное совпадение host), иначе — по slug (первая метка).
  // Сначала пробуем subdomain (если у клуба задан кастомный subdomain = host),
  // затем slug. Берём только active.
  let row =
    (
      await control
        .select({ id: clubs.id, slug: clubs.slug, dbName: clubs.dbName, status: clubs.status })
        .from(clubs)
        .where(eq(clubs.subdomain, host))
        .limit(1)
    )[0] ?? null

  if (!row && slug) {
    row =
      (
        await control
          .select({ id: clubs.id, slug: clubs.slug, dbName: clubs.dbName, status: clubs.status })
          .from(clubs)
          .where(eq(clubs.slug, slug))
          .limit(1)
      )[0] ?? null
  }

  const resolved: ResolvedClub | null =
    row && row.status === 'active'
      ? { id: row.id, slug: row.slug, dbName: row.dbName }
      : null

  cache.set(host, { value: resolved, expiresAt: now + CACHE_TTL_MS })
  return resolved
}

// Реэкспорт билдера строки подключения — middleware строит её из dbName клуба.
export { buildClubConnString }
