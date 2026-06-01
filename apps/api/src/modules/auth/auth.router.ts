import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, profiles, transactions, bonusLots, bonusHistory, checks, checkItems, checkPayments, checkDiscounts, inventory, eq, and, isNull, inArray, desc, gt, sql } from '@titan/database'
import { visitProgress } from '../../lib/loyalty.js'
// @ts-ignore
import { passkeys } from '@titan/database'
import { signToken, verifyPin, verifyPassword, hashPassword, hashPin, isPlaintext, verifyTelegramInitData } from '@titan/auth'
import { LoginPinSchema, LoginPasswordSchema, LoginTelegramSchema, SetPinSchema } from '@titan/types'
import { requireAuth, tokenHash } from '../../middleware/auth.js'
import { getSharedRedis } from '../../lib/redis.js'
import { clientIp } from '../../lib/clientIp.js'
import { Redis } from 'ioredis'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import type { AppEnv } from '../../types.js'
import { z } from 'zod'
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers'

const RP_NAME = process.env['WEBAUTHN_RP_NAME'] ?? 'Titan HUB'
const RP_ID = process.env['WEBAUTHN_RP_ID'] ?? 'localhost'
const ORIGIN = process.env['WEBAUTHN_ORIGIN'] ?? 'http://localhost:3000'

function getRedis() {
  return new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', { lazyConnect: true })
}

export const authRouter = new Hono<AppEnv>()

// Rate limiting для PIN: 5 попыток за 15 минут (по IP+userId)
const PIN_MAX_ATTEMPTS = 5
const PIN_WINDOW_SECONDS = 900

// ЖЁСТКИЙ глобальный потолок для пути БЕЗ userId (перебор по всем staff/owner).
// Этот путь сверяет один 4-значный PIN со ВСЕМИ профилями staff/owner, поэтому
// реальное пространство ключей крошечное, а per-IP лимит подделывается (см. ниже).
// Счётчик висит на фиксированном ключе, который клиент НЕ контролирует, поэтому
// ограничивает суммарное число неудачных fan-out попыток по всему деплою за окно,
// независимо от IP. Это и есть настоящий backstop против brute-force PIN.
const PIN_GLOBAL_FAIL_KEY = 'pin:fail:global'
const PIN_GLOBAL_MAX = 50 // суммарных неудачных попыток без userId за окно

// Реальный IP клиента. nginx ставит X-Real-IP = $remote_addr (подделать нельзя).
// ДОВЕРИЕ: оба заголовка (X-Real-IP и X-Forwarded-For) в общем случае подделываемы
// клиентом, поэтому per-IP bucket — лишь "вежливый" троттлинг. Для security-решений
// на нём НЕ полагаемся: реальную защиту даёт глобальный потолок PIN_GLOBAL_FAIL_KEY.
// clientIp — общий доверенный резолвер (apps/api/src/lib/clientIp.ts).

