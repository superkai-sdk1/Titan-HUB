import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, supplies, supplyItems, supplyCorrections, inventory, eq, and, asc, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { round2 } from '../../lib/money.js'
import { recordMovement } from '../inventory/ledger.js'
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
    // У черновика нет supply_items — состав в draft_data.
    if (s.status === 'draft') {
      const di = s.draftData?.items ?? []
      return {
        ...s, date: s.createdAt,
        items: di.map(it => ({ itemId: it.itemId ?? null, name: it.name ?? '—', unit: it.unit ?? 'шт', quantity: Number(it.quantity) || 0, costPerUnit: Number(it.costPerUnit) || 0 })),
      }
    }
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
    // Уникальный индекс на idempotency_key — полный (см. 034_supplies_idem_full_index.sql),
    // как у expenses/salary/cash_operations, поэтому ON CONFLICT по колонке его находит.
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
    // recordMovement сам пересчитывает WAC по средневзвешенной на приходе.
    for (const i of body.items) {
      if (!i.itemId || i.quantity === 0) continue
      await recordMovement(tx, {
        itemId: i.itemId, type: 'receipt', delta: i.quantity, unitCost: i.costPerUnit,
        sourceType: 'supply', sourceId: sup.id,
        reason: `Приёмка${body.supplier ? ' · ' + body.supplier : ''}`, userId: user.sub,
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

  // Понятный текст: поставщик (если указан) · сколько позиций · сумма.
  const supItemNames = body.items.map(i => i.name).filter(Boolean).slice(0, 3).join(', ')
  const supBody = [
    body.supplier ? `Поставщик: ${body.supplier}` : null,
    `${body.items.length} поз. · ${totalCost.toLocaleString('ru')} ₽`,
    supItemNames || null,
  ].filter(Boolean).join('\n')
  void notify({
    type: 'supply_received',
    title: 'Приход на склад',
    body: supBody,
    meta: { supplyId: supply.id },
  }).catch(() => {})

  return c.json({ supply }, 201)
})

// Записать позиции приёмки + движения receipt (WAC). Общая логика проведения
// свежей закупки и применения черновика.
async function postSupplyLines(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  supplyId: string,
  items: { itemId?: string | null; name?: string; unit: string; quantity: number; costPerUnit: number }[],
  supplier: string | undefined,
  userId: string,
) {
  await tx.insert(supplyItems).values(items.map(i => ({
    supplyId, itemId: i.itemId ?? null, name: i.name ?? null, unit: i.unit,
    quantity: String(i.quantity), costPerUnit: String(i.costPerUnit),
  })))
  for (const i of items) {
    if (!i.itemId || i.quantity === 0) continue
    await recordMovement(tx, {
      itemId: i.itemId, type: 'receipt', delta: i.quantity, unitCost: i.costPerUnit,
      sourceType: 'supply', sourceId: supplyId,
      reason: `Приёмка${supplier ? ' · ' + supplier : ''}`, userId,
    })
  }
}

// POST /supplies/draft — сохранить/обновить ЧЕРНОВИК приёмки (без движений/остатков).
// Состав кладётся в draft_data; supply_items не создаются до применения.
suppliesRouter.post('/draft', requireRole('owner', 'staff'), zValidator('json', z.object({
  id: z.string().uuid().optional(),
  note: z.string().optional(),
  supplier: z.string().optional(),
  items: z.array(z.object({
    itemId: z.string().uuid().optional(),
    name: z.string().optional(),
    unit: z.string().default('шт'),
    quantity: z.number().min(0),
    costPerUnit: z.number().min(0),
  })).max(200),
})), async (c) => {
  const user = c.get('user')
  const { id, note, supplier, items } = c.req.valid('json')
  const draftData = { note, supplier, items }
  if (id) {
    const [row] = await db.update(supplies)
      .set({ draftData, note: note ?? null, supplier: supplier ?? null })
      .where(and(eq(supplies.id, id), eq(supplies.status, 'draft')))
      .returning({ id: supplies.id })
    if (!row) return c.json({ error: 'Черновик не найден' }, 404)
    return c.json({ id: row.id })
  }
  const [row] = await db.insert(supplies)
    .values({ status: 'draft', draftData, note: note ?? null, supplier: supplier ?? null, totalCost: '0', createdBy: user.sub })
    .returning({ id: supplies.id })
  return c.json({ id: row.id }, 201)
})

// POST /supplies/:id/apply — провести ЧЕРНОВИК (draft → posted): пишет позиции и
// движения receipt (WAC). FOR UPDATE + проверка статуса сериализуют повторное применение.
const ApplySupplySchema = z.object({
  note: z.string().optional(),
  supplier: z.string().optional(),
  items: z.array(z.object({
    itemId: z.string().uuid().optional(),
    name: z.string().optional(),
    unit: z.string().default('шт'),
    quantity: z.number().positive(),
    costPerUnit: z.number().min(0),
  }).refine(i => !!i.itemId || !!(i.name && i.name.trim()), { message: 'Нужно указать товар или название позиции' })
    .refine(i => !i.itemId || Number.isInteger(i.quantity), { message: 'Для товара с карточкой количество должно быть целым', path: ['quantity'] })
  ).min(1),
})

suppliesRouter.post('/:id/apply', requireRole('owner', 'staff'), zValidator('json', ApplySupplySchema), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const totalCost = round2(body.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0))
  const res = await db.transaction(async (tx) => {
    const [sup] = await tx.select().from(supplies).where(eq(supplies.id, id)).for('update')
    if (!sup) return 'not_found' as const
    if (sup.status !== 'draft') return 'not_draft' as const
    await postSupplyLines(tx, id, body.items, body.supplier, user.sub)
    await tx.update(supplies).set({ status: 'posted', draftData: null, totalCost: String(totalCost), note: body.note ?? sup.note, supplier: body.supplier ?? sup.supplier }).where(eq(supplies.id, id))
    return 'ok' as const
  })
  if (res === 'not_found') return c.json({ error: 'Not found' }, 404)
  if (res === 'not_draft') return c.json({ error: 'Приёмка уже проведена' }, 409)
  void notify({ type: 'supply_received', title: 'Приход на склад', body: `${body.items.length} поз. · ${totalCost.toLocaleString('ru')} ₽`, meta: { supplyId: id } }).catch(() => {})
  return c.json({ supply: { id }, posted: true })
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
  const corrections = await db
    .select()
    .from(supplyCorrections)
    .where(eq(supplyCorrections.supplyId, supply.id))
    .orderBy(asc(supplyCorrections.createdAt))
  const correctionsOut = corrections.map(cr => ({
    id: cr.id,
    reason: cr.reason,
    totalBefore: Number(cr.totalBefore),
    totalAfter: Number(cr.totalAfter),
    createdAt: cr.createdAt,
  }))
  return c.json({ supply: { ...supply, date: supply.createdAt }, items, corrections: correctionsOut })
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
  // Корректировка проведённой закупки требует обязательной причины (аудит).
  reason: z.string().trim().min(3, 'Укажите причину корректировки'),
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

    // Сверяем остаток по каждой затронутой карточке (старые ∪ новые). WAC при
    // правке НЕ трогаем (type=adjustment), как и раньше — пересчёт задним числом
    // повредил бы среднюю при последующих закупках.
    const allIds = new Set<string>([...oldByItem.keys(), ...newByItem.keys()])
    for (const itemId of allIds) {
      const delta = (newByItem.get(itemId) ?? 0) - (oldByItem.get(itemId) ?? 0)
      if (delta === 0) continue
      await recordMovement(tx, {
        itemId, type: 'adjustment', delta, clamp: true,
        sourceType: 'supply', sourceId: id, reason: 'Корректировка закупки', userId: user.sub,
      })
    }

    await tx.update(supplies).set({ totalCost: String(totalCost), note: body.note ?? supply.note }).where(eq(supplies.id, id))

    // Фиксируем корректировку с причиной и суммами до/после (аудит закупки).
    await tx.insert(supplyCorrections).values({
      supplyId: id,
      reason: body.reason,
      totalBefore: String(supply.totalCost ?? '0'),
      totalAfter: String(totalCost),
      createdBy: user.sub,
    })

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
suppliesRouter.delete('/:id', requireRole('owner', 'staff'), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const res = await db.transaction(async (tx) => {
    // FOR UPDATE на строке приёмки сериализует конкурентные удаления.
    const [supply] = await tx.select().from(supplies).where(eq(supplies.id, id)).for('update')
    if (!supply) return 'not_found' as const

    // Черновик — без движений/остатков, удалять может staff/owner.
    if (supply.status === 'draft') {
      await tx.delete(supplies).where(eq(supplies.id, id))
      return 'ok' as const
    }

    // Проведённая приёмка — только владелец, с откатом стока.
    if ((user as any).role !== 'owner') return 'forbidden' as const
    const lines = await tx.select().from(supplyItems).where(eq(supplyItems.supplyId, id))
    for (const line of lines) {
      if (!line.itemId) continue
      const qty = Math.round(Number(line.quantity))
      if (qty <= 0) continue
      // Компенсирующее движение (WAC не разворачиваем — известное ограничение).
      await recordMovement(tx, {
        itemId: line.itemId, type: 'adjustment', delta: -qty, clamp: true,
        sourceType: 'supply', sourceId: id, reason: `Откат закупки ${id}`, userId: user.sub,
      })
    }
    await tx.delete(supplies).where(eq(supplies.id, id))
    return 'ok' as const
  })

  if (res === 'not_found') return c.json({ error: 'Not found' }, 404)
  if (res === 'forbidden') return c.json({ error: 'Удалять проведённую закупку может только владелец' }, 403)
  return c.json({ ok: true })
})
