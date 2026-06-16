import { Bot, InlineKeyboard } from 'grammy'
import { profiles, tgLinkRequests, transactions, clientTiers, appSettings, walletLoginCodes, eq, and, gt, desc, type Database } from '@titan/database'
import { createHmac, timingSafeEqual } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Фабрика wallet-бота (мульти-тенант). createWalletBot(ctx) поднимает grammy Bot
// для КОНКРЕТНОГО клуба: его токен, его БД (ctx.db) и его WebApp-URL кошелька
// (ctx.webappUrl — публичный URL клуба). Дефолтный клуб = env-токен + синглтон +
// основной WALLET_WEBAPP_URL → поведение байт-в-байт прежнее (см. index.ts).
//
// Чистые хелперы (подписи диплинков, экранирование) — на уровне модуля: не зависят
// от клуба (LINK_SECRET = общий JWT_SECRET; профиль резолвится из ctx.db).
// ─────────────────────────────────────────────────────────────────────────────

const LINK_SECRET = process.env['JWT_SECRET']
if (!LINK_SECRET || LINK_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set (>=32 chars) for signed account-linking deep links')
}

const LINK_TTL_SECONDS = 15 * 60

function escapeMd(s: string): string {
  return s.replace(/[\\_*[`]/g, '\\$&')
}

function idB64ToUuid(idB64: string): string | null {
  let buf: Buffer
  try {
    buf = Buffer.from(idB64, 'base64url')
  } catch {
    return null
  }
  if (buf.length !== 16) return null
  const hex = buf.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function signLink(sigMsg: string): string {
  return createHmac('sha256', LINK_SECRET!).update(sigMsg).digest().subarray(0, 12).toString('base64url')
}

type LinkVerify =
  | { ok: true; profileId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

function verifyLink(raw: string): LinkVerify {
  // idB64 и sig — base64url (САМИ содержат '_' и '-'), поэтому payload НЕЛЬЗЯ делить
  // по '_' (раньше split('_') ломал ~42% ссылок → «недействительна»). Парсим по
  // ФИКСИРОВАННЫМ длинам: idB64=22, sig=16, между ними expB36. Формат:
  // <idB64:22>_<expB36>_<sig:16>.
  const ID_LEN = 22
  const SIG_LEN = 16
  if (raw.length < ID_LEN + SIG_LEN + 3) return { ok: false, reason: 'malformed' }
  if (raw[ID_LEN] !== '_' || raw[raw.length - SIG_LEN - 1] !== '_') return { ok: false, reason: 'malformed' }
  const idB64 = raw.slice(0, ID_LEN)
  const sig = raw.slice(raw.length - SIG_LEN)
  const expB36 = raw.slice(ID_LEN + 1, raw.length - SIG_LEN - 1)
  if (!idB64 || !expB36 || !sig) return { ok: false, reason: 'malformed' }
  if (!/^[0-9a-z]+$/.test(expB36)) return { ok: false, reason: 'malformed' }
  const exp = parseInt(expB36, 36)
  if (!Number.isSafeInteger(exp) || exp <= 0 || exp.toString(36) !== expB36) {
    return { ok: false, reason: 'malformed' }
  }
  const profileId = idB64ToUuid(idB64)
  if (!profileId) return { ok: false, reason: 'malformed' }
  let provided: Buffer
  let expected: Buffer
  try {
    provided = Buffer.from(sig, 'base64url')
    expected = Buffer.from(signLink(`${idB64}_${expB36}`), 'base64url')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'bad_signature' }
  }
  const now = Math.floor(Date.now() / 1000)
  if (exp < now) return { ok: false, reason: 'expired' }
  if (exp > now + LINK_TTL_SECONDS + 60) return { ok: false, reason: 'expired' }
  return { ok: true, profileId }
}

export interface WalletBotCtx {
  token: string
  db: Database
  /** Публичный URL кошелька клуба, напр. https://titanpos.ru/wallet / https://kbr.titanpos.ru/wallet. */
  webappUrl: string
  label: string
}

export function createWalletBot(ctx: WalletBotCtx): Bot {
  const { db } = ctx
  const bot = new Bot(ctx.token)

  const walletKeyboard = new InlineKeyboard()
    .text('💰 Баланс', 'balance').text('📋 История', 'history').row()
    .text('🔔 Уведомления', 'notif').row()
    .webApp('💳 Открыть кошелёк', ctx.webappUrl)

  type Profile = typeof profiles.$inferSelect
  // Резолв профиля по TG: сначала основной tg_id, затем доп. аккаунты (один человек
  // — несколько TG). Карта tg_aliases в app_settings; формат синхронен
  // apps/api/src/lib/tgAliases.ts. Основной путь (прямое совпадение) не меняется.
  async function resolveProfileByTg(tgId: string): Promise<Profile | null> {
    const [direct] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
    if (direct) return direct
    try {
      const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, 'tg_aliases'))
      if (row?.value) {
        const map = JSON.parse(row.value) as Record<string, { profileId?: string }>
        const pid = map?.[tgId]?.profileId
        if (pid) {
          const [p] = await db.select().from(profiles).where(eq(profiles.id, pid))
          return p ?? null
        }
      }
    } catch { /* нет/битые алиасы */ }
    return null
  }

  bot.command('start', async (ctx2) => {
    const payload = ctx2.match
    const tgId = String(ctx2.from?.id)
    const tgUsername = ctx2.from?.username

    if (payload?.startsWith('link_')) {
      const verified = verifyLink(payload.slice(5))
      if (!verified.ok) {
        await ctx2.reply('❌ Ссылка недействительна или устарела. Попросите администратора прислать новую.')
        return
      }
      const profileId = verified.profileId

      const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId))
      if (!profile) {
        await ctx2.reply('❌ Профиль не найден')
        return
      }
      if (profile.tgId) {
        await ctx2.reply('✅ Telegram уже привязан к этому профилю')
        return
      }
      const [existingByTg] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
      if (existingByTg && existingByTg.id !== profileId) {
        await ctx2.reply('❌ Этот Telegram уже привязан к другому профилю')
        return
      }
      try {
        await db.transaction(async (tx) => {
          await tx.insert(tgLinkRequests).values({ profileId, tgId, tgUsername: tgUsername ?? null, status: 'approved' })
          await tx.update(profiles).set({ tgId, tgUsername: tgUsername ?? null }).where(eq(profiles.id, profileId))
        })
      } catch (err) {
        console.error(`[bot-wallet:${ctx.label}] link failed:`, err)
        await ctx2.reply('❌ Этот Telegram уже привязан к другому профилю')
        return
      }
      await ctx2.reply(
        `✅ Telegram привязан к профилю *${escapeMd(profile.nickname)}*!\n\nТеперь вы можете проверять баланс прямо здесь.`,
        { parse_mode: 'Markdown', reply_markup: walletKeyboard },
      )
      return
    }

    const profile = await resolveProfileByTg(tgId)
    if (!profile) {
      await ctx2.reply('👋 Добро пожаловать в Titan Wallet!\n\nЧтобы привязать аккаунт, обратитесь к администратору.')
      return
    }

    await ctx2.reply(`👋 Привет, *${escapeMd(profile.nickname)}*!`, { parse_mode: 'Markdown', reply_markup: walletKeyboard })
  })

  bot.callbackQuery('balance', async (ctx2) => {
    await ctx2.answerCallbackQuery()
    const tgId = String(ctx2.from?.id)
    const profile = await resolveProfileByTg(tgId)
    if (!profile) {
      await ctx2.reply('❌ Аккаунт не привязан. Используйте ссылку из кассы.')
      return
    }
    const [tier] = await db.select().from(clientTiers).where(eq(clientTiers.key, profile.clientTier))
    const tierLabel = tier?.label ?? profile.clientTier
    const bal = parseFloat(profile.balance) || 0
    const deposit = Math.max(0, bal)
    const debt = Math.max(0, -bal)
    const lines = [`💰 *Кошелёк ${escapeMd(profile.nickname)}*`, ``, `Статус: *${escapeMd(tierLabel)}*`]
    if (deposit > 0) lines.push(`Депозит: *${deposit.toLocaleString('ru')} ₽*`)
    if (debt > 0) lines.push(`Долг: *${debt.toLocaleString('ru')} ₽*`)
    if (deposit === 0 && debt === 0) lines.push(`Баланс: *0 ₽*`)
    lines.push(`Бонусы: *${parseFloat(profile.bonusPoints).toFixed(0)} ⭐*`)
    await ctx2.reply(lines.join('\n'), { parse_mode: 'Markdown' })
  })

  // Уведомления клиента (начисление бонусов, депозит, долг) — вкл/выкл.
  bot.callbackQuery('notif', async (ctx2) => {
    await ctx2.answerCallbackQuery()
    const profile = await resolveProfileByTg(String(ctx2.from?.id))
    if (!profile) { await ctx2.reply('❌ Аккаунт не привязан.'); return }
    const on = profile.walletNotifyEnabled !== false
    const kb = new InlineKeyboard().text(on ? '🔕 Выключить' : '🔔 Включить', on ? 'notif_off' : 'notif_on')
    await ctx2.reply(`🔔 Уведомления о бонусах, депозите и долге сейчас *${on ? 'включены' : 'выключены'}*.`, { parse_mode: 'Markdown', reply_markup: kb })
  })
  bot.callbackQuery('notif_off', async (ctx2) => {
    await ctx2.answerCallbackQuery()
    const profile = await resolveProfileByTg(String(ctx2.from?.id))
    if (profile) await db.update(profiles).set({ walletNotifyEnabled: false }).where(eq(profiles.id, profile.id))
    await ctx2.reply('🔕 Уведомления выключены. Включить можно кнопкой «Уведомления».')
  })
  bot.callbackQuery('notif_on', async (ctx2) => {
    await ctx2.answerCallbackQuery()
    const profile = await resolveProfileByTg(String(ctx2.from?.id))
    if (profile) await db.update(profiles).set({ walletNotifyEnabled: true }).where(eq(profiles.id, profile.id))
    await ctx2.reply('🔔 Уведомления включены.')
  })

  bot.callbackQuery('history', async (ctx2) => {
    await ctx2.answerCallbackQuery()
    const tgId = String(ctx2.from?.id)
    const profile = await resolveProfileByTg(tgId)
    if (!profile) {
      await ctx2.reply('❌ Аккаунт не привязан.')
      return
    }

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.playerId, profile.id))
      .orderBy(desc(transactions.createdAt))
      .limit(10)

    if (!txs.length) {
      await ctx2.reply('📋 История транзакций пуста')
      return
    }

    const TYPE_EMOJI: Record<string, string> = {
      deposit: '📥', withdrawal: '📤', payment: '🛒', refund: '↩️',
      bonus_accrual: '⭐', bonus_spend: '💫',
    }

    const text = txs.map((t) =>
      `${TYPE_EMOJI[t.type] ?? '•'} ${parseFloat(t.amount).toLocaleString('ru')} ₽${t.description ? ` — ${escapeMd(t.description)}` : ''}`,
    ).join('\n')

    await ctx2.reply(`📋 *Последние транзакции*\n\n${text}`, { parse_mode: 'Markdown' })
  })

  // Вход в кошелёк из браузера/PWA: клиент присылает 4-значный код, показанный в
  // открытом приложении. Привязываем pending-строку wallet_login_codes к профилю —
  // PWA увидит это через /auth/wallet-code/status и получит токен. Регистрируем
  // ПОСЛЕ command('start'): обычный текст «1234» сюда и попадает (команды — нет).
  bot.on('message:text', async (ctx2) => {
    const text = (ctx2.message?.text ?? '').trim()
    if (!/^\d{4}$/.test(text)) return // реагируем только на 4-значный код
    const tgId = String(ctx2.from?.id)
    const profile = await resolveProfileByTg(tgId)
    if (!profile) {
      await ctx2.reply('👋 Чтобы войти в кошелёк, сначала привяжите аккаунт — обратитесь к администратору клуба.')
      return
    }
    // Активный (pending, не истёкший) код. Берём самый свежий — на случай повторов.
    const [row] = await db.select().from(walletLoginCodes)
      .where(and(eq(walletLoginCodes.code, text), eq(walletLoginCodes.status, 'pending'), gt(walletLoginCodes.expiresAt, new Date())))
      .orderBy(desc(walletLoginCodes.createdAt))
      .limit(1)
    if (!row) {
      await ctx2.reply('❌ Код неверный или истёк. Откройте кошелёк в браузере и пришлите свежий 4-значный код.')
      return
    }
    await db.update(walletLoginCodes).set({ status: 'claimed', profileId: profile.id }).where(eq(walletLoginCodes.id, row.id))
    await ctx2.reply(
      `✅ Готово, *${escapeMd(profile.nickname)}*! Кошелёк открыт на устройстве — вернитесь в приложение.`,
      { parse_mode: 'Markdown', reply_markup: walletKeyboard },
    )
  })

  bot.catch((err) => {
    console.error(`[bot-wallet:${ctx.label}] handler error:`, err.error)
  })

  return bot
}
