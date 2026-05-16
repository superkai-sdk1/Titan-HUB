import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, profiles, eq, isNull } from '@titan/database'
// @ts-ignore
import { passkeys } from '@titan/database'
import { signToken, verifyPin, verifyPassword, hashPassword, hashPin, isPlaintext, verifyTelegramInitData } from '@titan/auth'
import { LoginPinSchema, LoginPasswordSchema, LoginTelegramSchema, SetPinSchema } from '@titan/types'
import { requireAuth } from '../../middleware/auth.js'
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

authRouter.post('/login/pin', zValidator('json', LoginPinSchema), async (c) => {
  const { pin, userId } = c.req.valid('json')

  // Идентификатор для rate-limit: IP + userId (если указан)
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown'
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

    // Find by userId or scan all staff
    const where = userId
      ? eq(profiles.id, userId)
      : isNull(profiles.deletedAt)
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

    // Инкремент счётчика неудач + TTL
    await redis.incr(key)
    await redis.expire(key, PIN_WINDOW_SECONDS)
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

  // Rate limit для пароля: 5 попыток / 15 мин
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown'
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

    // Получаем spaceId из Redis
    const redis = getRedis()
    let spaceId: string | null = null
    try {
      await redis.connect()
      spaceId = await redis.get(`tablet:pair:${code}`)
      if (spaceId) {
        await redis.del(`tablet:pair:${code}`)  // one-time use
      }
    } finally {
      redis.disconnect()
    }

    if (!spaceId) {
      return c.json({ error: 'Неверный или истёкший код' }, 401)
    }

    // Создаём профиль планшета
    const nickname = deviceName ?? `Tablet ${code}`
    const [profile] = await db.insert(profiles).values({
      nickname,
      role: 'tablet',
      linkedSpaceId: spaceId,
    } as any).returning()

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
  },
)

authRouter.post('/login/telegram', zValidator('json', LoginTelegramSchema), async (c) => {
  const { initData } = c.req.valid('json')
  const botToken = process.env['ADMIN_BOT_TOKEN'] ?? process.env['WALLET_BOT_TOKEN'] ?? ''
  if (!verifyTelegramInitData(initData, botToken)) {
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
  await db.delete(passkeys).where(eq(passkeys.id, c.req.param('id')))
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
