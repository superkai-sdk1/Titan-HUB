import { Hono } from 'hono'
import { getClubDb } from '@titan/database'
// Control-БД: относительный путь к dist (как в clubResolver/superadmin).
import {
  getControlDb,
  clubs,
  eq,
} from '../../../../../packages/database/dist/control/index.js'
import { buildClubConnString } from '../../lib/clubResolver.js'
import { tgWebhookSecretValid } from '../../lib/tgWebhook.js'
import { upsertRosterUser, listRosterForChat } from '../../lib/roster.js'
import { recordVote, lastPollForChat, votersOfPoll } from '../../lib/pollState.js'
import { getClubIntegration } from '../../lib/secrets.js'
import { isTelegramChatAdmin, sendTelegramMessage } from '../../lib/telegram.js'
import type { Database } from '@titan/database'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Команды чата @all / @tvari — отметить участников. Только админ чата (анти-спам).
// «Участники» = РОСТЕР этого чата (кого бот видел): полный список Telegram не отдаёт.
// @tvari = ростер минус проголосовавшие в последнем опросе чата.
async function handleMentionCommand(db: Database, msg: any, cmd: 'all' | 'tvari'): Promise<void> {
  const chatId = msg.chat?.id
  const fromId = msg.from?.id
  const threadId = msg.message_thread_id ?? null
  if (!chatId || !fromId) return
  const token = await getClubIntegration(db, 'poll_bot_token').catch(() => null)
  if (!token) return

  if (!(await isTelegramChatAdmin(token, chatId, fromId))) {
    await sendTelegramMessage(token, chatId, 'Команда доступна только администраторам чата.', { messageThreadId: threadId })
    return
  }

  let targets = await listRosterForChat(db, String(chatId))
  let header: string
  if (cmd === 'tvari') {
    const last = await lastPollForChat(db, String(chatId))
    if (!last) {
      await sendTelegramMessage(token, chatId, 'Нет последнего опроса для этого чата.', { messageThreadId: threadId })
      return
    }
    const voters = await votersOfPoll(db, last.pollId)
    targets = targets.filter((u) => !voters.has(u.tgId))
    header = '⚠️ Не отметились в последнем опросе:'
  } else {
    header = '📣 Участники:'
  }

  if (targets.length === 0) {
    await sendTelegramMessage(token, chatId, cmd === 'tvari' ? '✅ Все отметились в опросе!' : 'Список участников пуст (бот ещё никого не видел).', { messageThreadId: threadId })
    return
  }

  // Упоминаем инлайн-ссылкой tg://user?id=… — пингует и тех, у кого нет @username.
  const CHUNK = 50
  for (let i = 0; i < targets.length; i += CHUNK) {
    const part = targets.slice(i, i + CHUNK)
    const mentions = part
      .map((u) => `<a href="tg://user?id=${u.tgId}">${escapeHtml(u.firstName || (u.username ? '@' + u.username : 'участник'))}</a>`)
      .join(' ')
    const text = i === 0 ? `${header}\n${mentions}` : mentions
    await sendTelegramMessage(token, chatId, text, { messageThreadId: threadId, parseMode: 'HTML' })
  }
}

// Распознать команду в первом слове сообщения.
function parseMentionCommand(text: string | undefined): 'all' | 'tvari' | null {
  const first = (text ?? '').trim().split(/\s+/)[0]?.toLowerCase()
  if (first === '@all') return 'all'
  if (first === '@tvari' || first === '@твари') return 'tvari'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Приёмник вебхука бота опросов. Telegram шлёт сюда апдейты (сообщения, входы,
// голоса в опросах) → копим «увиденных» пользователей в ростер клуба (для
// сопоставления клиентов с TG). НЕ для браузера. Защита — secret_token Telegram.
//
// Всегда отвечаем 200 (кроме неверного секрета → 403), чтобы Telegram не ретраил.
// ─────────────────────────────────────────────────────────────────────────────
export const tgRouter = new Hono()

tgRouter.post('/poll-webhook/:clubId', async (c) => {
  const clubId = c.req.param('clubId')
  if (!tgWebhookSecretValid(c.req.header('x-telegram-bot-api-secret-token'), clubId)) {
    return c.json({ ok: false }, 403)
  }

  // Резолвим БД клуба по clubId.
  let dbName: string | null = null
  try {
    const [club] = await getControlDb().select({ dbName: clubs.dbName }).from(clubs).where(eq(clubs.id, clubId)).limit(1)
    dbName = club?.dbName ?? null
  } catch (e) {
    console.error('[tg-webhook] резолв клуба не удался', e)
  }
  if (!dbName) return c.json({ ok: true }) // неизвестный клуб — подтверждаем, не ретраим

  const db = getClubDb(buildClubConnString(dbName))
  const update = (await c.req.json().catch(() => null)) as Record<string, any> | null
  if (!update) return c.json({ ok: true })

  try {
    const msg = update['message'] ?? update['edited_message']
    if (msg) {
      await upsertRosterUser(db, msg.from, msg.chat?.id ?? null)
      if (Array.isArray(msg.new_chat_members)) {
        for (const u of msg.new_chat_members) await upsertRosterUser(db, u, msg.chat?.id ?? null)
      }
      // Команды чата: @all / @tvari (только админ; реагируем на свежие сообщения).
      const cmd = parseMentionCommand(msg.text)
      if (cmd) await handleMentionCommand(db, msg, cmd)
    }
    const cm = update['chat_member'] ?? update['my_chat_member']
    if (cm?.new_chat_member?.user) await upsertRosterUser(db, cm.new_chat_member.user, cm.chat?.id ?? null)

    const pa = update['poll_answer']
    if (pa?.user) {
      await upsertRosterUser(db, pa.user, pa.voter_chat?.id ?? null)
      // Фиксируем голос для @tvari (option_ids пустой = отозвал голос).
      if (pa.poll_id) await recordVote(db, String(pa.poll_id), String(pa.user.id), pa.option_ids)
    }
  } catch (e) {
    console.error('[tg-webhook] обработка апдейта не удалась', e)
  }
  return c.json({ ok: true })
})