authRouter.post('/login/pin', zValidator('json', LoginPinSchema), async (c) => {
  const { pin, userId } = c.req.valid('json')

  // Идентификатор для rate-limit: доверенный IP + userId (если указан)
  const ip = clientIp(c)
  const key = `pin:fail:${ip}:${userId ?? 'any'}`

  const redis = getRedis()
  try {
    await redis.connect()
    const failsRaw = await redis.get(key)
    const fails = parseInt(failsRaw ?? '0')
    if (fails >= PIN_MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key)
      return c.json({
        error: `Слишком много попыток. Попробуйте через ${Math.ceil(ttl / 60)} мин.`,
      }, 429)
    }

    // ЖЁСТКИЙ глобальный backstop ТОЛЬКО для опасного fan-out пути (без userId):
    // он сверяет один PIN со всеми staff/owner, поэтому per-IP лимит (подделываемый)
    // не защищает. Глобальный счётчик не зависит от заголовков клиента и ограничивает
    // суммарное число неудачных попыток по всему деплою за окно.
    if (!userId) {
      const globalFails = parseInt((await redis.get(PIN_GLOBAL_FAIL_KEY)) ?? '0')
      if (globalFails >= PIN_GLOBAL_MAX) {
        const ttl = await redis.ttl(PIN_GLOBAL_FAIL_KEY)
        return c.json({
          error: `Слишком много попыток. Попробуйте через ${Math.ceil(Math.max(ttl, 0) / 60)} мин.`,
        }, 429)
      }
    }

    // PIN-вход доступен только персоналу/владельцу (клиенты/планшеты входят иначе).
    // Без userId перебираем ТОЛЬКО staff/owner — не всех и не client/tablet.
    const staffOnly = inArray(profiles.role, ['owner', 'staff'])
    const where = userId
      ? and(eq(profiles.id, userId), staffOnly)
      : and(isNull(profiles.deletedAt), staffOnly)
    const all = await db.select().from(profiles).where(where)
    for (const profile of all) {
      if (!profile.pin) continue
      const ok = await verifyPin(pin, profile.pin)
      if (ok) {
        // Сбрасываем счётчик при успехе
        await redis.del(key)
        const token = await signToken({ sub: profile.id, role: profile.role, nickname: profile.nickname })
        return c.json({ token, user: { id: profile.id, nickname: profile.nickname, role: profile.role, photoUrl: profile.photoUrl } })
      }
    }

    // Инкремент счётчика неудач + TTL (мягкий per-IP bucket).
    await redis.incr(key)
    await redis.expire(key, PIN_WINDOW_SECONDS)
    // Для fan-out пути (без userId) дополнительно бьём ЖЁСТКИЙ глобальный счётчик —
    // это и есть реальный потолок против brute-force 4-значного PIN по всем staff.
    if (!userId) {
      await redis.incr(PIN_GLOBAL_FAIL_KEY)
      await redis.expire(PIN_GLOBAL_FAIL_KEY, PIN_WINDOW_SECONDS)
    }
    const remaining = PIN_MAX_ATTEMPTS - (fails + 1)
    return c.json({
      error: remaining > 0
        ? `Неверный PIN. Осталось попыток: ${remaining}`
        : 'Неверный PIN. Аккаунт временно заблокирован.',
    }, 401)
  } finally {
    redis.disconnect()
  }
})

authRouter.post('/login/password', zValidator('json', LoginPasswordSchema), async (c) => {
  const { nickname, password } = c.req.valid('json')

  // Rate limit для пароля: 5 попыток / 15 мин (по доверенному IP + нику)
  const ip = clientIp(c)
  const key = `pwd:fail:${ip}:${nickname}`
  const redis = getRedis()
  await redis.connect()
  try {
    const failsRaw = await redis.get(key)
    const fails = parseInt(failsRaw ?? '0')
    if (fails >= PIN_MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key)
      return c.json({
        error: `Слишком много попыток. Попробуйте через ${Math.ceil(ttl / 60)} мин.`,
      }, 429)
    }

    const [profile] = await db.select().from(profiles).where(eq(profiles.nickname, nickname))
    if (!profile?.passwordHash) {
      await redis.incr(key)
      await redis.expire(key, PIN_WINDOW_SECONDS)
      return c.json({ error: 'User not found' }, 404)
    }

    let ok = false
    if (isPlaintext(profile.passwordHash)) {
      ok = password === profile.passwordHash
      if (ok) {
        const newHash = await hashPassword(password)
        await db.update(profiles).set({ passwordHash: newHash }).where(eq(profiles.id, profile.id))
      }
    } else {
      ok = await verifyPassword(password, profile.passwordHash)
    }
    if (!ok) {
      await redis.incr(key)
      await redis.expire(key, PIN_WINDOW_SECONDS)
      return c.json({ error: 'Invalid password' }, 401)
    }

    // Успешный вход — сбрасываем счётчик
    await redis.del(key)
    return await continueLoginPassword(c, profile)
  } finally {
    redis.disconnect()
  }
})

// Хелпер: завершение успешного password-логина
async function continueLoginPassword(c: any, profile: any) {
  const needsPinSetup = !profile.pin
  // Check if user has any passkeys registered
  const userPasskeys = await db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, profile.id))
  const hasPasskey = userPasskeys.length > 0
  const token = await signToken({ sub: profile.id, role: profile.role, nickname: profile.nickname })
  return c.json({ token, needsPinSetup, hasPasskey, user: { id: profile.id, nickname: profile.nickname, role: profile.role, photoUrl: profile.photoUrl } })
}

