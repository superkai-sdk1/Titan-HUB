import { Bot, InlineKeyboard } from 'grammy'
import { db, profiles, shifts, checks, inventory, events, tgLinkRequests, eq, and, desc, asc, isNull, inArray, sql } from '@titan/database'
import { signToken } from '@titan/auth'

const token = process.env['ADMIN_BOT_TOKEN']
if (!token) throw new Error('ADMIN_BOT_TOKEN is not set')

const API_URL = process.env['API_URL'] ?? 'http://api:3001'
const ALLOWED_TG_IDS = (process.env['ADMIN_TG_IDS'] ?? '').split(',').filter(Boolean)

// Экранирование спецсимволов legacy-Markdown.
function escapeMd(s: string): string {
  return s.replace(/[\\_*[`]/g, '\\$&')
}
const money = (n: number) => `${Math.round(n).toLocaleString('ru')} ₽`

export const bot = new Bot(token)

const mainKeyboard = new InlineKeyboard()
  .text('📊 Итог дня', 'report_today').text('💰 Смена', 'shift_status').row()
  .text('🧾 Открытые чеки', 'open_checks').text('📦 Низкий сток', 'stock_alert').row()
  .text('💵 Зарплата', 'salary_estimate').text('📅 События', 'list_events').row()
  .text('🤖 Спросить Titan', 'ai_ask').text('🔒 Закрыть смену', 'close_shift').row()

type Profile = typeof profiles.$inferSelect

async function getProfile(tgId: string): Promise<Profile | null> {
  if (ALLOWED_TG_IDS.length && !ALLOWED_TG_IDS.includes(tgId)) return null
  const [p] = await db.select().from(profiles).where(and(eq(profiles.tgId, tgId), isNull(profiles.deletedAt)))
  if (!p || !['owner', 'staff'].includes(p.role)) return null
  return p
}

// Короткий JWT для профиля → вызовы нашего API (переиспользуем всю бизнес-логику).
async function tokenFor(p: Profile): Promise<string> {
  return signToken({ sub: p.id, role: p.role, nickname: p.nickname }, '10m')
}
async function apiGet<T = any>(p: Profile, path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${await tokenFor(p)}` } })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}
async function apiPost<T = any>(p: Profile, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(p)}` },
    body: JSON.stringify(body),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `API ${res.status}`)
  return json as T
}

// Состояние диалога (один инстанс бота → in-memory достаточно). Ключ — chat.id.
type Pending =
  | { mode: 'ai' }
  | { mode: 'close_cash'; expected: number }
  | { mode: 'close_confirm'; cashEnd: number; expected: number }
const pending = new Map<number, Pending>()

// Привязка по 6-значному коду из приложения (Настройки → Уведомления → Привязать Telegram).
async function handleLinkCode(ctx: any, tgId: string, code: string): Promise<void> {
  const [req] = await db.select().from(tgLinkRequests)
    .where(and(eq(tgLinkRequests.tgId, code), eq(tgLinkRequests.status, 'pending')))
    .orderBy(desc(tgLinkRequests.createdAt)).limit(1)
  if (!req) { await ctx.reply('❌ Код неверный. Сгенерируйте новый в приложении.'); return }
  if (Date.now() - new Date(req.createdAt).getTime() > 30 * 60000) { await ctx.reply('❌ Код истёк (старше 30 минут). Сгенерируйте новый.'); return }
  const [prof] = await db.select().from(profiles).where(eq(profiles.id, req.profileId))
  if (!prof || !['owner', 'staff'].includes(prof.role)) { await ctx.reply('❌ Этот профиль недоступен для админ-бота.'); return }
  const [existing] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
  if (existing && existing.id !== prof.id) { await ctx.reply('❌ Этот Telegram уже привязан к другому профилю.'); return }
  try {
    await db.transaction(async (tx) => {
      await tx.update(profiles).set({ tgId, tgUsername: ctx.from?.username ?? null }).where(eq(profiles.id, prof.id))
      await tx.update(tgLinkRequests).set({ status: 'approved', tgId }).where(eq(tgLinkRequests.id, req.id))
    })
    await ctx.reply(`✅ Telegram привязан к *${escapeMd(prof.nickname)}*. Включите нужные уведомления в приложении.`, { parse_mode: 'Markdown', reply_markup: mainKeyboard })
  } catch (err) {
    console.error('[bot-admin] link failed:', err)
    await ctx.reply('❌ Не удалось привязать (возможно, этот Telegram уже занят).')
  }
}

bot.command('start', async (ctx) => {
  pending.delete(ctx.chat.id)
  const p = await getProfile(String(ctx.from?.id))
  if (!p) { await ctx.reply('👋 Это админ-бот Titan HUB.\n\nЧтобы привязать аккаунт: откройте приложение → Настройки → Уведомления → «Привязать Telegram», получите 6-значный код и отправьте его сюда.'); return }
  await ctx.reply(`👋 Titan HUB Admin · ${escapeMd(p.nickname)}`, { reply_markup: mainKeyboard, parse_mode: 'Markdown' })
})

// ─── Отчёты ──────────────────────────────────────────────────────────────────
bot.callbackQuery('report_today', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  try {
    const d = await apiGet<any>(p, '/analytics/dashboard')
    const t = d.today ?? {}
    const net = d.netToday?.net
    await ctx.reply(
      `📊 *Итог дня* (бизнес-день ${d.businessDay ?? '—'})\n\n` +
      `💰 Выручка: *${money(t.revenue ?? 0)}*\n` +
      `🧾 Чеков: *${t.checks ?? 0}*\n` +
      `📈 Средний чек: *${money(t.avgCheck ?? 0)}*\n` +
      (net != null ? `✅ Чистыми: *${money(net)}*` : ''),
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    console.error('[bot-admin] report_today:', err)
    await ctx.reply('❌ Не удалось получить данные, попробуйте позже')
  }
})

bot.callbackQuery('shift_status', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  try {
    const [shift] = await db
      .select({ openedAt: shifts.openedAt, cashStart: shifts.cashStart, openedByNick: profiles.nickname })
      .from(shifts)
      .leftJoin(profiles, eq(profiles.id, shifts.openedBy))
      .where(eq(shifts.status, 'open'))
      .limit(1)
    if (!shift) { await ctx.reply('⚠️ Смена не открыта'); return }
    const elapsed = Math.floor((Date.now() - new Date(shift.openedAt).getTime()) / 60000)
    await ctx.reply(
      `🕐 *Смена открыта*\n\n` +
      `👤 Открыл: ${shift.openedByNick ? escapeMd(shift.openedByNick) : '—'}\n` +
      `⏱ Длительность: ${Math.floor(elapsed / 60)}ч ${elapsed % 60}м\n` +
      `💵 Касса на старте: ${money(parseFloat(String(shift.cashStart)))}`,
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    console.error('[bot-admin] shift_status:', err)
    await ctx.reply('❌ Не удалось получить данные, попробуйте позже')
  }
})

bot.callbackQuery('open_checks', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  const openChecks = await db.select().from(checks).where(eq(checks.status, 'open')).orderBy(desc(checks.createdAt)).limit(10)
  if (!openChecks.length) { await ctx.reply('✅ Нет открытых чеков'); return }
  const text = openChecks.map((c, i) => `${i + 1}. ${money(parseFloat(c.totalAmount))}${c.note ? ` · ${escapeMd(c.note)}` : ''}`).join('\n')
  await ctx.reply(`🧾 *Открытые чеки (${openChecks.length})*\n\n${text}`, { parse_mode: 'Markdown' })
})

bot.callbackQuery('salary_estimate', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  try {
    const now = new Date()
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to = now.toISOString().split('T')[0]
    const r = await apiGet<{ revenue: number; salary: number }>(p, `/salary/estimate?from=${from}&to=${to}`)
    await ctx.reply(
      `💵 *Расчёт зарплаты (этот месяц)*\n\n` +
      `Ваша выручка: *${money(r.revenue ?? 0)}*\n` +
      `Зарплата: *${money(r.salary ?? 0)}*`,
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    console.error('[bot-admin] salary_estimate:', err)
    await ctx.reply('❌ Не удалось получить данные, попробуйте позже')
  }
})

bot.callbackQuery('stock_alert', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  try {
    const lowStock = await db
      .select({ name: inventory.name, stockQuantity: inventory.stockQuantity, minThreshold: inventory.minThreshold })
      .from(inventory)
      .where(and(eq(inventory.trackStock, true), isNull(inventory.deletedAt), sql`${inventory.stockQuantity} <= COALESCE(${inventory.minThreshold}, 0)`))
      .orderBy(asc(inventory.stockQuantity))
      .limit(30)
    if (!lowStock.length) { await ctx.reply('✅ Все остатки в норме'); return }
    const text = lowStock.map((i) => `• ${escapeMd(i.name)} — *${i.stockQuantity}* шт. (мин. ${i.minThreshold ?? 0})`).join('\n')
    await ctx.reply(`📦 *Низкий сток (${lowStock.length})*\n\n${text}`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('[bot-admin] stock_alert:', err)
    await ctx.reply('❌ Не удалось получить остатки. Попробуйте позже.')
  }
})

bot.callbackQuery('list_events', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  try {
    const upcoming = await db
      .select({ title: events.title, date: events.date, startTime: events.startTime, status: events.status, type: events.type, billingMode: events.billingMode, plannedHours: events.plannedHours, fixedAmount: events.fixedAmount })
      .from(events)
      .where(inArray(events.status, ['planned', 'active']))
      .orderBy(asc(events.date), asc(events.startTime))
      .limit(10)
    if (!upcoming.length) { await ctx.reply('📅 Предстоящих событий нет'); return }
    const STATUS_LABEL: Record<string, string> = { planned: 'запланировано', active: 'идёт' }
    const text = upcoming.map((e) => {
      const title = escapeMd(e.title?.trim() || 'Без названия')
      const when = `${e.date}${e.startTime ? ` ${e.startTime}` : ''}`
      const amount = e.billingMode === 'hourly'
        ? (e.plannedHours ? ` · ${e.plannedHours} ч` : ' · почасовая')
        : (e.fixedAmount != null ? ` · ${money(parseFloat(String(e.fixedAmount)))}` : '')
      const status = STATUS_LABEL[e.status] ? ` (${STATUS_LABEL[e.status]})` : ''
      const kind = e.type === 'exit' ? '🚗' : '🏠'
      return `${kind} *${title}*${status}\n  ${when}${amount}`
    }).join('\n')
    await ctx.reply(`📅 *Предстоящие события (${upcoming.length})*\n\n${text}`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('[bot-admin] list_events:', err)
    await ctx.reply('❌ Не удалось получить события. Попробуйте позже.')
  }
})

// ─── AI: спросить Titan ──────────────────────────────────────────────────────
bot.callbackQuery('ai_ask', async (ctx) => {
  await ctx.answerCallbackQuery()
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  pending.set(ctx.chat!.id, { mode: 'ai' })
  await ctx.reply('🤖 Задайте любой вопрос о клубе — долги, остатки, выручка, клиенты и т.д.\n\nНапример: «сколько долг у Саида», «что закончилось», «топ-5 клиентов за месяц».\n\n/start — выйти.')
})

// ─── Закрытие смены ──────────────────────────────────────────────────────────
bot.callbackQuery('close_shift', async (ctx) => {
  await ctx.answerCallbackQuery()
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  try {
    const bal = await apiGet<{ expected: number; cashStart: number }>(p, '/shifts/cash-balance')
    const [open] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.status, 'open')).limit(1)
    if (!open) { await ctx.reply('⚠️ Открытой смены нет'); return }
    pending.set(ctx.chat!.id, { mode: 'close_cash', expected: bal.expected ?? 0 })
    await ctx.reply(
      `🔒 *Закрытие смены*\n\nОжидается в кассе: *${money(bal.expected ?? 0)}*\n\n` +
      `Отправьте фактическую сумму в кассе числом (например: 12500).`,
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    console.error('[bot-admin] close_shift:', err)
    await ctx.reply('❌ Не удалось получить кассу. Попробуйте позже.')
  }
})

bot.callbackQuery('close_confirm', async (ctx) => {
  await ctx.answerCallbackQuery()
  const p = await getProfile(String(ctx.from?.id)); if (!p) return
  const st = pending.get(ctx.chat!.id)
  if (!st || st.mode !== 'close_confirm') { await ctx.reply('Сессия закрытия истекла. Начните заново.'); return }
  pending.delete(ctx.chat!.id)
  const disc = st.cashEnd - st.expected
  try {
    await apiPost(p, '/shifts/close', { cashEnd: st.cashEnd, ...(disc !== 0 ? { adjustmentReason: 'Закрытие через Telegram' } : {}) })
    await ctx.reply(
      `✅ *Смена закрыта*\n\nФакт: *${money(st.cashEnd)}*\nОжидалось: ${money(st.expected)}\n` +
      (disc === 0 ? 'Касса сошлась.' : disc > 0 ? `Излишек: *+${money(disc)}* (внесение)` : `Недостача: *${money(disc)}* (изъятие)`),
      { parse_mode: 'Markdown' },
    )
  } catch (err: any) {
    console.error('[bot-admin] close_confirm:', err)
    await ctx.reply(`❌ Не удалось закрыть смену: ${escapeMd(String(err?.message ?? ''))}`)
  }
})

bot.callbackQuery('close_cancel', async (ctx) => {
  await ctx.answerCallbackQuery()
  pending.delete(ctx.chat!.id)
  await ctx.reply('Отменено.')
})

// ─── Текстовые сообщения: AI-вопрос или сумма закрытия ────────────────────────
bot.on('message:text', async (ctx) => {
  const tgId = String(ctx.from?.id)
  const textIn = ctx.message.text.trim()
  const p = await getProfile(tgId)
  // Непривязанный аккаунт: принимаем только 6-значный код привязки.
  if (!p) {
    if (/^\d{6}$/.test(textIn)) { await handleLinkCode(ctx, tgId, textIn); return }
    await ctx.reply('Отправьте 6-значный код привязки из приложения (Настройки → Уведомления → Привязать Telegram).')
    return
  }
  const st = pending.get(ctx.chat.id)

  if (st?.mode === 'ai') {
    const thinking = await ctx.reply('⏳ Анализирую базу…')
    try {
      const r = await apiPost<{ result?: string; error?: string }>(p, '/ai/chat', { action: 'custom_query', payload: { query: textIn } })
      const answer = r.result || r.error || 'Не удалось получить ответ.'
      await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, answer.slice(0, 3900)).catch(() => ctx.reply(answer.slice(0, 3900)))
    } catch (err) {
      console.error('[bot-admin] ai_ask:', err)
      await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, '❌ ИИ недоступен, попробуйте позже.').catch(() => {})
    }
    return
  }

  if (st?.mode === 'close_cash') {
    const cashEnd = parseFloat(textIn.replace(/[^\d.,]/g, '').replace(',', '.'))
    if (!Number.isFinite(cashEnd) || cashEnd < 0) { await ctx.reply('Отправьте сумму числом, например: 12500'); return }
    const disc = cashEnd - st.expected
    pending.set(ctx.chat.id, { mode: 'close_confirm', cashEnd, expected: st.expected })
    const kb = new InlineKeyboard().text('✅ Подтвердить', 'close_confirm').text('✖️ Отмена', 'close_cancel')
    await ctx.reply(
      `Проверьте закрытие:\n\nФакт: *${money(cashEnd)}*\nОжидалось: ${money(st.expected)}\n` +
      (disc === 0 ? 'Касса сходится.' : disc > 0 ? `Излишек: *+${money(disc)}*` : `Недостача: *${money(disc)}*`),
      { parse_mode: 'Markdown', reply_markup: kb },
    )
    return
  }

  await ctx.reply('Используйте кнопки меню ниже 👇', { reply_markup: mainKeyboard })
})

bot.catch((err) => {
  console.error('[bot-admin] handler error:', err.error)
})

bot.start()
console.log('🤖 Admin bot started')
