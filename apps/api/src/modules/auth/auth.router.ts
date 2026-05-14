import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, profiles, eq, isNull } from '@titan/database'
import { signToken, verifyPin, verifyPassword, hashPassword, hashPin, isPlaintext, verifyTelegramInitData } from '@titan/auth'
import { LoginPinSchema, LoginPasswordSchema, LoginTelegramSchema, SetPinSchema } from '@titan/types'
import { requireAuth } from '../../middleware/auth.js'

export const authRouter = new Hono()

authRouter.post('/login/pin', zValidator('json', LoginPinSchema), async (c) => {
  const { pin, userId } = c.req.valid('json')
  // Find by userId or scan all staff
  const where = userId
    ? eq(profiles.id, userId)
    : isNull(profiles.deletedAt)
  const all = await db.select().from(profiles).where(where)
  for (const profile of all) {
    if (!profile.pin) continue
    const ok = await verifyPin(pin, profile.pin)
    if (ok) {
      const token = await signToken({ sub: profile.id, role: profile.role, nickname: profile.nickname })
      return c.json({ token, user: { id: profile.id, nickname: profile.nickname, role: profile.role, photoUrl: profile.photoUrl } })
    }
  }
  return c.json({ error: 'Invalid PIN' }, 401)
})

authRouter.post('/login/password', zValidator('json', LoginPasswordSchema), async (c) => {
  const { nickname, password } = c.req.valid('json')
  const [profile] = await db.select().from(profiles).where(eq(profiles.nickname, nickname))
  if (!profile?.passwordHash) return c.json({ error: 'User not found' }, 404)

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
  if (!ok) return c.json({ error: 'Invalid password' }, 401)

  const needsPinSetup = !profile.pin
  const token = await signToken({ sub: profile.id, role: profile.role, nickname: profile.nickname })
  return c.json({ token, needsPinSetup, user: { id: profile.id, nickname: profile.nickname, role: profile.role, photoUrl: profile.photoUrl } })
})

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
