import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, menuCategories, inventory, modifiers, eq, and, asc, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const CategorySchema = z.object({
  name: z.string().min(1),
  icon: z.string().default('Package'),
  color: z.string().default('#6366f1'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

const ItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().uuid().optional(),
  price: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  stockQuantity: z.number().int().default(0),
  minThreshold: z.number().int().default(0),
  trackStock: z.boolean().default(false),
  isService: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isTop: z.boolean().default(false),
  isTabletVisible: z.boolean().default(false),
  imageUrl: z.string().optional(),
  sortOrder: z.number().int().default(0),
  searchTags: z.array(z.string()).default([]),
  linkedSpaceId: z.string().uuid().optional(),
})

const ModifierSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0).default(0),
})

export const menuRouter = new Hono<AppEnv>()

// Categories — no auth required for tablet reads
menuRouter.get('/categories', async (c) => {
  const cats = await db.select().from(menuCategories).where(eq(menuCategories.isActive, true)).orderBy(asc(menuCategories.sortOrder))
  return c.json({ categories: cats })
})

menuRouter.post('/categories', requireAuth, requireRole('owner', 'staff'), zValidator('json', CategorySchema), async (c) => {
  const body = c.req.valid('json')
  const [cat] = await db.insert(menuCategories).values(body).returning()
  return c.json({ category: cat }, 201)
})

menuRouter.patch('/categories/:id', requireAuth, requireRole('owner', 'staff'), zValidator('json', CategorySchema.partial()), async (c) => {
  const body = c.req.valid('json')
  const [cat] = await db.update(menuCategories).set(body).where(eq(menuCategories.id, c.req.param('id'))).returning()
  if (!cat) return c.json({ error: 'Not found' }, 404)
  return c.json({ category: cat })
})

menuRouter.delete('/categories/:id', requireAuth, requireRole('owner'), async (c) => {
  await db.delete(menuCategories).where(eq(menuCategories.id, c.req.param('id')))
  return c.json({ ok: true })
})

// Items
menuRouter.get('/items', async (c) => {
  const categoryId = c.req.query('categoryId')
  const tabletVisible = c.req.query('tabletVisible') === 'true'
  const baseFilter = eq(inventory.isActive, true)
  const catFilter = categoryId ? and(baseFilter, eq(inventory.category, categoryId)) : baseFilter
  const where = tabletVisible ? and(catFilter, eq(inventory.isTabletVisible, true)) : catFilter
  const items = await db
    .select()
    .from(inventory)
    .where(where)
    .orderBy(asc(inventory.sortOrder), asc(inventory.name))
  return c.json({ items })
})

menuRouter.get('/items/all', requireAuth, async (c) => {
  const items = await db.select().from(inventory).orderBy(asc(inventory.sortOrder), asc(inventory.name))
  return c.json({ items })
})

menuRouter.get('/items/:id', async (c) => {
  const [item] = await db.select().from(inventory).where(eq(inventory.id, c.req.param('id')))
  if (!item) return c.json({ error: 'Not found' }, 404)
  const mods = await db.select().from(modifiers).where(eq(modifiers.productId, item.id))
  return c.json({ item, modifiers: mods })
})

menuRouter.post('/items', requireAuth, requireRole('owner', 'staff'), zValidator('json', ItemSchema), async (c) => {
  const body = c.req.valid('json')
  const [item] = await db.insert(inventory).values({
    ...body,
    price: String(body.price),
    costPrice: String(body.costPrice),
  }).returning()
  return c.json({ item }, 201)
})

menuRouter.patch('/items/:id', requireAuth, requireRole('owner', 'staff'), zValidator('json', ItemSchema.partial()), async (c) => {
  const body = c.req.valid('json')
  const updateData: Record<string, any> = { ...body, updatedAt: new Date() }
  if (body.price !== undefined) updateData.price = String(body.price)
  if (body.costPrice !== undefined) updateData.costPrice = String(body.costPrice)
  const [item] = await db.update(inventory).set(updateData).where(eq(inventory.id, c.req.param('id'))).returning()
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json({ item })
})

menuRouter.delete('/items/:id', requireAuth, requireRole('owner'), async (c) => {
  await db.update(inventory).set({ isActive: false }).where(eq(inventory.id, c.req.param('id')))
  return c.json({ ok: true })
})

// Reorder items
menuRouter.patch('/items/reorder', requireAuth, requireRole('owner', 'staff'), zValidator('json', z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
})), async (c) => {
  const { items } = c.req.valid('json')
  await Promise.all(items.map(({ id, sortOrder }) =>
    db.update(inventory).set({ sortOrder, updatedAt: new Date() }).where(eq(inventory.id, id))
  ))
  return c.json({ ok: true })
})

// Reorder categories
menuRouter.patch('/categories/reorder', requireAuth, requireRole('owner', 'staff'), zValidator('json', z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
})), async (c) => {
  const { items } = c.req.valid('json')
  await Promise.all(items.map(({ id, sortOrder }) =>
    db.update(menuCategories).set({ sortOrder }).where(eq(menuCategories.id, id))
  ))
  return c.json({ ok: true })
})

// Modifiers
menuRouter.get('/items/:id/modifiers', async (c) => {
  const mods = await db.select().from(modifiers).where(eq(modifiers.productId, c.req.param('id')))
  return c.json({ modifiers: mods })
})

menuRouter.post('/items/:id/modifiers', requireAuth, requireRole('owner', 'staff'), zValidator('json', ModifierSchema), async (c) => {
  const body = c.req.valid('json')
  const [mod] = await db.insert(modifiers).values({
    ...body,
    price: String(body.price),
    productId: c.req.param('id'),
  }).returning()
  return c.json({ modifier: mod }, 201)
})

menuRouter.delete('/items/:itemId/modifiers/:modId', requireAuth, requireRole('owner', 'staff'), async (c) => {
  await db.delete(modifiers).where(eq(modifiers.id, c.req.param('modId')))
  return c.json({ ok: true })
})
