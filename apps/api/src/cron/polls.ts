import { db, type Database } from '@titan/database'
import { getClubIntegration } from '../lib/secrets.js'
import { readPollConfigs, writePollConfigs, isPollDue, postPollConfig } from '../lib/polls.js'

// ─────────────────────────────────────────────────────────────────────────────
// Постинг регулярных опросов в Telegram. Вызывается планировщиком (index.ts)
// КАЖДУЮ МИНУТУ по всем активным клубам + основной БД. Для каждого клуба читает
// его конфиги (app_settings.poll_configs) и токен (integrations.poll_bot_token);
// постит «созревшие» (isPollDue) и сохраняет lastPostedAt. НЕ бросает наружу.
// database — БД клуба; дефолт = синглтон (одно-клубный режим).
// ─────────────────────────────────────────────────────────────────────────────
export async function runPollsForDb(database: Database = db): Promise<void> {
  let configs
  try {
    configs = await readPollConfigs(database)
  } catch {
    return
  }
  if (!configs.length) return

  const now = Date.now()
  const due = configs.filter((c) => isPollDue(c, now))
  if (!due.length) return

  const token = await getClubIntegration(database, 'poll_bot_token').catch(() => null)
  if (!token) {
    console.error('[polls] есть опросы к постингу, но poll_bot_token не задан — пропуск')
    return
  }

  let changed = false
  for (const cfg of due) {
    const r = await postPollConfig(token, cfg)
    if (r.ok) {
      cfg.lastPostedAt = new Date().toISOString()
      changed = true
      console.log(`[polls] опрос «${cfg.title}» отправлен в ${cfg.chatId}${cfg.threadId ? `/${cfg.threadId}` : ''}`)
    } else {
      console.error(`[polls] не удалось отправить «${cfg.title}» (${cfg.chatId}): ${r.error}`)
    }
  }
  if (changed) {
    try {
      await writePollConfigs(database, configs)
    } catch (e) {
      console.error('[polls] не удалось сохранить lastPostedAt', e)
    }
  }
}
