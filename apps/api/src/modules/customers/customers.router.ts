import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, customers, eq, desc, or, ilike } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const CustomerSchema = z.object({
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
})

export const customersRouter = new Hono<AppEnv>()
customersRouter.use('*', requireAuth)

// Список / поиск заказчиков. ?q= — по имени или телефону (для автоподбора).
customersRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const q = c.req.query('q')?.trim()
  const where = q
    ? or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`))
    : undefined
  const rows = await db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(q ? 8 : 200)
  return c.json({ customers: rows })
})

customersRouter.post('/', requireRole('owner', 'staff'), zValidator('json', CustomerSchema), async (c) => {
  const body = c.req.valid('json')
  const [row] = await db.insert(customers).values({ name: body.name ?? null, phone: body.phone ?? null }).returning()
  return c.json({ customer: row }, 201)
})

customersRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', CustomerSchema), async (c) => {
  const body = c.req.valid('json')
  const update: Record<string, any> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.phone !== undefined) update.phone = body.phone
  const [row] = await db.update(customers).set(update).where(eq(customers.id, c.req.param('id'))).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ customer: row })
})

customersRouter.delete('/:id', requireRole('owner', 'staff'), async (c) => {
  await db.delete(customers).where(eq(customers.id, c.req.param('id')))
  return c.json({ ok: true })
})
