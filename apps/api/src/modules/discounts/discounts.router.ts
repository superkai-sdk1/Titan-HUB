import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, discounts, eq, and, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const discountsRouter = new Hono<AppEnv>()

discountsRouter.use('*', requireAuth)

// GET /api/discounts — только персонал/владелец (видны привязки clientId).
discountsRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const clientId = c.req.query('clientId')
  const where = clientId ? eq(discounts.clientId, clientId) : undefined
  const rows = await db.select().from(discounts).where(where).orderBy(desc(discounts.createdAt))
  return c.json({ discounts: rows })
})

// POST /api/discounts
discountsRouter.post(
  '/',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({
    name: z.string().min(1),
    type: z.enum(['percent', 'fixed']),
    value: z.number().min(0),
    isActive: z.boolean().optional().default(true),
    isAuto: z.boolean().optional().default(false),
    minQuantity: z.number().int().min(1).optional().default(1),
    itemId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
  }).refine(
    // Процентная скидка не может превышать 100%.
    (d) => d.type !== 'percent' || d.value <= 100,
    { message: 'Процентная скидка не может превышать 100%', path: ['value'] },
  )),
  async (c) => {
    const body = c.req.valid('json')
    const [row] = await db.insert(discounts).values({
      name: body.name,
      type: body.type,
      value: String(body.value),
      isActive: body.isActive,
      isAuto: body.isAuto,
      minQuantity: body.minQuantity,
      itemId: body.itemId ?? undefined,
      clientId: body.clientId ?? undefined,
    }).returning()
    return c.json({ discount: row }, 201)
  }
)

// PATCH /api/discounts/:id
discountsRouter.patch(
  '/:id',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['percent', 'fixed']).optional(),
    value: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
    isAuto: z.boolean().optional(),
    minQuantity: z.number().int().min(1).optional(),
    itemId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
  }).refine(
    // Если в одном запросе указаны и type='percent', и value — value ≤ 100.
    (d) => d.type !== 'percent' || d.value === undefined || d.value <= 100,
    { message: 'Процентная скидка не может превышать 100%', path: ['value'] },
  )),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')

    // Частичное обновление: если меняется только value (без type), сверяемся
    // с уже сохранённым типом скидки, чтобы процент не превысил 100%.
    if (body.value !== undefined) {
      let effectiveType = body.type
      if (effectiveType === undefined) {
        const [cur] = await db.select({ type: discounts.type }).from(discounts).where(eq(discounts.id, id))
        effectiveType = cur?.type as 'percent' | 'fixed' | undefined
      }
      if (effectiveType === 'percent' && body.value > 100) {
        return c.json({ error: 'Процентная скидка не может превышать 100%' }, 400)
      }
    }

    const update: Record<string, unknown> = {}
    if (body.name !== undefined) update.name = body.name
    if (body.type !== undefined) update.type = body.type
    if (body.value !== undefined) update.value = String(body.value)
    if (body.isActive !== undefined) update.isActive = body.isActive
    if (body.isAuto !== undefined) update.isAuto = body.isAuto
    if (body.minQuantity !== undefined) update.minQuantity = body.minQuantity
    if (body.itemId !== undefined) update.itemId = body.itemId
    if (body.clientId !== undefined) update.clientId = body.clientId

    const [row] = await db.update(discounts).set(update).where(eq(discounts.id, id)).returning()
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ discount: row })
  }
)

// DELETE /api/discounts/:id
discountsRouter.delete('/:id', requireRole('owner', 'staff'), async (c) => {
  const id = c.req.param('id')
  await db.delete(discounts).where(eq(discounts.id, id))
  return c.json({ ok: true })
})
