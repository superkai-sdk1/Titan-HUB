import { Bot } from 'grammy'
import { db, profiles, tgLinkRequests, eq } from '@titan/database'

const token = process.env['WALLET_BOT_TOKEN']
if (!token) throw new Error('WALLET_BOT_TOKEN is not set')

const WEBAPP_URL = process.env['WALLET_WEBAPP_URL'] ?? 'https://titanpos.ru/wallet'

export const bot = new Bot(token)

bot.command('start', async (ctx) => {
  const payload = ctx.match
  // Deep link: /start link_{profile_id}
  if (payload?.startsWith('link_')) {
    const profileId = payload.slice(5)
    const tgId = String(ctx.from?.id)
    const tgUsername = ctx.from?.username

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId))
    if (!profile) {
      await ctx.reply('❌ Профиль не найден')
      return
    }

    if (profile.tgId) {
      await ctx.reply('✅ Telegram уже привязан к этому профилю')
      return
    }

    // Create link request or auto-link
    await db.insert(tgLinkRequests).values({ profileId, tgId, tgUsername: tgUsername ?? null, status: 'approved' })
    await db.update(profiles).set({ tgId, tgUsername: tgUsername ?? null }).where(eq(profiles.id, profileId))

    await ctx.reply(`✅ Telegram привязан к профилю *${profile.nickname}*!`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '💳 Открыть кошелёк', web_app: { url: WEBAPP_URL } }]],
      },
    })
    return
  }

  await ctx.reply('👋 Добро пожаловать в Titan Wallet!', {
    reply_markup: {
      inline_keyboard: [[{ text: '💳 Открыть кошелёк', web_app: { url: WEBAPP_URL } }]],
    },
  })
})

bot.start()
console.log('💳 Wallet bot started')
