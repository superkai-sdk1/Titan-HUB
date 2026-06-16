import { Hono } from 'hono'
import { getClubDb, profiles, inArray } from '@titan/database'
// Control-БД: относительный путь к dist (как в clubResolver/superadmin).
import {
  getControlDb,
  clubs,
  eq,
} from '../../../../../packages/database/dist/control/index.js'
import { buildClubConnString } from '../../lib/clubResolver.js'
import { tgWebhookSecretValid } from '../../lib/tgWebhook.js'
import { upsertRosterUser, listRosterForChat, listRoster } from '../../lib/roster.js'
import { recordVote, lastPollForChat, voteMapOfPoll } from '../../lib/pollState.js'
import { getClubIntegration } from '../../lib/secrets.js'
import { getBoolSetting, getStringSetting } from '../../lib/appSettings.js'
import { recordChat, recordTopic } from '../../lib/tgChats.js'
import { readAliases } from '../../lib/tgAliases.js'
import { isTelegramChatAdmin, sendTelegramMessage } from '../../lib/telegram.js'
import { taiChatReply } from '../../lib/tai.js'
import type { Database } from '@titan/database'

// tgId → ник СОПОСТАВЛЕННОГО клиента (profiles.tg_id напрямую, затем доп.аккаунты
// из tg_aliases). Для отображаемого текста упоминаний — вместо имени из Telegram.
async function clientNicknamesByTgId(db: Database, tgIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(tgIds.filter(Boolean))]
  if (ids.length === 0) return out
  const direct = await db.select({ tgId: profiles.tgId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.tgId, ids))
  for (const p of direct as any[]) if (p.tgId) out.set(p.tgId, p.nickname)
  // Доп. аккаунты (алиасы) — для tgId, не привязанных напрямую.
  const aliasMap = await readAliases(db)
  const pending = ids.filter((t) => !out.has(t) && aliasMap[t])
  if (pending.length) {
    const profileIds = [...new Set(pending.map((t) => aliasMap[t]!.profileId))]
    const aprofs = await db.select({ id: profiles.id, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.id, profileIds))
    const byId = new Map((aprofs as any[]).map((p) => [p.id, p.nickname]))
    for (const t of pending) { const nick = byId.get(aliasMap[t]!.profileId); if (nick) out.set(t, nick) }
  }
  return out
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type MentionTarget = { tgId: string; username: string | null; firstName: string | null }

// Антиспам: команды-отметки — не чаще раза в 10 минут от одного пользователя в чате.
// In-memory (хватает: один API-процесс; сброс при рестарте не критичен).
const CMD_COOLDOWN_MS = 10 * 60 * 1000
const CMD_WARN_THROTTLE_MS = 60 * 1000
const lastCmdRun = new Map<string, number>() // `${chatId}:${userId}` → ts успешного запуска
const lastCmdWarn = new Map<string, number>() // → ts последнего предупреждения (не спамить отказами)
// Tai-чат: анти-спам (1 ответ в 12с/польз.) + короткая память чата для контекста.
const TAI_COOLDOWN_MS = 12 * 1000
const lastTaiReply = new Map<string, number>()
const TAI_BUF_MAX = 8
const taiBuffer = new Map<string, { name: string; text: string }[]>() // chatId → последние реплики

function pushTaiBuffer(chatId: string | number | null | undefined, name: string, text: string): void {
  if (!chatId || !text) return
  const k = String(chatId)
  const arr = taiBuffer.get(k) ?? []
  arr.push({ name, text: text.slice(0, 300) })
  while (arr.length > TAI_BUF_MAX) arr.shift()
  taiBuffer.set(k, arr)
}

// Сообщение адресовано Tai: реплай на сообщение бота ИЛИ упоминание «tai/тай» словом.
function directedAtTai(msg: any): boolean {
  const text = String(msg?.text ?? '').trim()
  if (!text || text.startsWith('/')) return false
  if (msg?.reply_to_message?.from?.is_bot) return true
  return /(^|[^a-zа-яё0-9])(tai|тай)([^a-zа-яё0-9]|$)/i.test(text)
}

// Пер-групповые настройки Tai (app_settings.tai_chat_settings — JSON по chatId).
interface TaiChatPrefs { enabled: boolean; profanity: boolean; harshness: 'soft' | 'medium' | 'savage' }
async function taiPrefsForChat(db: Database, chatId: string | number): Promise<TaiChatPrefs> {
  const def: TaiChatPrefs = { enabled: true, profanity: true, harshness: 'savage' }
  try {
    const raw = await getStringSetting('tai_chat_settings', '', db)
    if (!raw) return def
    const map = JSON.parse(raw) as Record<string, Partial<TaiChatPrefs>>
    const p = map[String(chatId)]
    if (!p) return def
    return { enabled: p.enabled !== false, profanity: p.profanity !== false, harshness: (p.harshness as TaiChatPrefs['harshness']) || 'savage' }
  } catch { return def }
}