// ── POST /auth/tablet-pair — привязка планшета по 6-значному коду ────────
// Owner генерирует код в /manage/spaces, планшет вводит его на /tablet/pair.
// Создаёт профиль с ролью 'tablet' и привязкой к пространству.
authRouter.post(
  '/tablet-pair',
  zValidator('json', z.object({
    code: z.string().regex(/^\d{6}$/, '6-значный код'),
    deviceName: z.string().max(64).optional(),
  })),
  async (c) => {
    const { code, deviceName } = c.req.valid('json')

    // Rate-limit перебора 6-значного кода (как у PIN): по доверенному IP.
    const ip = clientIp(c)
    const rlKey = `tabletpair:fail:${ip}`
    const redis = getRedis()
    try {
      await redis.connect()
      const fails = parseInt((await redis.get(rlKey)) ?? '0')
      if (fails >= PIN_MAX_ATTEMPTS) {
        const ttl = await redis.ttl(rlKey)
        return c.json({ error: `Слишком много попыток. Попробуйте через ${Math.ceil(ttl / 60)} мин.` }, 429)
      }

      const spaceId = await redis.get(`tablet:pair:${code}`)
      if (!spaceId) {
        await redis.incr(rlKey)
        await redis.expire(rlKey, PIN_WINDOW_SECONDS)
        return c.json({ error: 'Неверный или истёкший код' }, 401)
      }
      await redis.del(`tablet:pair:${code}`)  // одноразовый код
      await redis.del(rlKey)                  // сброс счётчика при успехе

      // Один планшет на зону: переиспользуем существующий tablet-профиль зоны
      // (не плодим профили на каждый pair), иначе создаём новый.
      const nickname = deviceName ?? `Tablet ${code}`
      const existing = await db.select().from(profiles)
        .where(and(eq(profiles.role, 'tablet'), eq(profiles.linkedSpaceId, spaceId), isNull(profiles.deletedAt)))
        .limit(1)
      let profile = existing[0]
      if (profile) {
        await db.update(profiles).set({ nickname }).where(eq(profiles.id, profile.id))
      } else {
        const inserted = await db.insert(profiles).values({
          nickname,
          role: 'tablet',
          linkedSpaceId: spaceId,
        } as any).returning()
        profile = inserted[0]
      }
      if (!profile) return c.json({ error: 'Не удалось создать планшет' }, 500)

      // JWT с длинным TTL (30 дней)
      const token = await signToken(
        { sub: profile.id, role: profile.role, nickname: profile.nickname },
        '30d',
      )
      return c.json({
        token,
        user: {
          id: profile.id,
          nickname: profile.nickname,
          role: profile.role,
          photoUrl: profile.photoUrl,
          linkedSpaceId: spaceId,
        },
      })
    } finally {
      redis.disconnect()
    }
  },
)

authRouter.post('/login/telegram', zValidator('json', LoginTelegramSchema), async (c) => {
  const { initData } = c.req.valid('json')
  // WebApp может быть запущен из ЛЮБОГО бота (кошелёк — из wallet-бота, поэтому
  // initData подписан токеном wallet-бота). Раньше брали ADMIN-токен первым через
  // ?? — для wallet-WebApp подпись не сходилась → 401 и пустой кошелёк. Проверяем
  // по обоим токенам: успех, если совпало хотя бы с одним.
  const walletToken = process.env['WALLET_BOT_TOKEN'] ?? ''
  const adminToken = process.env['ADMIN_BOT_TOKEN'] ?? ''
  const valid =
    (walletToken && verifyTelegramInitData(initData, walletToken)) ||
    (adminToken && verifyTelegramInitData(initData, adminToken))
  if (!valid) {
    return c.json({ error: 'Invalid Telegram data' }, 401)
  }
  const params = new URLSearchParams(initData)
  const userStr = params.get('user')
  if (!userStr) return c.json({ error: 'No user data' }, 400)
  const tgUser = JSON.parse(userStr) as { id: number; username?: string }
  const [profile] = await db.select().from(profiles).where(eq(profiles.tgId, String(tgUser.id)))
  if (!profile) return c.json({ error: 'Not linked' }, 404)
  const token = await signToken({ sub: profile.id, role: profile.role, nickname: profile.nickname })
  return c.json({ token, user: { id: profile.id, nickname: profile.nickname, role: profile.role, photoUrl: profile.photoUrl } })
})

