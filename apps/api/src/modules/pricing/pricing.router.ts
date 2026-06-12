import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  tariffs, eveningTypes, eventHourlyRates, inventory, menuCategories,
  eq, asc, sql, like,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const pricingRouter = new Hono<AppEnv>()
pricingRouter.use('*', requireAuth)

// ─── Тарифы ─────────────────────────────────────────────────────────────────
// Тариф — самостоятельная сущность (раздел «Тарифы и аренда»). Под каждым тарифом
// лежит скрытая backing-позиция меню в категории «Тарифы» (trackStock=false,
// isService=true): именно через неё тариф ложится в чек как обычная позиция
// (денежный путь POS не меняется). tariffs владеет идентичностью/ценой/порядком,
// а аналитика маппит тариф на проданное по item_id backing-позиции.

const CreateTariffSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.number().min(0).default(0),
  color: z.string().min(1).max(40).optional(),
})

const UpdateTariffSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  price: z.number().min(0).optional(),
  color: z.string().min(1).max(40).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

pricingRouter.get('/tariffs', async (c) => {
  const db = c.var.db
  const rows = await db.select().from(tariffs).orderBy(asc(tariffs.sortOrder), asc(tariffs.name))
  return c.json({ tariffs: rows })
})

pricingRouter.post('/tariffs', requireRole('owner'), zValidator('json', CreateTariffSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const color = body.color?.trim() || '#8B5CF6'

  const tariff = await db.transaction(async (tx) => {
    // Категория «Тарифы»: ищем по имени (lower(name) LIKE '%тариф%'), создаём при
    // отсутствии. Backing-позиции тарифов все живут в ней.
    let [cat] = await tx
      .select()
      .from(menuCategories)
      .where(like(sql`lower(${menuCategories.name})`, '%тариф%'))
      .orderBy(asc(menuCategories.sortOrder))
      .limit(1)
    if (!cat) {
      const [maxCat] = await tx
        .select({ m: sql<number>`coalesce(max(${menuCategories.sortOrder}), 0)::int` })
        .from(menuCategories)
      ;[cat] = await tx
        .insert(menuCategories)
        .values({ name: 'Тарифы', sortOrder: (maxCat?.m ?? 0) + 1 })
        .returning()
    }

    // Backing-позиция: услуга без учёта на складе, скрыта с планшета по умолчанию.
    const [item] = await tx
      .insert(inventory)
      .values({
        name: body.name.trim(),
        category: cat.id,
        price: String(body.price),
        trackStock: false,
        isService: true,
        isActive: true,
      })
      .returning()

    const [maxRow] = await tx
      .select({ m: sql<number>`coalesce(max(${tariffs.sortOrder}), 0)::int` })
      .from(tariffs)

    const [row] = await tx
      .insert(tariffs)
      .values({
        name: body.name.trim(),
        price: String(body.price),
        color,
        sortOrder: (maxRow?.m ?? 0) + 1,
        itemId: item.id,
      })
      .returning()
    return row
  })

  return c.json({ tariff }, 201)
})

pricingRouter.patch('/tariffs/:id', requireRole('owner'), zValidator('json', UpdateTariffSchema), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const tariff = await db.transaction(async (tx) => {
    const update: Record<string, any> = { updatedAt: new Date() }
    if (body.name !== undefined) update.name = body.name.trim()
    if (body.price !== undefined) update.price = String(body.price)
    if (body.color !== undefined) update.color = body.color.trim()
    if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder
    if (body.isActive !== undefined) update.isActive = body.isActive

    const [row] = await tx.update(tariffs).set(update).where(eq(tariffs.id, id)).returning()
    if (!row) return null

    // Синхронизируем backing-позицию, чтобы строка в кассе совпадала с тарифом.
    const itemUpdate: Record<string, any> = {}
    if (body.name !== undefined) itemUpdate.name = body.name.trim()
    if (body.price !== undefined) itemUpdate.price = String(body.price)
    if (body.isActive !== undefined) itemUpdate.isActive = body.isActive
    if (row.itemId && Object.keys(itemUpdate).length > 0) {
      itemUpdate.updatedAt = new Date()
      await tx.update(inventory).set(itemUpdate).where(eq(inventory.id, row.itemId))
    }
    return row
  })

  if (!tariff) return c.json({ error: 'Not found' }, 404)
  return c.json({ tariff })
})

