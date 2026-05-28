import { Bot, InlineKeyboard } from 'grammy'
import { db, profiles, tgLinkRequests, transactions, bonusHistory, eq, and, desc } from '@titan/database'

const token = process.env['WALLET_BOT_TOKEN']
if (!token) throw new Error('WALLET_BOT_TOKEN is not set')

const WEBAPP_URL = process.env['WALLET_WEBAPP_URL'] ?? 'https://titanpos.ru/wallet'

export const bot = new Bot(token)

const walletKeyboard = new InlineKeyboard()
  .text('💰 Баланс', 'balance').text('📋 История', 'history').row()
  .webApp('💳 Открыть кошелёк', WEBAPP_URL)

bot.command('start', async (ctx) => {
  const payload = ctx.match
  const tgId = String(ctx.from?.id)
  const tgUsername = ctx.from?.username

  if (payload?.startsWith('link_')) {
    const profileId = payload.slice(5)
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId))
    if (!profile) {
      await ctx.reply('❌ Профиль не найден')
      return
    }
    if (profile.tgId) {
      await ctx.reply('✅ Telegram уже привязан к этому профилю')
      return
    }
    await db.insert(tgLinkRequests).values({ profileId, tgId, tgUsername: tgUsername ?? null, status: 'approved' })
    await db.update(profiles).set({ tgId, tgUsername: tgUsername ?? null }).where(eq(profiles.id, profileId))
    await ctx.reply(
      `✅ Telegram привязан к профилю *${profile.nickname}*!\n\nТеперь вы можете проверять баланс прямо здесь.`,
      { parse_mode: 'Markdown', reply_markup: walletKeyboard }
    )
    return
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
  if (!profile) {
    await ctx.reply(
      '👋 Добро пожаловать в Titan Wallet!\n\nЧтобы привязать аккаунт, обратитесь к администратору.'
    )
    return
  }

  await ctx.reply(
    `👋 Привет, *${profile.nickname}*!`,
    { parse_mode: 'Markdown', reply_markup: walletKeyboard }
  )
})

bot.callbackQuery('balance', async (ctx) => {
  await ctx.answerCallbackQuery()
  const tgId = String(ctx.from?.id)
  const [profile] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
  if (!profile) {
    await ctx.reply('❌ Аккаунт не привязан. Используйте ссылку из кассы.')
    return
  }
  await ctx.reply(
    `💰 *Кошелёк ${profile.nickname}*\n\n` +
    `Баланс: *${parseFloat(profile.balance).toLocaleString('ru')} ₽*\n` +
    `Бонусы: *${parseFloat(profile.bonusPoints).toFixed(0)} ⭐*`,
    { parse_mode: 'Markdown' }
  )
})

bot.callbackQuery('history', async (ctx) => {
  await ctx.answerCallbackQuery()
  const tgId = String(ctx.from?.id)
  const [profile] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
  if (!profile) {
    await ctx.reply('❌ Аккаунт не привязан.')
    return
  }

  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.playerId, profile.id))
    .orderBy(desc(transactions.createdAt))
    .limit(10)

  if (!txs.length) {
    await ctx.reply('📋 История транзакций пуста')
    return
  }

  const TYPE_EMOJI: Record<string, string> = {
    deposit: '📥', withdrawal: '📤', payment: '🛒', refund: '↩️',
    bonus_accrual: '⭐', bonus_spend: '💫',
  }

  const text = txs.map(t =>
    `${TYPE_EMOJI[t.type] ?? '•'} ${parseFloat(t.amount).toLocaleString('ru')} ₽${t.description ? ` — ${t.description}` : ''}`
  ).join('\n')

  await ctx.reply(`📋 *Последние транзакции*\n\n${text}`, { parse_mode: 'Markdown' })
})

// Глобальный обработчик ошибок: необработанная ошибка в хендлере не должна
// ронять бота молча — логируем (DB-сбои, сетевые ошибки и т.п.).
bot.catch((err) => {
  console.error('[bot-wallet] handler error:', err.error)
})

bot.start()
console.log('💳 Wallet bot started')
