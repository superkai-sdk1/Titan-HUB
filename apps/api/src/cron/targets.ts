import { db, getClubDb, type Database } from '@titan/database'
import { listActiveClubDbNames, buildClubConnString } from '../lib/clubResolver.js'

export interface CronTarget {
  name: string
  db: Database
}

/**
 * Цели фоновых задач (cron): ВСЕ активные клубы + дефолтная БД (DATABASE_URL),
 * дедуп по имени БД.
 *
 *  • Дефолт ВСЕГДА включён → одно-клубный режим / основной клуб (его db_name =
 *    DATABASE_URL) никогда не выпадает из крона. Поведение для основной БД остаётся
 *    прежним (cron как раньше отрабатывает на синглтоне).
 *  • Клуб с db_name = основной БД схлопывается с дефолтом (дедуп) → крон по нему
 *    проходит ОДИН раз на синглтоне (актуально для действующего заведения kbr →
 *    titan_hub: не задваиваем проход).
 *  • При недоступности control-БД — фолбэк = только дефолт (кран продолжает на
 *    основной БД, не падает).
 */
export async function getCronTargets(): Promise<CronTarget[]> {
  let defaultName = ''
  try {
    defaultName = new URL(process.env['DATABASE_URL'] ?? '').pathname.replace(/^\//, '')
  } catch {
    /* нет/битый DATABASE_URL — defaultName останется пустым */
  }

  let clubNames: string[] = []
  try {
    clubNames = await listActiveClubDbNames()
  } catch (e) {
    console.error('[cron] список активных клубов недоступен — работаем по основной БД', e)
  }

  const names = Array.from(new Set([defaultName, ...clubNames].filter(Boolean)))
  const targets: CronTarget[] = []
  for (const name of names) {
    // Дефолтная БД → синглтон db (getClubDb тоже вернул бы синглтон, но не строим conn).
    if (name === defaultName) {
      targets.push({ name: name || 'default', db })
      continue
    }
    try {
      targets.push({ name, db: getClubDb(buildClubConnString(name)) })
    } catch (e) {
      console.error(`[cron] не удалось подключиться к БД клуба «${name}» — пропуск`, e)
    }
  }
  // Никогда не пусто: хотя бы дефолтная БД (даже если DATABASE_URL не распарсился).
  if (targets.length === 0) targets.push({ name: 'default', db })
  return targets
}
