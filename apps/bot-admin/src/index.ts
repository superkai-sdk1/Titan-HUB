import { Bot, InlineKeyboard } from 'grammy'

const token = process.env['ADMIN_BOT_TOKEN']
if (!token) throw new Error('ADMIN_BOT_TOKEN is not set')

export const bot = new Bot(token)

const mainKeyboard = new InlineKeyboard()
  .text('📊 Отчёт за сегодня', 'report_today').row()
  .text('🧾 Открытые чеки', 'open_checks').text('💰 Касса', 'cash_status').row()
  .text('👥 Должники', 'debtors').text('📦 Остатки', 'stock_alert').row()
  .text('📅 Мероприятия', 'list_events').text('🍕 Меню', 'list_menu').row()
  .text('💵 Зарплата', 'salary_estimate').text('🚚 Поставки', 'supply_summary').row()

bot.command('start', async (ctx) => {
  await ctx.reply('👋 Titan HUB Admin', { reply_markup: mainKeyboard })
})

bot.callbackQuery('report_today', async (ctx) => {
  await ctx.answerCallbackQuery()
  // TODO: call /api/ai/action with { action: 'report_today' }
  await ctx.reply('📊 Загружаю отчёт...')
})

const conversationHistory: Map<number, { role: string; content: string }[]> = new Map()

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id
  const history = conversationHistory.get(userId) ?? []
  history.push({ role: 'user', content: ctx.message.text })
  if (history.length > 12) history.splice(0, history.length - 12)
  conversationHistory.set(userId, history)
  // TODO: call Anthropic API with history + system context
  await ctx.reply('🤖 AI функция будет подключена после настройки ключа Anthropic')
})

bot.start()
console.log('🤖 Admin bot started')
