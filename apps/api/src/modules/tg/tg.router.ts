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
import { upsertRosterUser } from '../../lib/roster.js'

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
    }
    const cm = update['chat_member'] ?? update['my_chat_member']
    if (cm?.new_chat_member?.user) await upsertRosterUser(db, cm.new_chat_member.user, cm.chat?.id ?? null)
    if (update['poll_answer']?.user) await upsertRosterUser(db, update['poll_answer'].user, update['poll_answer'].voter_chat?.id ?? null)
  } catch (e) {
    console.error('[tg-webhook] сбор участника не удался', e)
  }
  return c.json({ ok: true })
})