// Дерзкий ответ Tai в чат. Гейт: мастер-тумблер + пер-групповой enabled + ИИ-ключ.
async function handleTaiChat(db: Database, msg: any): Promise<void> {
  const chatId = msg?.chat?.id
  const text = String(msg?.text ?? '').trim()
  if (!chatId || !text) return
  if (!(await getBoolSetting('tai_chat_enabled', false, db))) return
  const prefs = await taiPrefsForChat(db, chatId)
  if (!prefs.enabled) return
  const token = await getClubIntegration(db, 'poll_bot_token').catch(() => null)
  if (!token) return

  const key = `${chatId}:${msg.from?.id}`
  const now = Date.now()
  if (now - (lastTaiReply.get(key) ?? 0) < TAI_COOLDOWN_MS) return
  lastTaiReply.set(key, now)

  const fromName = msg.from?.first_name || (msg.from?.username ? '@' + msg.from.username : 'кто-то')
  const replyText = msg.reply_to_message?.text ? String(msg.reply_to_message.text).slice(0, 300) : ''
  // Контекст — недавние сообщения чата (без текущего: оно уже последнее в буфере).
  const ctxArr = (taiBuffer.get(String(chatId)) ?? []).slice(0, -1).slice(-6)
  const context = ctxArr.length ? ctxArr.map((m) => `${m.name}: ${m.text}`).join('\n') : undefined
  const userMessage = replyText
    ? `${fromName} отвечает на твою реплику «${replyText}»: ${text}`
    : `${fromName} пишет: ${text}`

  const preset = await getStringSetting('tai_preset', 'roast', db)
  const reply = await taiChatReply(db, { userMessage, context, preset, harshness: prefs.harshness, profanity: prefs.profanity })
  if (reply) {
    pushTaiBuffer(chatId, 'Tai', reply)
    await sendTelegramMessage(token, chatId, reply, { messageThreadId: msg.message_thread_id ?? null, replyToMessageId: msg.message_id })
  }
}

const normOpt = (s: string): string => s.trim().toLowerCase()
function dedupById<T extends { tgId: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const u of arr) if (!seen.has(u.tgId)) { seen.add(u.tgId); out.push(u) }
  return out
}

