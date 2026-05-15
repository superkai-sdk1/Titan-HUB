import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, profiles, eq, and, isNull, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { hashPassword } from '@titan/auth'

const CreateStaffSchema = z.object({
  nickname: z.string().min(2),
  password: z.string().min(4),
  pin: z.string().length(6).optional(),
  phone: z.string().optional(),
  role: z.enum(['owner', 'staff']).default('staff'),
})

const UpdateStaffSchema = z.object({
  nickname: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.enum(['owner', 'staff']).optional(),
  password: z.string().min(4).optional(),
})

export const staffRouter = new Hono<AppEnv>()
staffRouter.use('*', requireAuth, requireRole('owner'))

staffRouter.get('/', async (c) => {
  const rows = await db
    .select({
      id: profiles.id,
      nickname: profiles.nickname,
      phone: profiles.phone,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(and(
      isNull(profiles.deletedAt),
    ))
    .orderBy(desc(profiles.createdAt))

  const staff = rows.filter(r => r.role === 'owner' || r.role === 'staff')
  return c.json({ staff })
})

staffRouter.get('/:id', async (c) => {
  const [profile] = await db
    .select({
      id: profiles.id,
      nickname: profiles.nickname,
      phone: profiles.phone,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, c.req.param('id')))

  if (!profile) return c.json({ error: 'Not found' }, 404)
  return c.json({ staff: profile })
})

staffRouter.post('/', zValidator('json', CreateStaffSchema), async (c) => {
  const data = c.req.valid('json')
  const hashedPassword = await hashPassword(data.password)

  const [created] = await db
    .insert(profiles)
    .values({
      nickname: data.nickname,
      passwordHash: hashedPassword,
      pin: data.pin,
      phone: data.phone,
      role: data.role,
    })
    .returning({
      id: profiles.id,
      nickname: profiles.nickname,
      phone: profiles.phone,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })

  return c.json({ staff: created }, 201)
})

staffRouter.patch('/:id', zValidator('json', UpdateStaffSchema), async (c) => {
  const { password, ...rest } = c.req.valid('json')
  const setData: Record<string, unknown> = { ...rest }
  if (password) {
    setData.passwordHash = await hashPassword(password)
  }
  const [updated] = await db
    .update(profiles)
    .set(setData)
    .where(eq(profiles.id, c.req.param('id')))
    .returning({
      id: profiles.id,
      nickname: profiles.nickname,
      phone: profiles.phone,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })

  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json({ staff: updated })
})

staffRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  if (user.sub === c.req.param('id')) {
    return c.json({ error: 'Cannot delete yourself' }, 400)
  }

  await db
    .update(profiles)
    .set({ deletedAt: new Date() })
    .where(eq(profiles.id, c.req.param('id')))

  return c.json({ ok: true })
})

staffRouter.post('/:id/reset-pin', zValidator('json', z.object({ pin: z.string().length(6) })), async (c) => {
  const { pin } = c.req.valid('json')
  await db
    .update(profiles)
    .set({ pin })
    .where(eq(profiles.id, c.req.param('id')))

  return c.json({ ok: true })
})