authRouter.post('/pin/set', requireAuth, zValidator('json', SetPinSchema), async (c) => {
  const user = c.get('user')
  const { pin } = c.req.valid('json')
  const hashed = await hashPin(pin)
  await db.update(profiles).set({ pin: hashed, needsPinSetup: false }).where(eq(profiles.id, user.sub))
  return c.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (c) => {
  const user = c.get('user')
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.sub))
  if (!profile) return c.json({ error: 'Not found' }, 404)
  const { pin, passwordHash, ...safe } = profile
  return c.json(safe)
})

// Свои активные бонус-лоты (для экрана сгорания бонусов в кошельке) — строго по
// своему профилю (user.sub === bonusLots.profileId); id клиента из запроса НЕ берём.
// Возвращаем лоты с остатком, сначала ближайшие к сгоранию; бессрочные (NULL) — в конце.
authRouter.get('/me/bonus-lots', requireAuth, async (c) => {
  const user = c.get('user')
  const lots = await db.select({
    amount: bonusLots.amount,
    remaining: bonusLots.remaining,
    expiresAt: bonusLots.expiresAt,
  }).from(bonusLots)
    .where(and(eq(bonusLots.profileId, user.sub), gt(bonusLots.remaining, '0')))
    .orderBy(sql`${bonusLots.expiresAt} ASC NULLS LAST`)
  return c.json({ lots })
})

// Свои транзакции (для клиентского кошелька) — строго по своему профилю.
authRouter.get('/me/transactions', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await db.select({
    id: transactions.id,
    type: transactions.type,
    amount: transactions.amount,
    description: transactions.description,
    checkId: transactions.checkId,
    createdAt: transactions.createdAt,
  }).from(transactions)
    .where(eq(transactions.playerId, user.sub))
    .orderBy(desc(transactions.createdAt))
    .limit(50)
  return c.json({ transactions: rows })
})

// Своя история бонусов (для единого фида в кошельке) — строго по своему профилю.
// amount знаковый: + начисление, − списание.
authRouter.get('/me/bonus-history', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await db.select({
    id: bonusHistory.id,
    amount: bonusHistory.amount,
    reason: bonusHistory.reason,
    createdAt: bonusHistory.createdAt,
  }).from(bonusHistory)
    .where(eq(bonusHistory.profileId, user.sub))
    .orderBy(desc(bonusHistory.createdAt))
    .limit(50)
  return c.json({ history: rows })
})

// Свой прогресс к статусу Резидент (для Wallet).
authRouter.get('/me/visit-progress', requireAuth, async (c) => {
  return c.json(await visitProgress(c.get('user').sub))
})

// Деталь СВОЕГО чека (для Wallet) — позиции, скидки, оплата, дата. Только если
// чек принадлежит этому клиенту (playerId === user.sub).
authRouter.get('/me/checks/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const [check] = await db.select().from(checks).where(and(eq(checks.id, id), eq(checks.playerId, user.sub))).limit(1)
  if (!check) return c.json({ error: 'not_found' }, 404)
  const items = await db.select({ name: inventory.name, quantity: checkItems.quantity, priceAtTime: checkItems.priceAtTime })
    .from(checkItems).leftJoin(inventory, eq(inventory.id, checkItems.itemId)).where(eq(checkItems.checkId, id))
  const payments = await db.select({ method: checkPayments.method, amount: checkPayments.amount }).from(checkPayments).where(eq(checkPayments.checkId, id))
  const discounts = await db.select({ name: checkDiscounts.name, amount: checkDiscounts.amount }).from(checkDiscounts).where(eq(checkDiscounts.checkId, id))
  return c.json({
    check: { id: check.id, totalAmount: parseFloat(String(check.totalAmount)) || 0, createdAt: check.createdAt, closedAt: check.closedAt },
    items: items.map(i => ({ name: i.name ?? '—', quantity: Number(i.quantity), priceAtTime: parseFloat(String(i.priceAtTime)) || 0, lineTotal: (parseFloat(String(i.priceAtTime)) || 0) * Number(i.quantity) })),
    payments: payments.map(p => ({ method: p.method, amount: parseFloat(String(p.amount)) || 0 })),
    discounts: discounts.map(d => ({ name: d.name, amount: parseFloat(String(d.amount)) || 0 })),
  })
})