pricingRouter.delete('/tariffs/:id', requireRole('owner'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  // Мягкое удаление: тариф и его backing-позиция остаются ради исторических чеков,
  // лишь помечаются неактивными (исчезают из меню/кассы и списка тарифов).
  const ok = await db.transaction(async (tx) => {
    const [row] = await tx.update(tariffs).set({ isActive: false, updatedAt: new Date() }).where(eq(tariffs.id, id)).returning()
    if (!row) return false
    if (row.itemId) {
      await tx.update(inventory).set({ isActive: false, updatedAt: new Date() }).where(eq(inventory.id, row.itemId))
    }
    return true
  })
  if (!ok) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// ─── Типы вечеров ───────────────────────────────────────────────────────────
// Управляемый справочник (без цены), как статусы клиентов. shifts.evening_type
// хранит key; исторические смены держат строковое значение и при удалении типа
// не ломаются.

// Транслит ключа из метки (латиница-слаг), как в clients.router (статусы клиентов).
const RU_SLUG: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
function slugifyKey(label: string): string {
  const base = label.toLowerCase().split('').map(ch => RU_SLUG[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return base || `evening_${Date.now().toString(36)}`
}

pricingRouter.get('/evening-types', async (c) => {
  const db = c.var.db
  const rows = await db.select().from(eveningTypes).orderBy(asc(eveningTypes.sortOrder), asc(eveningTypes.key))
  return c.json({ eveningTypes: rows })
})

const CreateEveningTypeSchema = z.object({
  label: z.string().min(1).max(60),
  color: z.string().min(1).max(40).optional(),
})
pricingRouter.post('/evening-types', requireRole('owner'), zValidator('json', CreateEveningTypeSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  let key = slugifyKey(body.label)
  // Уникальность ключа: если занят — добавляем числовой суффикс.
  const existing = await db.select({ key: eveningTypes.key }).from(eveningTypes)
  const taken = new Set(existing.map(t => t.key))
  if (taken.has(key)) { let i = 2; while (taken.has(`${key}_${i}`)) i++; key = `${key}_${i}` }
  const [maxRow] = await db.select({ m: sql<number>`coalesce(max(${eveningTypes.sortOrder}), 0)::int` }).from(eveningTypes)
  const [row] = await db.insert(eveningTypes).values({
    key, label: body.label.trim(), color: body.color?.trim() || '#8B5CF6',
    sortOrder: (maxRow?.m ?? 0) + 1, isSystem: false,
  }).returning()
  return c.json({ eveningType: row }, 201)
})

const UpdateEveningTypeSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  color: z.string().min(1).max(40).optional(),
  sortOrder: z.number().int().optional(),
})
pricingRouter.patch('/evening-types/:key', requireRole('owner'), zValidator('json', UpdateEveningTypeSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const update: Record<string, any> = {}
  if (body.label !== undefined) update.label = body.label.trim()
  if (body.color !== undefined) update.color = body.color.trim()
  if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder
  if (Object.keys(update).length === 0) {
    const [row] = await db.select().from(eveningTypes).where(eq(eveningTypes.key, c.req.param('key')))
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ eveningType: row })
  }
  const [row] = await db.update(eveningTypes).set(update).where(eq(eveningTypes.key, c.req.param('key'))).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ eveningType: row })
})

pricingRouter.delete('/evening-types/:key', requireRole('owner'), async (c) => {
  const db = c.var.db
  const key = c.req.param('key')
  const [row] = await db.select().from(eveningTypes).where(eq(eveningTypes.key, key))
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.isSystem) return c.json({ error: 'Системный тип вечера нельзя удалить' }, 400)
  // Исторические смены сохраняют строковое значение key — это допустимо.
  await db.delete(eveningTypes).where(eq(eveningTypes.key, key))
  return c.json({ ok: true })
})

// ─── Почасовые тарифы мероприятий ────────────────────────────────────────────
// Цена за весь период по числу часов (1ч=5000 … 6ч=18000). Используется при
// billingMode=hourly: основа чека = цена тарифа по plannedHours события.
pricingRouter.get('/event-rates', async (c) => {
  const db = c.var.db
  const rows = await db.select().from(eventHourlyRates).orderBy(asc(eventHourlyRates.hours))
  return c.json({ rates: rows })
})

pricingRouter.patch('/event-rates/:hours', requireRole('owner'), zValidator('json', z.object({ price: z.number().min(0) })), async (c) => {
  const hours = parseInt(c.req.param('hours'), 10)
  if (!Number.isInteger(hours) || hours < 1) return c.json({ error: 'Bad hours' }, 400)
  const { price } = c.req.valid('json')
  const db = c.var.db
  const [row] = await db
    .insert(eventHourlyRates)
    .values({ hours, price: String(price) })
    .onConflictDoUpdate({ target: eventHourlyRates.hours, set: { price: String(price) } })
    .returning()
  return c.json({ rate: row })
})
