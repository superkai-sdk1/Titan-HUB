import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, spaces, eq } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const SpaceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['small_booth', 'large_booth', 'hall']),
  hourlyRate: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const spacesRouter = new Hono<AppEnv>()
spacesRouter.use('*', requireAuth)

spacesRouter.get('/', async (c) => {
  const rows = await db.select().from(spaces).where(eq(spaces.isActive, true))
  return c.json({ spaces: rows })
})

spacesRouter.get('/all', requireRole('owner', 'staff'), async (c) => {
  const rows = await db.select().from(spaces)
  return c.json({ spaces: rows })
})

spacesRouter.post('/', requireRole('owner'), zValidator('json', SpaceSchema), async (c) => {
  const body = c.req.valid('json')
  const [space] = await db.insert(spaces).values({ ...body, hourlyRate: String(body.hourlyRate) }).returning()
  return c.json({ space }, 201)
})

spacesRouter.get('/:id', async (c) => {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, c.req.param('id')))
  if (!space) return c.json({ error: 'Not found' }, 404)
  return c.json({ space })
})

spacesRouter.patch('/:id', requireRole('owner'), zValidator('json', SpaceSchema.partial()), async (c) => {
  const body = c.req.valid('json')
  const update: Record<string, any> = { ...body }
  if (body.hourlyRate !== undefined) update.hourlyRate = String(body.hourlyRate)
  const [space] = await db.update(spaces).set(update).where(eq(spaces.id, c.req.param('id'))).returning()
  if (!space) return c.json({ error: 'Not found' }, 404)
  return c.json({ space })
})

spacesRouter.delete('/:id', requireRole('owner'), async (c) => {
  await db.update(spaces).set({ isActive: false }).where(eq(spaces.id, c.req.param('id')))
  return c.json({ ok: true })
})