// Серверный logout: отзываем текущий токен (blacklist в Redis до его exp).
authRouter.post('/logout', requireAuth, async (c) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : c.req.query('token')
  if (token) {
    const user = c.get('user')
    const ttl = user?.exp ? Math.max(1, user.exp - Math.floor(Date.now() / 1000)) : 7 * 24 * 3600
    try { await getSharedRedis().set(`revoked:${tokenHash(token)}`, '1', 'EX', ttl) } catch { /* ignore */ }
  }
  return c.json({ ok: true })
})

// Одноразовый короткоживущий тикет для EventSource (SSE). Полноценный JWT в
// ?token= утекал бы в логи nginx/историю браузера и реиграбелен (до 30 дней у
// планшета). Вместо него фронт берёт ticket по Bearer-авторизации и кладёт в URL
// ?ticket=...; requireAuth принимает его, проверяя в Redis (TTL 60с, одноразовый).
authRouter.post('/sse-ticket', requireAuth, async (c) => {
  const user = c.get('user')
  const ticket = crypto.randomUUID()
  try {
    await getSharedRedis().set(
      `sse:${ticket}`,
      JSON.stringify({ sub: user.sub, role: user.role, nickname: user.nickname }),
      'EX', 60,
    )
  } catch {
    return c.json({ error: 'SSE недоступен' }, 503)
  }
  return c.json({ ticket })
})

// ── Passkey / WebAuthn endpoints ────────────────────────────────────────────

// GET /auth/passkey/list  (requires auth) → list user's passkeys
authRouter.get('/passkey/list', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await db
    .select({ id: passkeys.id, deviceType: passkeys.deviceType, backedUp: passkeys.backedUp, createdAt: passkeys.createdAt })
    .from(passkeys)
    .where(eq(passkeys.userId, user.sub))
  return c.json({ passkeys: rows })
})

// DELETE /auth/passkey/:id  (requires auth) → remove a passkey
authRouter.delete('/passkey/:id', requireAuth, async (c) => {
  const user = c.get('user')
  // Только свой passkey (иначе IDOR — удаление чужого ключа по id).
  await db.delete(passkeys).where(and(eq(passkeys.id, c.req.param('id')), eq(passkeys.userId, user.sub)))
  return c.json({ ok: true })
})

// POST /auth/passkey/register/options  (requires auth)
authRouter.post('/passkey/register/options', requireAuth, async (c) => {
  const user = c.get('user')
  const userId = user.sub

  // Fetch existing credentials to exclude from registration
  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, userId))
  const excludeCredentials = existing.map((pk: any) => ({
    id: pk.id,
    transports: (pk.transports ?? []) as AuthenticatorTransportFuture[],
  }))

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: isoUint8Array.fromUTF8String(userId),
    userName: userId,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  const redis = getRedis()
  try {
    await redis.connect()
    await redis.set(`titan:pk:reg:${userId}`, options.challenge, 'EX', 300)
  } finally {
    redis.disconnect()
  }

  return c.json(options)
})

