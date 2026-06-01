import { Bot, InlineKeyboard } from 'grammy'
import { db, profiles, tgLinkRequests, transactions, clientTiers, eq, desc } from '@titan/database'
import { createHmac, timingSafeEqual } from 'node:crypto'

const token = process.env['WALLET_BOT_TOKEN']
if (!token) throw new Error('WALLET_BOT_TOKEN is not set')

// Секрет для подписи диплинк-токенов привязки. Тот же JWT_SECRET, что и у API
// (jose использует его для токенов), поэтому отдельной переменной не вводим.
// Без секрета подпись проверить нельзя → привязка по ссылке невозможна.
const LINK_SECRET = process.env['JWT_SECRET']
if (!LINK_SECRET || LINK_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set (>=32 chars) for signed account-linking deep links')
}

const WEBAPP_URL = process.env['WALLET_WEBAPP_URL'] ?? 'https://titanpos.ru/wallet'

// Экранирование спецсимволов legacy-Markdown (parse_mode:'Markdown'). Без него
// пользовательские значения (ник, описание) с _ * [ ` ломают всё сообщение:
// Telegram возвращает 400 и сообщение не отправляется (тихий «нет ответа»).
function escapeMd(s: string): string {
  return s.replace(/[\\_*[`]/g, '\\$&')
}

// ── Подписанный диплинк привязки аккаунта ───────────────────────────────────
// Раньше payload был сырым `link_<profileId>`: ссылка plaintext и расшаривается,
// поэтому любой, кто её увидел, мог привязать ЧУЖОЙ непривязанный профиль к себе
// (takeover). Теперь payload обязан содержать HMAC-подпись над profileId+сроком,
// поэтому валидную ссылку может выпустить только сервер (он держит JWT_SECRET).
//
// ОГРАНИЧЕНИЯ Telegram start-payload (КРИТИЧНО для формата): максимум 64 символа,
// алфавит ТОЛЬКО [A-Za-z0-9_-]. Точка '.' НЕ допускается. Поэтому:
//   • разделитель полей — '_' (он разрешён);
//   • UUID профиля кодируем как 16 СЫРЫХ байт в base64url (22 симв.), а не как
//     hex/каноническую строку — компактнее и без '-' внутри значения проблем нет;
//   • exp — base36 (компактно, в алфавите).
//
// ТОЧНЫЙ ФОРМАТ ТОКЕНА, который ДОЛЖЕН выпускать issuer (касса/админ-бот):
//
//   idB64   = base64url( 16 байт UUID профиля в бинарном виде )      // 22 симв.
//   expB36  = exp.toString(36)                                       // exp = UNIX-секунды (целое)
//   sigMsg  = `${idB64}_${expB36}`                                   // ровно то, что подписываем
//   sigBuf  = HMAC_SHA256(key = JWT_SECRET, message = sigMsg)        // 32 байта
//   sig     = base64url( sigBuf.subarray(0, 12) )                    // 12 байт → 16 симв.
//   payload = `link_${idB64}_${expB36}_${sig}`
//
//   Длина: 5 + 22 + 1 + ~7 + 1 + 16 ≈ 52 симв. — в пределах 64.
//
// Диплинк: https://t.me/<bot_username>?start=<payload>
//
// Заметки для issuer:
//   • Рекомендуемый срок: 15 минут (exp = Math.floor(Date.now()/1000) + 15*60).
//   • base64url = обычный base64, '+'→'-', '/'→'_', паддинг '=' убран.
//   • 16 байт UUID: убрать дефисы из profiles.id и взять Buffer.from(hex32, 'hex').
//   • Подпись считается над строкой `idB64_expB36` ДО добавления '_sig' и префикса.
//   • HMAC усечён до 12 байт (96 бит) — достаточно стойко для 15-мин окна и влезает
//     в лимит длины.
const LINK_TTL_SECONDS = 15 * 60

// base64url(16 байт) → канонический UUID (8-4-4-4-12), либо null если невалидно.
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
  return createHmac('sha256', LINK_SECRET!)
    .update(sigMsg)
    .digest()
    .subarray(0, 12)
    .toString('base64url')
}

type LinkVerify =
  | { ok: true; profileId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

// Проверяет payload вида `<idB64>_<expB36>_<sig>` (без префикса 'link_').
function verifyLink(raw: string): LinkVerify {
  const parts = raw.split('_')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [idB64, expB36, sig] = parts
  if (!idB64 || !expB36 || !sig) return { ok: false, reason: 'malformed' }

  // Строгий разбор base36: parseInt терпим к мусору в хвосте, поэтому требуем
  // точный round-trip (иначе токен с «левым» хвостом в exp прошёл бы как валидный
  // до проверки подписи). Заодно гарантируем нижний регистр и отсутствие знака.
  if (!/^[0-9a-z]+$/.test(expB36)) return { ok: false, reason: 'malformed' }
  const exp = parseInt(expB36, 36)
  if (!Number.isSafeInteger(exp) || exp <= 0 || exp.toString(36) !== expB36) {
    return { ok: false, reason: 'malformed' }
  }

  const profileId = idB64ToUuid(idB64)
  if (!profileId) return { ok: false, reason: 'malformed' }

  // Сверяем подпись в постоянном времени над строкой `idB64_expB36`.
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

  // Срок: отклоняем истёкшие и неправдоподобно «долгие» токены (защита от
  // кривого/подделанного issuer — корректный ставит exp = now + LINK_TTL_SECONDS).
  const now = Math.floor(Date.now() / 1000)
  if (exp < now) return { ok: false, reason: 'expired' }
  if (exp > now + LINK_TTL_SECONDS + 60) return { ok: false, reason: 'expired' }

  return { ok: true, profileId }
}

export const bot = new Bot(token)

const walletKeyboard = new InlineKeyboard()
  .text('💰 Баланс', 'balance').text('📋 История', 'history').row()
  .text('🔔 Уведомления', 'notif').row()
  .webApp('💳 Открыть кошелёк', WEBAPP_URL)

bot.command('start', async (ctx) => {
  const payload = ctx.match
  const tgId = String(ctx.from?.id)
  const tgUsername = ctx.from?.username

  if (payload?.startsWith('link_')) {
    // Проверяем ПОДПИСЬ и СРОК токена ДО любого обращения к БД: сырой profileId
    // больше не принимаем (защита от takeover чужого профиля по расшаренной ссылке).
    const verified = verifyLink(payload.slice(5))
    if (!verified.ok) {
      await ctx.reply('❌ Ссылка недействительна или устарела. Попросите администратора прислать новую.')
      return
    }
    const profileId = verified.profileId

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId))
    if (!profile) {
      await ctx.reply('❌ Профиль не найден')
      return
    }
    if (profile.tgId) {
      await ctx.reply('✅ Telegram уже привязан к этому профилю')
      return
    }
    // profiles.tg_id — UNIQUE. Если текущий Telegram уже привязан к ДРУГОМУ
    // профилю, вставка/обновление упадёт на нарушении уникальности (и тихо
    // проглотится bot.catch, оставив осиротевший tg_link_requests). Проверяем
    // заранее и отвечаем понятно.
    const [existingByTg] = await db.select().from(profiles).where(eq(profiles.tgId, tgId))
    if (existingByTg && existingByTg.id !== profileId) {
      await ctx.reply('❌ Этот Telegram уже привязан к другому профилю')
      return
    }
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tgLinkRequests).values({ profileId, tgId, tgUsername: tgUsername ?? null, status: 'approved' })
        await tx.update(profiles).set({ tgId, tgUsername: tgUsername ?? null }).where(eq(profiles.id, profileId))
      })
    } catch (err) {
      // Гонка: тот же tgId мог быть привязан между проверкой и вставкой →
      // нарушение UNIQUE. Отвечаем понятно, а не падаем молча.
      console.error('[bot-wallet] link failed:', err)
      await ctx.reply('❌ Этот Telegram уже привязан к другому профилю')
      return
    }
    await ctx.reply(
      `✅ Telegram привязан к профилю *${escapeMd(profile.nickname)}*!\n\nТеперь вы можете проверять баланс прямо здесь.`,
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
    `👋 Привет, *${escapeMd(profile.nickname)}*!`,
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
  const [tier] = await db.select().from(clientTiers).where(eq(clientTiers.key, profile.clientTier))
  const tierLabel = tier?.label ?? profile.clientTier
  const bal = parseFloat(profile.balance) || 0
  const deposit = Math.max(0, bal)
  const debt = Math.max(0, -bal)
  const lines = [
    `💰 *Кошелёк ${escapeMd(profile.nickname)}*`,
    ``,
    `Статус: *${escapeMd(tierLabel)}*`,
  ]
  if (deposit > 0) lines.push(`Депозит: *${deposit.toLocaleString('ru')} ₽*`)
  if (debt > 0) lines.push(`Долг: *${debt.toLocaleString('ru')} ₽*`)
  if (deposit === 0 && debt === 0) lines.push(`Баланс: *0 ₽*`)
  lines.push(`Бонусы: *${parseFloat(profile.bonusPoints).toFixed(0)} ⭐*`)
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
})

// Уведомления клиента (начисление бонусов, депозит, долг) — вкл/выкл.
bot.callbackQuery('notif', async (ctx) => {
  await ctx.answerCallbackQuery()
  const [profile] = await db.select().from(profiles).where(eq(profiles.tgId, String(ctx.from?.id)))
  if (!profile) { await ctx.reply('❌ Аккаунт не привязан.'); return }
  const on = profile.walletNotifyEnabled !== false
  const kb = new InlineKeyboard().text(on ? '🔕 Выключить' : '🔔 Включить', on ? 'notif_off' : 'notif_on')
  await ctx.reply(`🔔 Уведомления о бонусах, депозите и долге сейчас *${on ? 'включены' : 'выключены'}*.`, { parse_mode: 'Markdown', reply_markup: kb })
})
bot.callbackQuery('notif_off', async (ctx) => {
  await ctx.answerCallbackQuery()
  await db.update(profiles).set({ walletNotifyEnabled: false }).where(eq(profiles.tgId, String(ctx.from?.id)))
  await ctx.reply('🔕 Уведомления выключены. Включить можно кнопкой «Уведомления».')
})
bot.callbackQuery('notif_on', async (ctx) => {
  await ctx.answerCallbackQuery()
  await db.update(profiles).set({ walletNotifyEnabled: true }).where(eq(profiles.tgId, String(ctx.from?.id)))
  await ctx.reply('🔔 Уведомления включены.')
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
    `${TYPE_EMOJI[t.type] ?? '•'} ${parseFloat(t.amount).toLocaleString('ru')} ₽${t.description ? ` — ${escapeMd(t.description)}` : ''}`
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
