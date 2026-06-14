import { appSettings, eq, type Database } from '@titan/database'

// ─────────────────────────────────────────────────────────────────────────────
// Ростер «увиденных» Telegram-пользователей клуба. Telegram Bot API НЕ умеет
// выгружать всех участников чата, поэтому бот копит тех, кого реально видит:
// проголосовавших в опросах (poll_answer), писавших в чат (бот-админ видит
// сообщения), вошедших. Из этого списка владелец сопоставляет клиентов с TG.
//
// Хранение — JSON в app_settings клуба (ключ tg_roster), без отдельной таблицы/
// миграции (раннер миграций не ходит по клуб-БД; app_settings есть везде).
// Писатель один (бот, последовательно) → гонок нет. Лимит на размер + дедуп.
// ─────────────────────────────────────────────────────────────────────────────

export const TG_ROSTER_KEY = 'tg_roster'
const MAX_ROSTER = 2000
// Не переписываем JSON, если того же пользователя видели недавно (троттлинг записи).
const REFRESH_MS = 60 * 60 * 1000

export interface RosterUser {
  tgId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  chatId: string | null
  lastSeen: string // ISO
}

export interface TgUserLike {
  id: number | string
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  is_bot?: boolean
}

export async function readRoster(db: Database): Promise<RosterUser[]> {
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, TG_ROSTER_KEY))
    if (!row?.value) return []
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? (parsed as RosterUser[]) : []
  } catch {
    return []
  }
}

async function writeRoster(db: Database, list: RosterUser[]): Promise<void> {
  const value = JSON.stringify(list)
  const [ex] = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, TG_ROSTER_KEY))
  if (ex) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, TG_ROSTER_KEY))
  else await db.insert(appSettings).values({ key: TG_ROSTER_KEY, value })
}

/**
 * Зафиксировать пользователя в ростере. Боты и анонимные — пропускаются. Если
 * пользователь уже виден недавно (< REFRESH_MS) и ник/имя не изменились — НЕ
 * переписываем JSON (троттлинг). Возвращает true, если запись изменилась.
 */
export async function upsertRosterUser(
  db: Database,
  u: TgUserLike | null | undefined,
  chatId: string | number | null,
): Promise<boolean> {
  if (!u || u.is_bot) return false
  const tgId = String(u.id)
  if (!tgId || tgId === 'undefined') return false

  const list = await readRoster(db)
  const now = Date.now()
  const idx = list.findIndex((r) => r.tgId === tgId)
  const next: RosterUser = {
    tgId,
    username: u.username ?? null,
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    chatId: chatId != null ? String(chatId) : (idx >= 0 ? list[idx]!.chatId : null),
    lastSeen: new Date(now).toISOString(),
  }

  if (idx >= 0) {
    const cur = list[idx]!
    const seenMs = new Date(cur.lastSeen).getTime()
    const sameMeta = cur.username === next.username && cur.firstName === next.firstName && cur.lastName === next.lastName && cur.chatId === next.chatId
    if (sameMeta && !Number.isNaN(seenMs) && now - seenMs < REFRESH_MS) return false // троттлинг
    list[idx] = next
  } else {
    list.push(next)
  }

  // Лимит: оставляем самых недавних.
  list.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
  const capped = list.slice(0, MAX_ROSTER)
  await writeRoster(db, capped)
  return true
}

// Список для UI: самые недавние сверху.
export async function listRoster(db: Database): Promise<RosterUser[]> {
  const list = await readRoster(db)
  return list.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
}
