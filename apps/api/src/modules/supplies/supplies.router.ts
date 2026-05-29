import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, supplies, supplyItems, inventory, stockMovements, eq, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const SupplySchema = z.object({
  note: z.string().optional(),
  supplier: z.string().optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer']).default('cash'),
  items: z.array(z.object({
    // Привязка к карточке товара опциональна: сырьё без карточки можно
    // зафиксировать как затрату (без изменения остатка).
    itemId: z.string().uuid().optional(),
    name: z.string().optional(),
    unit: z.string().default('шт'),
    quantity: z.number().positive(),
    costPerUnit: z.number().min(0),
  }).refine(i => !!i.itemId || !!(i.name && i.name.trim()), {
    message: 'Нужно указать товар или название позиции',
  })).min(1),
})

export const suppliesRouter = new Hono<AppEnv>()
suppliesRouter.use('*', requireAuth)

suppliesRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const rows = await db.select().from(supplies).orderBy(desc(supplies.createdAt)).limit(50)
  const enriched = await Promise.all(rows.map(async (s) => {
    const items = await db.select().from(supplyItems).where(eq(supplyItems.supplyId, s.id))
    return {
      ...s,
      date: s.createdAt,
      items: items.map(it => ({
        itemId: it.itemId,
        name: it.name ?? '—',
        unit: it.unit,
        quantity: Number(it.quantity),
        costPerUnit: Number(it.costPerUnit),
      })),
    }
  }))
  return c.json({ supplies: enriched })
})

suppliesRouter.post('/', requireRole('owner', 'staff'), zValidator('json', SupplySchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const totalCost = round2(body.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0))

  const supply = await db.transaction(async (tx) => {
    const [sup] = await tx.insert(supplies).values({
      note: body.note,
      supplier: body.supplier,
      paymentMethod: body.paymentMethod,
      totalCost: String(totalCost),
      createdBy: user.sub,
    }).returning()

    await tx.insert(supplyItems).values(body.items.map(i => ({
      supplyId: sup.id,
      itemId: i.itemId ?? null,
      name: i.name ?? null,
      unit: i.unit,
      quantity: String(i.quantity),
      costPerUnit: String(i.costPerUnit),
    })))

    // Обновляем остаток только для позиций, привязанных к карточке товара.
    for (const i of body.items) {
      if (!i.itemId) continue
      const [inv] = await tx.select().from(inventory).where(eq(inventory.id, i.itemId)).for('update')
      if (!inv) continue
      const add = Math.round(i.quantity)
      if (add === 0) continue
      const newQty = (inv.stockQuantity ?? 0) + add
      await tx.update(inventory).set({ stockQuantity: newQty, updatedAt: new Date() }).where(eq(inventory.id, i.itemId))
      await tx.insert(stockMovements).values({
        itemId: i.itemId,
        delta: add,
        newQuantity: newQty,
        reason: `Приёмка${body.supplier ? ' · ' + body.supplier : ''}`,
        createdBy: user.sub,
      })
    }

    return sup
  })

  return c.json({ supply }, 201)
})

// GET /supplies/items/:itemId/last-price — последняя цена закупки позиции.
// Должен идти ДО /:id, иначе перехватится как id.
suppliesRouter.get('/items/:itemId/last-price', requireRole('owner', 'staff'), async (c) => {
  const [row] = await db
    .select({ costPerUnit: supplyItems.costPerUnit })
    .from(supplyItems)
    .innerJoin(supplies, eq(supplies.id, supplyItems.supplyId))
    .where(eq(supplyItems.itemId, c.req.param('itemId')))
    .orderBy(desc(supplies.createdAt))
    .limit(1)
  return c.json({ lastPrice: row ? parseFloat(String(row.costPerUnit)) : null })
})

suppliesRouter.get('/:id', async (c) => {
  const [supply] = await db.select().from(supplies).where(eq(supplies.id, c.req.param('id')))
  if (!supply) return c.json({ error: 'Not found' }, 404)
  const rows = await db
    .select({ supplyItem: supplyItems, item: inventory })
    .from(supplyItems)
    .leftJoin(inventory, eq(inventory.id, supplyItems.itemId))
    .where(eq(supplyItems.supplyId, supply.id))
  const items = rows.map(r => ({
    itemId: r.supplyItem.itemId,
    name: r.supplyItem.name ?? r.item?.name ?? '—',
    unit: r.supplyItem.unit,
    quantity: Number(r.supplyItem.quantity),
    costPerUnit: Number(r.supplyItem.costPerUnit),
  }))
  return c.json({ supply: { ...supply, date: supply.createdAt }, items })
})
