import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, supplies, supplyItems, inventory, stockMovements, eq, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { round2 } from '../../lib/money.js'
import { notify } from '../notifications/push.js'

const SupplySchema = z.object({
  note: z.string().optional(),
  supplier: z.string().optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer']).default('cash'),
  // Ключ идемпотентности обязателен: без него ретрай POST (двойной клик/сетевой
  // повтор) задвоит приёмку — остаток и COGS уедут. Фронт всегда его шлёт.
  idempotencyKey: z.string().min(1).max(80),
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
  }).refine(i => !i.itemId || Number.isInteger(i.quantity), {
    // Остаток в inventory — целое. Дробное количество для позиции с карточкой
    // рассинхронизирует остаток с себестоимостью (0.4 → 0 шт, но полная стоимость).
    message: 'Для товара с карточкой количество должно быть целым',
    path: ['quantity'],
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
      idempotencyKey: body.idempotencyKey,
    }).onConflictDoNothing({ target: supplies.idempotencyKey }).returning()

    // Двойной клик/ретрай с тем же ключом — приёмка уже создана. Прерываем
    // транзакцию без побочных эффектов (без задвоения остатка/COGS).
    if (!sup) return null

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
      // Количество для карточек уже валидировано как целое — добавляем точно,
      // без округления (округление рассинхронизировало бы остаток и стоимость).
      const add = i.quantity
      if (add === 0) continue
      const oldQty = inv.stockQuantity ?? 0
      const newQty = oldQty + add
      // Себестоимость по средневзвешенной: (старый_остаток×старая_цена +
      // приход×цена_прихода) / новый_остаток. Считаем внутри блокировки строки.
      const oldCost = parseFloat(String(inv.costPrice ?? 0))
      const newUnitCost = i.costPerUnit
      const set: Record<string, any> = { stockQuantity: newQty, updatedAt: new Date() }
      if (newQty > 0) {
        set.costPrice = String(round2((oldQty * oldCost + add * newUnitCost) / newQty))
      }
      await tx.update(inventory).set(set).where(eq(inventory.id, i.itemId))
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

  // Повторный POST с тем же ключом — отдаём существующую приёмку (как expenses).
  if (!supply) {
    if (body.idempotencyKey) {
      const [existing] = await db.select().from(supplies).where(eq(supplies.idempotencyKey, body.idempotencyKey))
      if (existing) return c.json({ supply: existing, duplicate: true })
    }
    return c.json({ error: 'Не удалось сохранить приёмку' }, 500)
  }

  void notify({
    type: 'supply_received',
    title: 'Приход на склад',
    body: `${totalCost} ₽`,
    meta: { supplyId: supply.id },
  }).catch(() => {})

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

// PATCH /supplies/:id — корректировка проведённой закупки (owner/staff). Остаток
// пересчитываем по NET-дельте на карточку: delta = новое_кол-во − старое_кол-во,
// применяем к stockQuantity (не ниже 0) и пишем аудит-движение «Корректировка
// закупки». Операция ИДЕМПОТЕНТНА: повторный PATCH с тем же телом даёт дельту 0
// (склад уже синхронизирован), поэтому ключ идемпотентности не нужен.
// costPrice (средневзвешенную) при правке НЕ трогаем — пересчёт задним числом
// повредил бы её при последующих закупках; то же ограничение, что и у удаления.
const SupplyEditSchema = z.object({
  note: z.string().optional(),
  items: z.array(z.object({
    itemId: z.string().uuid().optional(),
    name: z.string().optional(),
    unit: z.string().default('шт'),
    quantity: z.number().positive(),
    costPerUnit: z.number().min(0),
  }).refine(i => !!i.itemId || !!(i.name && i.name.trim()), {
    message: 'Нужно указать товар или название позиции',
  }).refine(i => !i.itemId || Number.isInteger(i.quantity), {
    message: 'Для товара с карточкой количество должно быть целым',
    path: ['quantity'],
  })).min(1),
})

suppliesRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', SupplyEditSchema), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const totalCost = round2(body.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0))

  const result = await db.transaction(async (tx) => {
    const [supply] = await tx.select().from(supplies).where(eq(supplies.id, id)).for('update')
    if (!supply) return null

    // Старые количества по карточкам (целые) — для расчёта дельты.
    const oldLines = await tx.select().from(supplyItems).where(eq(supplyItems.supplyId, id))
    const oldByItem = new Map<string, number>()
    for (const l of oldLines) {
      if (!l.itemId) continue
      oldByItem.set(l.itemId, (oldByItem.get(l.itemId) ?? 0) + Math.round(Number(l.quantity)))
    }

    // Перезаписываем состав закупки.
    await tx.delete(supplyItems).where(eq(supplyItems.supplyId, id))
    await tx.insert(supplyItems).values(body.items.map(i => ({
      supplyId: id,
      itemId: i.itemId ?? null,
      name: i.name ?? null,
      unit: i.unit,
      quantity: String(i.quantity),
      costPerUnit: String(i.costPerUnit),
    })))

    const newByItem = new Map<string, number>()
    for (const i of body.items) {
      if (!i.itemId) continue
      newByItem.set(i.itemId, (newByItem.get(i.itemId) ?? 0) + i.quantity)
    }

    // Сверяем остаток по каждой затронутой карточке (старые ∪ новые).
    const allIds = new Set<string>([...oldByItem.keys(), ...newByItem.keys()])
    for (const itemId of allIds) {
      const delta = (newByItem.get(itemId) ?? 0) - (oldByItem.get(itemId) ?? 0)
      if (delta === 0) continue
      const [inv] = await tx.select().from(inventory).where(eq(inventory.id, itemId)).for('update')
      if (!inv) continue
      const oldQty = inv.stockQuantity ?? 0
      const newQty = Math.max(0, oldQty + delta)
      const actualDelta = newQty - oldQty
      if (actualDelta === 0) continue
      await tx.update(inventory).set({ stockQuantity: newQty, updatedAt: new Date() }).where(eq(inventory.id, itemId))
      await tx.insert(stockMovements).values({
        itemId,
        delta: actualDelta,
        newQuantity: newQty,
        reason: 'Корректировка закупки',
        createdBy: user.sub,
      })
    }

    await tx.update(supplies).set({ totalCost: String(totalCost), note: body.note ?? supply.note }).where(eq(supplies.id, id))
    return { ...supply, totalCost: String(totalCost) }
  })

  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json({ supply: result })
})

// DELETE /supplies/:id — откат приёмки (только владелец). В транзакции:
// для каждой позиции с карточкой снимаем принятое количество с остатка
// (не уходя ниже 0) и пишем компенсирующее движение, затем удаляем приёмку
// (supply_items уходят каскадом). Известное ограничение: средневзвешенную
// себестоимость НЕ «разворачиваем» — costPrice остаётся как есть.
suppliesRouter.delete('/:id', requireRole('owner'), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const ok = await db.transaction(async (tx) => {
    // FOR UPDATE на строке приёмки сериализует конкурентные удаления: второй
    // вызов ждёт коммита первого, затем строки уже нет → выходим (без двойного
    // отката стока при double-click/ретрае).
    const [supply] = await tx.select().from(supplies).where(eq(supplies.id, id)).for('update')
    if (!supply) return false

    const lines = await tx.select().from(supplyItems).where(eq(supplyItems.supplyId, id))
    for (const line of lines) {
      if (!line.itemId) continue
      const [inv] = await tx.select().from(inventory).where(eq(inventory.id, line.itemId)).for('update')
      if (!inv) continue
      const qty = Math.round(Number(line.quantity))
      if (qty <= 0) continue
      const newQty = Math.max(0, (inv.stockQuantity ?? 0) - qty)
      const delta = newQty - (inv.stockQuantity ?? 0)
      await tx.update(inventory).set({ stockQuantity: newQty, updatedAt: new Date() }).where(eq(inventory.id, line.itemId))
      await tx.insert(stockMovements).values({
        itemId: line.itemId,
        delta,
        newQuantity: newQty,
        reason: `Откат закупки ${id}`,
        createdBy: user.sub,
      })
    }

    await tx.delete(supplies).where(eq(supplies.id, id))
    return true
  })

  if (!ok) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
