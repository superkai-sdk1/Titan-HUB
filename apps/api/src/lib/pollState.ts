import { appSettings, eq, type Database } from '@titan/database'

// ─────────────────────────────────────────────────────────────────────────────
// Состояние опросов для команды @tvari: последний опрос каждого чата + кто в нём
// проголосовал. Хранится в app_settings клуба (ключ poll_state), без миграции.
// Голоса приходят на вебхук бота (poll_answer, неанонимные опросы). @tvari =
// ростер чата минус проголосовавшие в последнем опросе.
//
// ВАЖНО: при бурном голосовании возможны редкие гонки read-modify-write JSON —
// @tvari приблизителен (может изредка включить/пропустить недавно проголосовавшего).
// Для бытового сценария приемлемо.
// ─────────────────────────────────────────────────────────────────────────────

export const POLL_STATE_KEY = 'poll_state'

interface LastPoll {
  pollId: string
  messageId: number
  postedAt: string
  threadId: number | null
}
interface PollState {
  lastByChat: Record<string, LastPoll> // chatId → последний опрос
  votersByPoll: Record<string, Record<string, string>> // pollId → { tgId: votedAtISO }
}

async function read(db: Database): Promise<PollState> {
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, POLL_STATE_KEY))
    if (!row?.value) return { lastByChat: {}, votersByPoll: {} }
    const p = JSON.parse(row.value)
    return { lastByChat: p?.lastByChat ?? {}, votersByPoll: p?.votersByPoll ?? {} }
  } catch {
    return { lastByChat: {}, votersByPoll: {} }
  }
}

async function write(db: Database, s: PollState): Promise<void> {
  const value = JSON.stringify(s)
  const [ex] = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, POLL_STATE_KEY))
  if (ex) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, POLL_STATE_KEY))
  else await db.insert(appSettings).values({ key: POLL_STATE_KEY, value })
}

// Зафиксировать факт публикации опроса (он становится «последним» для чата).
// Чистим голоса опросов, которые больше не являются «последними» (ограничение размера).
export async function recordPollPosted(
  db: Database,
  chatId: string | number,
  pollId: string,
  messageId: number,
  threadId: number | null,
): Promise<void> {
  const s = await read(db)
  s.lastByChat[String(chatId)] = { pollId, messageId, postedAt: new Date().toISOString(), threadId: threadId ?? null }
  if (!s.votersByPoll[pollId]) s.votersByPoll[pollId] = {}
  const keep = new Set(Object.values(s.lastByChat).map((l) => l.pollId))
  for (const pid of Object.keys(s.votersByPoll)) if (!keep.has(pid)) delete s.votersByPoll[pid]
  await write(db, s)
}

// Зафиксировать/снять голос (option_ids пустой = отозвал голос).
export async function recordVote(db: Database, pollId: string, tgId: string, optionIds: unknown): Promise<void> {
  const s = await read(db)
  if (!s.votersByPoll[pollId]) s.votersByPoll[pollId] = {}
  if (Array.isArray(optionIds) && optionIds.length === 0) {
    delete s.votersByPoll[pollId]![tgId]
  } else {
    s.votersByPoll[pollId]![tgId] = new Date().toISOString()
  }
  await write(db, s)
}

export async function lastPollForChat(db: Database, chatId: string | number): Promise<LastPoll | null> {
  const s = await read(db)
  return s.lastByChat[String(chatId)] ?? null
}

export async function votersOfPoll(db: Database, pollId: string): Promise<Set<string>> {
  const s = await read(db)
  return new Set(Object.keys(s.votersByPoll[pollId] ?? {}))
}