// Команды чата. Только админ чата + не чаще раза в 10 мин (анти-спам).
// «Участники» = РОСТЕР чата (кого бот видел): полный список Telegram не отдаёт.
//   @all        — все известные участники чата.
//   @tvari      — НЕ проголосовавшие + выбравшие «Думаю» в последнем опросе чата.
//   @supertvari — выбравшие «Нет» в последнем опросе чата.
//   @lubimki    — выбравшие «Да» в последнем опросе чата.
async function handleMentionCommand(db: Database, msg: any, cmd: 'all' | 'tvari' | 'supertvari' | 'lubimki'): Promise<void> {
  const chatId = msg.chat?.id
  const fromId = msg.from?.id
  const threadId = msg.message_thread_id ?? null
  if (!chatId || !fromId) return
  const token = await getClubIntegration(db, 'poll_bot_token').catch(() => null)
  if (!token) return

  const key = `${chatId}:${fromId}:${cmd}`
  const now = Date.now()

  // Кто может: только админ чата (по умолчанию) или любой участник — настройка клуба.
  const adminOnly = await getBoolSetting('poll_commands_admin_only', true, db)
  const isAdmin = await isTelegramChatAdmin(token, chatId, fromId).catch(() => false)
  if (adminOnly && !isAdmin) {
    await sendTelegramMessage(token, chatId, 'Команда доступна только администраторам чата.', { messageThreadId: threadId })
    return
  }

  // Кулдаун 10 мин (анти-спам) — ТОЛЬКО для не-админов. Админам — без ограничения.
  if (!isAdmin) {
    const since = now - (lastCmdRun.get(key) ?? 0)
    if (since < CMD_COOLDOWN_MS) {
      if (now - (lastCmdWarn.get(key) ?? 0) > CMD_WARN_THROTTLE_MS) {
        lastCmdWarn.set(key, now)
        const mins = Math.ceil((CMD_COOLDOWN_MS - since) / 60000)
        await sendTelegramMessage(token, chatId, `⏳ Команды-отметки можно раз в 10 минут. Подождите ещё ~${mins} мин.`, { messageThreadId: threadId })
      }
      return
    }
  }

  let targets: MentionTarget[] = []
  let header = ''
  let emptyMsg = ''

  if (cmd === 'all') {
    targets = await listRosterForChat(db, String(chatId))
    header = '📣 Участники:'
    emptyMsg = 'Список участников пуст (бот ещё никого не видел).'
  } else {
    const last = await lastPollForChat(db, String(chatId))
    if (!last) {
      await sendTelegramMessage(token, chatId, 'Нет последнего опроса для этого чата.', { messageThreadId: threadId })
      return
    }
    const voteMap = await voteMapOfPoll(db, last.pollId)
    const voters = new Set(Object.keys(voteMap))
    const options = last.options ?? []
    // Голосовавшие могут быть не в чат-ростере (если только голосовали) — берём имя
    // из полного ростера по tgId.
    const fullRoster = await listRoster(db)
    const byId = new Map(fullRoster.map((u) => [u.tgId, u]))
    const lookup = (tgId: string): MentionTarget => byId.get(tgId) ?? { tgId, username: null, firstName: null }

    if (cmd === 'tvari') {
      const thinkingIdx = options.findIndex((o) => normOpt(o) === 'думаю')
      const chatRoster = await listRosterForChat(db, String(chatId))
      const nonVoters = chatRoster.filter((u) => !voters.has(u.tgId))
      const thinking = thinkingIdx >= 0
        ? Object.keys(voteMap).filter((tg) => voteMap[tg]!.includes(thinkingIdx)).map(lookup)
        : []
      targets = dedupById([...nonVoters, ...thinking])
      header = thinkingIdx >= 0 ? '⚠️ Не отметились или «Думаю»:' : '⚠️ Не отметились в последнем опросе:'
      emptyMsg = '✅ Все определились!'
    } else if (cmd === 'lubimki') {
      const yesIdx = options.findIndex((o) => normOpt(o) === 'да')
      if (yesIdx < 0) {
        await sendTelegramMessage(token, chatId, 'В последнем опросе нет варианта «Да».', { messageThreadId: threadId })
        return
      }
      targets = Object.keys(voteMap).filter((tg) => voteMap[tg]!.includes(yesIdx)).map(lookup)
      header = '❤️ Любимки (проголосовали «Да»):'
      emptyMsg = 'Никто не выбрал «Да».'
    } else {
      const noIdx = options.findIndex((o) => normOpt(o) === 'нет')
      if (noIdx < 0) {
        await sendTelegramMessage(token, chatId, 'В последнем опросе нет варианта «Нет».', { messageThreadId: threadId })
        return
      }
      targets = Object.keys(voteMap).filter((tg) => voteMap[tg]!.includes(noIdx)).map(lookup)
      header = '🚫 Проголосовали «Нет»:'
      emptyMsg = 'Никто не выбрал «Нет».'
    }
  }

  if (!isAdmin) lastCmdRun.set(key, now) // кулдаун тратят только не-админы (в т.ч. пустой результат)

  if (targets.length === 0) {
    await sendTelegramMessage(token, chatId, emptyMsg, { messageThreadId: threadId })
    return
  }

  // Видимый текст упоминания — ник сопоставленного клиента (если есть); ссылка
  // tg://user?id=… всё равно пингует. Фоллбэк: имя из Telegram → @username → «участник».
  const nickByTg = await clientNicknamesByTgId(db, targets.map((u) => u.tgId))
  const CHUNK = 50
  for (let i = 0; i < targets.length; i += CHUNK) {
    const part = targets.slice(i, i + CHUNK)
    const mentions = part
      .map((u) => {
        const label = nickByTg.get(u.tgId) || u.firstName || (u.username ? '@' + u.username : 'участник')
        return `<a href="tg://user?id=${u.tgId}">${escapeHtml(label)}</a>`
      })
      .join(' ')
    const text = i === 0 ? `${header}\n${mentions}` : mentions
    await sendTelegramMessage(token, chatId, text, { messageThreadId: threadId, parseMode: 'HTML' })
  }
}

// Распознать команду в первом слове сообщения.
function parseMentionCommand(text: string | undefined): 'all' | 'tvari' | 'supertvari' | 'lubimki' | null {
  const first = (text ?? '').trim().split(/\s+/)[0]?.toLowerCase()
  if (first === '@all') return 'all'
  if (first === '@tvari' || first === '@твари') return 'tvari'
  if (first === '@supertvari' || first === '@супертвари') return 'supertvari'
  if (first === '@lubimki' || first === '@любимки') return 'lubimki'
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
      // Копим группы/топики бота для выбора в интерфейсе (вместо ввода ID).
      await recordChat(db, msg.chat)
      if (msg.message_thread_id != null || msg.is_topic_message) {
        await recordTopic(db, msg.chat?.id, msg.message_thread_id, msg.forum_topic_created?.name ?? msg.reply_to_message?.forum_topic_created?.name ?? null)
      }
      // Короткая память чата для контекста Tai (накапливаем реплики людей).
      if (msg.text && !msg.from?.is_bot) {
        pushTaiBuffer(msg.chat?.id, msg.from?.first_name || msg.from?.username || 'гость', msg.text)
      }
      // Команды чата: @all / @tvari / @lubimki (только админ; реагируем на свежие сообщения).
      const cmd = parseMentionCommand(msg.text)
      if (cmd) await handleMentionCommand(db, msg, cmd)
      // Иначе — если сообщение адресовано Tai (реплай боту / «тай …»), дерзкий ответ.
      else if (!msg.from?.is_bot && directedAtTai(msg)) await handleTaiChat(db, msg)
    }
    const cm = update['chat_member'] ?? update['my_chat_member']
    if (cm) {
      await recordChat(db, cm.chat)
      if (cm.new_chat_member?.user) await upsertRosterUser(db, cm.new_chat_member.user, cm.chat?.id ?? null)
    }

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