// POST /auth/passkey/register/verify  (requires auth)
authRouter.post('/passkey/register/verify', requireAuth, async (c) => {
  const user = c.get('user')
  const userId = user.sub
  const body = await c.req.json()

  const redis = getRedis()
  let expectedChallenge: string | null = null
  try {
    await redis.connect()
    expectedChallenge = await redis.get(`titan:pk:reg:${userId}`)
  } finally {
    redis.disconnect()
  }

  if (!expectedChallenge) {
    return c.json({ error: 'Challenge not found or expired' }, 400)
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    })
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Verification failed' }, 400)
  }

  const { verified, registrationInfo } = verification
  if (!verified || !registrationInfo) {
    return c.json({ error: 'Verification failed' }, 400)
  }

  const { credential } = registrationInfo
  await db.insert(passkeys).values({
    id: credential.id,
    userId,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    deviceType: registrationInfo.credentialDeviceType ?? null,
    backedUp: registrationInfo.credentialBackedUp ?? false,
    transports: (credential.transports as string[]) ?? [],
  })

  const redis2 = getRedis()
  try {
    await redis2.connect()
    await redis2.del(`titan:pk:reg:${userId}`)
  } finally {
    redis2.disconnect()
  }

  return c.json({ ok: true })
})

// POST /auth/passkey/authenticate/options  (no auth required)
authRouter.post(
  '/passkey/authenticate/options',
  zValidator('json', z.object({ userId: z.string().optional() })),
  async (c) => {
    const { userId } = c.req.valid('json')

    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = []
    if (userId) {
      const existing = await db.select().from(passkeys).where(eq(passkeys.userId, userId))
      allowCredentials = existing.map((pk: any) => ({
        id: pk.id,
        transports: (pk.transports ?? []) as AuthenticatorTransportFuture[],
      }))
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    })

    const challengeId = crypto.randomUUID()
    const redis = getRedis()
    try {
      await redis.connect()
      await redis.set(
        `titan:pk:authn:${challengeId}`,
        JSON.stringify({ challenge: options.challenge, userId }),
        'EX',
        300,
      )
    } finally {
      redis.disconnect()
    }

    return c.json({ options, challengeId })
  },
)

// POST /auth/passkey/authenticate/verify  (no auth required)
authRouter.post(
  '/passkey/authenticate/verify',
  zValidator('json', z.object({ challengeId: z.string(), response: z.any() })),
  async (c) => {
    const { challengeId, response } = c.req.valid('json')

    const redis = getRedis()
    let raw: string | null = null
    try {
      await redis.connect()
      raw = await redis.get(`titan:pk:authn:${challengeId}`)
    } finally {
      redis.disconnect()
    }

    if (!raw) {
      return c.json({ error: 'Challenge not found or expired' }, 400)
    }

    const { challenge: expectedChallenge, userId: knownUserId } = JSON.parse(raw) as {
      challenge: string
      userId?: string
    }

    // Find the passkey record
    let pkRecord: any = null
    if (knownUserId) {
      const rows = await db
        .select()
        .from(passkeys)
        .where(eq(passkeys.userId, knownUserId))
      pkRecord = rows.find((pk: any) => pk.id === response.id) ?? null
    } else {
      const rows = await db.select().from(passkeys).where(eq(passkeys.id, response.id))
      pkRecord = rows[0] ?? null
    }

    if (!pkRecord) {
      return c.json({ error: 'Passkey not found' }, 404)
    }

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: pkRecord.id,
          publicKey: isoBase64URL.toBuffer(pkRecord.publicKey),
          counter: pkRecord.counter,
          transports: (pkRecord.transports ?? []) as AuthenticatorTransportFuture[],
        },
      })
    } catch (err: any) {
      return c.json({ error: err.message ?? 'Verification failed' }, 400)
    }

    const { verified, authenticationInfo } = verification
    if (!verified) {
      return c.json({ error: 'Authentication failed' }, 401)
    }

    // Update counter
    await db
      .update(passkeys)
      .set({ counter: authenticationInfo.newCounter })
      .where(eq(passkeys.id, pkRecord.id))

    // Delete challenge
    const redis2 = getRedis()
    try {
      await redis2.connect()
      await redis2.del(`titan:pk:authn:${challengeId}`)
    } finally {
      redis2.disconnect()
    }

    // Get user profile and sign JWT
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, pkRecord.userId))
    if (!profile) return c.json({ error: 'User not found' }, 404)

    const token = await signToken({ sub: profile.id, role: profile.role, nickname: profile.nickname })
    return c.json({ token, user: { id: profile.id, nickname: profile.nickname, role: profile.role, photoUrl: profile.photoUrl } })
  },
)
