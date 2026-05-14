import { Bot, InlineKeyboard } from 'grammy'
import { db, profiles, shifts, checks, eq, and, desc, sum, count, gte, isNull } from '@titan/database'

const token = process.env['ADMIN_BOT_TOKEN']
if (!token) throw new Error('ADMIN_BOT_TOKEN is not set')

const API_URL = process.env['API_URL'] ?? 'http://api:3001'
const ALLOWED_TG_IDS = (process.env['ADMIN_TG_IDS'] ?? '').split(',').filter(Boolean)

export const bot = new Bot(token)

const mainKeyboard = new InlineKeyboard()
  .text('📊 Итог дня', 'report_today').text('💰 Смена', 'shift_status').row()
  .text('🧾 Открытые чеки', 'open_checks').text('📦 Низкий сток', 'stock_alert').row()
  .text('💵 Зарплата', 'salary_estimate').text('📅 События', 'list_events').row()

async function isAllowed(tgId: string): Promise<boolean> {
  if (ALLOWED_TG_IDS.length && !ALLOWED_TG_IDS.includes(tgId)) return false
  const [profile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.tgId, tgId), isNull(profiles.deletedAt)))
  if (!profile) return false
  return ['owner', 'staff'].includes(profile.role)
}

bot.command('start', async (ctx) => {
  const tgId = String(ctx.from?.id)
  if (!(await isAllowed(tgId))) {
    await ctx.reply('❌ Доступ запрещён. Привяжите аккаунт через кассу.')
    return
  }
  await ctx.reply('👋 Titan HUB Admin', { reply_markup: mainKeyboard })
})

bot.callbackQuery('report_today', async (ctx) => {
  await ctx.answerCallbackQuery()
  const tgId = String(ctx.from?.id)
  if (!(await isAllowed(tgId))) return

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [stats] = await db
    .select({ revenue: sum(checks.totalAmount), cnt: count() })
    .from(checks)
    .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, today)))

  const revenue = parseFloat(String(stats?.revenue ?? 0)) || 0
  const cnt = stats?.cnt ?? 0
  const avg = cnt ? revenue / cnt : 0

  await ctx.reply(
    `📊 *Итог за сегодня*\n\n` +
    `💰 Выручка: *${revenue.toLocaleString('ru')} ₽*\n` +
    `🧾 Чеков: *${cnt}*\n` +
    `📈 Средний чек: *${avg.toFixed(0)} ₽*`,
    { parse_mode: 'Markdown' }
  )
})

bot.callbackQuery('shift_status', async (ctx) => {
  await ctx.answerCallbackQuery()
  const tgId = String(ctx.from?.id)
  if (!(await isAllowed(tgId))) return

  const [shift] = await db
    .select({ shift: shifts, openedByNick: profiles.nickname })
    .from(shifts)
    .leftJoin(profiles, eq(profiles.id, shifts.openedBy))
    .where(eq(shifts.status, 'open'))
    .limit(1)

  if (!shift) {
    await ctx.reply('⚠️ Смена не открыта')
    return
  }

  const openedAt = new Date(shift.shift.openedAt)
  const elapsed = Math.floor((Date.now() - openedAt.getTime()) / 60000)
  const hours = Math.floor(elapsed / 60)
  const minutes = elapsed % 60

  await ctx.reply(
    `🕐 *Смена открыта*\n\n` +
    `👤 Открыл: ${shift.openedByNick}\n` +
    `⏱ Длительность: ${hours}ч ${minutes}м\n` +
    `💵 Касса: ${parseFloat(shift.shift.cashStart).toLocaleString('ru')} ₽`,
    { parse_mode: 'Markdown' }
  )
})

bot.callbackQuery('open_checks', async (ctx) => {
  await ctx.answerCallbackQuery()
  const tgId = String(ctx.from?.id)
  if (!(await isAllowed(tgId))) return

  const openChecks = await db
    .select()
    .from(checks)
    .where(eq(checks.status, 'open'))
    .orderBy(desc(checks.createdAt))
    .limit(10)

  if (!openChecks.length) {
    await ctx.reply('✅ Нет открытых чеков')
    return
  }

  const text = openChecks.map((c, i) =>
    `${i + 1}. ${parseFloat(c.totalAmount).toLocaleString('ru')} ₽${c.note ? ` · ${c.note}` : ''}`
  ).join('\n')

  await ctx.reply(`🧾 *Открытые чеки (${openChecks.length})*\n\n${text}`, { parse_mode: 'Markdown' })
})

bot.callbackQuery('salary_estimate', async (ctx) => {
  await ctx.answerCallbackQuery()
  const tgId = String(ctx.from?.id)
  if (!(await isAllowed(tgId))) return

  const [profile] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
  if (!profile) return

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [stats] = await db
    .select({ revenue: sum(checks.totalAmount) })
    .from(checks)
    .where(and(eq(checks.staffId, profile.id), eq(checks.status, 'closed'), gte(checks.createdAt, monthStart)))

  const revenue = parseFloat(String(stats?.revenue ?? 0)) || 0
  const salary = revenue <= 7000 ? 700 : 700 + Math.ceil((revenue - 7000) / 1000) * 100

  await ctx.reply(
    `💵 *Расчёт зарплаты*\n\n` +
    `Выручка за месяц: *${revenue.toLocaleString('ru')} ₽*\n` +
    `Зарплата: *${salary.toLocaleString('ru')} ₽*`,
    { parse_mode: 'Markdown' }
  )
})

bot.callbackQuery('stock_alert', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📦 Используйте кассу для проверки остатков')
})

bot.callbackQuery('list_events', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📅 Откройте кассу для управления событиями')
})

bot.on('message:text', async (ctx) => {
  const tgId = String(ctx.from?.id)
  if (!(await isAllowed(tgId))) return
  await ctx.reply('Используйте кнопки меню ниже 👇', { reply_markup: mainKeyboard })
})

bot.start()
console.log('🤖 Admin bot started')
