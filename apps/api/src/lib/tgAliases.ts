import { appSettings, eq, type Database } from '@titan/database'

// ─────────────────────────────────────────────────────────────────────────────
// Дополнительные Telegram-аккаунты профиля (один человек — несколько TG, один
// профиль). ОСНОВНОЙ аккаунт остаётся в profiles.tg_id; ДОПОЛНИТЕЛЬНЫЕ — здесь,
// картой tgId → { profileId, username } в app_settings клуба (ключ tg_aliases),
// без миграции (раннер миграций не ходит по клуб-БД; app_settings есть везде).
//
// Резолв TG→профиль: сначала profiles.tg_id, затем эта карта. Формат СИНХРОНЕН с
// дублирующим хелпером в ботах (apps/bot-*/src/bot.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const TG_ALIASES_KEY = 'tg_aliases'

export interface TgAlias {
  profileId: string
  username: string | null
}
export type TgAliasMap = Record<string, TgAlias> // tgId → alias

export async function readAliases(db: Database): Promise<TgAliasMap> {
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, TG_ALIASES_KEY))
    if (!row?.value) return {}
    const parsed = JSON.parse(row.value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as TgAliasMap) : {}
  } catch {
    return {}
  }
}

async function writeAliases(db: Database, map: TgAliasMap): Promise<void> {
  const value = JSON.stringify(map)
  const [ex] = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, TG_ALIASES_KEY))
  if (ex) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, TG_ALIASES_KEY))
  else await db.insert(appSettings).values({ key: TG_ALIASES_KEY, value })
}

// Дополнительные аккаунты конкретного профиля.
export async function aliasesForProfile(db: Database, profileId: string): Promise<{ tgId: string; username: string | null }[]> {
  const map = await readAliases(db)
  return Object.entries(map)
    .filter(([, a]) => a.profileId === profileId)
    .map(([tgId, a]) => ({ tgId, username: a.username }))
}

// profileId, к которому привязан доп. аккаунт tgId (или null).
export async function resolveProfileIdByAlias(db: Database, tgId: string): Promise<string | null> {
  const map = await readAliases(db)
  return map[tgId]?.profileId ?? null
}

export async function addAlias(db: Database, tgId: string, profileId: string, username: string | null): Promise<void> {
  const map = await readAliases(db)
  map[tgId] = { profileId, username }
  await writeAliases(db, map)
}

export async function removeAlias(db: Database, tgId: string): Promise<void> {
  const map = await readAliases(db)
  if (tgId in map) {
    delete map[tgId]
    await writeAliases(db, map)
  }
}
