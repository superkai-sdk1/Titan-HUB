import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { menuCategories, inventory, modifiers, spaces, appSettings, screenSlides, eq, and, asc, desc, isNull, inArray } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const CategorySchema = z.object({
  name: z.string().min(1),
  icon: z.string().default('restaurant_menu'),
  color: z.string().default('violet'),
  isActive: z.boolean().default(true),
  isTabletVisible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

const ItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().uuid().nullable().optional(),
  price: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  stockQuantity: z.number().int().min(0).default(0),
  minThreshold: z.number().int().default(0),
  trackStock: z.boolean().default(false),
  isService: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isTop: z.boolean().default(false),
  isTabletVisible: z.boolean().default(false),
  // Показывать на экране меню для ТВ (/menu, AbleSign).
  isScreenVisible: z.boolean().default(true),
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
  const db = c.var.db
  const tabletOnly = c.req.query('tabletOnly') === 'true'
  const where = tabletOnly
    ? and(eq(menuCategories.isActive, true), eq(menuCategories.isTabletVisible, true))
    : eq(menuCategories.isActive, true)
  const cats = await db.select().from(menuCategories).where(where).orderBy(asc(menuCategories.sortOrder))
  return c.json({ categories: cats })
})

menuRouter.post('/categories', requireAuth, requireRole('owner', 'staff'), zValidator('json', CategorySchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [cat] = await db.insert(menuCategories).values(body).returning()
  return c.json({ category: cat }, 201)
})

// Reorder categories — must be BEFORE /categories/:id
menuRouter.patch('/categories/reorder', requireAuth, requireRole('owner', 'staff'), zValidator('json', z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
})), async (c) => {
  const db = c.var.db
  const { items } = c.req.valid('json')
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of items) {
      await tx.update(menuCategories).set({ sortOrder }).where(eq(menuCategories.id, id))
    }
  })
  return c.json({ ok: true })
})

menuRouter.patch('/categories/:id', requireAuth, requireRole('owner', 'staff'), zValidator('json', CategorySchema.partial()), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [cat] = await db.update(menuCategories).set(body).where(eq(menuCategories.id, c.req.param('id'))).returning()
  if (!cat) return c.json({ error: 'Not found' }, 404)
  return c.json({ category: cat })
})

menuRouter.delete('/categories/:id', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  await db.transaction(async (tx) => {
    // Открепляем товары от категории, иначе FK не даст удалить (товары осиротеют).
    await tx.update(inventory).set({ category: null }).where(eq(inventory.category, id))
    await tx.delete(menuCategories).where(eq(menuCategories.id, id))
  })
  return c.json({ ok: true })
})

// Темы экрана меню (public/tv-menu.html); выбирает владелец в «Настройках» → menu_screen_theme.
const SCREEN_THEMES = ['night', 'neon', 'deco', 'synth', 'avant', 'dossier', 'halloween']

// QR для карточек рекламы: SVG по ссылке, с небольшим кэшем (экраны опрашивают меню
// раз в 20 с — пересобирать один и тот же QR незачем).
const qrCache = new Map<string, string>()
async function qrSvg(url: string): Promise<string | null> {
  const hit = qrCache.get(url)
  if (hit) return hit
  try {
    const QRCode = await import('qrcode')
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
    if (qrCache.size > 100) qrCache.clear()
    qrCache.set(url, svg)
    return svg
  } catch {
    return null
  }
}

// Публичное меню для экранов (/menu — AbleSign/ТВ), без авторизации, клуб по Host.
// Гостю — простые названия и понятный порядок: сначала «Игровой вечер» (тарифы) и
// «Кабинки» (почасовая аренда зон) по возрастанию цены, затем разделы меню в порядке
// владельца, позиции внутри — по алфавиту (варианты одного напитка стоят рядом).
// Только включённые и отмеченные «на экране ТВ» позиции/зоны с ценой > 0 (тариф без
// цены ещё не настроен); без себестоимости и остатков.
menuRouter.get('/public', async (c) => {
  const db = c.var.db
  const [cats, rows, spaceRows, settingRows] = await Promise.all([
    db.select({ id: menuCategories.id, name: menuCategories.name, icon: menuCategories.icon })
      .from(menuCategories).where(eq(menuCategories.isActive, true)).orderBy(asc(menuCategories.sortOrder)),
    db.select({ name: inventory.name, category: inventory.category, price: inventory.price })
      .from(inventory)
      .where(and(eq(inventory.isActive, true), eq(inventory.isScreenVisible, true), isNull(inventory.deletedAt))),
    db.select({ name: spaces.name, type: spaces.type, hourlyRate: spaces.hourlyRate })
      .from(spaces).where(and(eq(spaces.isActive, true), eq(spaces.isScreenVisible, true))),
    db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings)
      .where(inArray(appSettings.key, ['venue_name', 'menu_screen_theme', 'menu_screen_band_sec'])),
  ])
  const setting = (key: string) => settingRows.find((r) => r.key === key)?.value || null

  type Item = { name: string; price: number; perHour?: boolean }
  type Section = { title: string; icon: string; featured: boolean; items: Item[] }
  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
  const byPrice = (a: Item, b: Item) => a.price - b.price || byName(a, b)

  const items = rows
    .map((r) => ({ name: r.name.trim(), category: r.category, price: Number(r.price) }))
    .filter((r) => r.name && r.price > 0)
  const pick = (category: string | null) => items
    .filter((i) => i.category === category)
    .map(({ name, price }) => ({ name, price }))

  const isTariffCat = (name: string) => name.toLowerCase().includes('тариф')
  const tariffItems: Item[] = []
  const menuSections: Section[] = []
  for (const cat of cats) {
    const own = pick(cat.id)
    if (own.length === 0) continue
    if (isTariffCat(cat.name)) tariffItems.push(...own)
    else menuSections.push({ title: cat.name.trim(), icon: cat.icon, featured: false, items: own.sort(byName) })
  }
  const uncategorized = pick(null)
  if (uncategorized.length) menuSections.push({ title: 'Другое', icon: 'other', featured: false, items: uncategorized.sort(byName) })

  // Аренда зон — цена за час. Зона, заведённая ещё и позицией меню, не дублируется.
  const itemNames = new Set(items.map((i) => i.name.toLowerCase()))
  const rentable = spaceRows
    .map((s) => ({ name: s.name.trim(), type: s.type, price: Number(s.hourlyRate) }))
    .filter((s) => s.name && s.price > 0 && !itemNames.has(s.name.toLowerCase()))

  const sections: Section[] = []
  if (tariffItems.length) {
    sections.push({ title: 'Игровой вечер', icon: 'tariffs', featured: true, items: tariffItems.sort(byPrice) })
  }
  if (rentable.length) {
    sections.push({
      title: rentable.every((s) => s.type.endsWith('_booth')) ? 'Кабинки' : 'Аренда',
      icon: 'rental',
      featured: true,
      items: rentable.map(({ name, price }) => ({ name, price, perHour: true })).sort(byPrice),
    })
  }
  sections.push(...menuSections)

  const theme = setting('menu_screen_theme')
  const bandSec = Math.min(300, Math.max(5, Number(setting('menu_screen_band_sec')) || 20))

  // Реклама в области ленты: включённые слайды по порядку, у карточек со ссылкой — QR.
  const slideRows = await db.select().from(screenSlides)
    .where(eq(screenSlides.isActive, true)).orderBy(asc(screenSlides.sortOrder), asc(screenSlides.createdAt))
  const slides = []
  for (const sl of slideRows) {
    if (sl.kind === 'image' && !sl.imageUrl) continue
    if (sl.kind === 'card' && !sl.title && !sl.body && !sl.linkUrl) continue
    slides.push({
      kind: sl.kind,
      imageUrl: sl.kind === 'image' ? sl.imageUrl : null,
      title: sl.kind === 'card' ? sl.title : null,
      body: sl.kind === 'card' ? sl.body : null,
      qrSvg: sl.kind === 'card' && sl.linkUrl ? await qrSvg(sl.linkUrl) : null,
      durationSec: sl.durationSec,
    })
  }

  return c.json({
    clubName: setting('venue_name'),
    theme: theme && SCREEN_THEMES.includes(theme) ? theme : 'night',
    bandSec,
    slides,
    sections,
  })
})

// ── Реклама на экране меню: слайды (правит владелец в «Настройках» HUB) ─────
const httpUrl = z.string().trim().max(1000).url().refine((u) => /^https?:\/\//i.test(u), 'Нужна ссылка http(s)')
const SlideSchema = z.object({
  kind: z.enum(['image', 'card']),
  imageUrl: httpUrl.nullable().optional(),
  title: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().max(240).nullable().optional(),
  linkUrl: httpUrl.nullable().optional(),
  durationSec: z.number().int().min(3).max(120).default(10),
  isActive: z.boolean().default(true),
})

menuRouter.get('/slides', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const slides = await db.select().from(screenSlides).orderBy(asc(screenSlides.sortOrder), asc(screenSlides.createdAt))
  return c.json({ slides })
})

menuRouter.post('/slides', requireAuth, requireRole('owner'), zValidator('json', SlideSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  if (body.kind === 'image' && !body.imageUrl) return c.json({ error: 'Нужна картинка' }, 400)
  const [last] = await db.select({ sortOrder: screenSlides.sortOrder }).from(screenSlides).orderBy(desc(screenSlides.sortOrder)).limit(1)
  const [slide] = await db.insert(screenSlides).values({ ...body, sortOrder: (last?.sortOrder ?? -1) + 1 }).returning()
  return c.json({ slide }, 201)
})

// Порядок — ДО /slides/:id, иначе 'reorder' поймался бы как id.
menuRouter.patch('/slides/reorder', requireAuth, requireRole('owner'), zValidator('json', z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })),
})), async (c) => {
  const db = c.var.db
  const { items } = c.req.valid('json')
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of items) {
      await tx.update(screenSlides).set({ sortOrder, updatedAt: new Date() }).where(eq(screenSlides.id, id))
    }
  })
  return c.json({ ok: true })
})

menuRouter.patch('/slides/:id', requireAuth, requireRole('owner'), zValidator('json', SlideSchema.partial()), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [slide] = await db.update(screenSlides).set({ ...body, updatedAt: new Date() }).where(eq(screenSlides.id, c.req.param('id'))).returning()
  if (!slide) return c.json({ error: 'Not found' }, 404)
  return c.json({ slide })
})

menuRouter.delete('/slides/:id', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  await db.delete(screenSlides).where(eq(screenSlides.id, c.req.param('id')))
  return c.json({ ok: true })
})

// Items
menuRouter.get('/items', async (c) => {
  const db = c.var.db
  const categoryId = c.req.query('categoryId')
  const tabletVisible = c.req.query('tabletVisible') === 'true'
  const baseFilter = and(eq(inventory.isActive, true), isNull(inventory.deletedAt))
  const catFilter = categoryId ? and(baseFilter, eq(inventory.category, categoryId)) : baseFilter
  const where = tabletVisible ? and(catFilter, eq(inventory.isTabletVisible, true)) : catFilter
  const rows = await db
    .select()
    .from(inventory)
    .where(where)
    .orderBy(asc(inventory.sortOrder), asc(inventory.name))
  // Публичный список — без costPrice (себестоимость/маржа не для гостей).
  const items = rows.map(({ costPrice, ...rest }) => rest)
  return c.json({ items })
})

menuRouter.get('/items/all', requireAuth, async (c) => {
  const db = c.var.db
  const items = await db
    .select()
    .from(inventory)
    .where(isNull(inventory.deletedAt))
    .orderBy(asc(inventory.sortOrder), asc(inventory.name))
  return c.json({ items })
})

menuRouter.get('/items/:id', async (c) => {
  const db = c.var.db
  const [item] = await db.select().from(inventory).where(eq(inventory.id, c.req.param('id')))
  if (!item) return c.json({ error: 'Not found' }, 404)
  const mods = await db.select().from(modifiers).where(eq(modifiers.productId, item.id))
  const { costPrice, ...safeItem } = item
  return c.json({ item: safeItem, modifiers: mods })
})

menuRouter.post('/items', requireAuth, requireRole('owner', 'staff'), zValidator('json', ItemSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [item] = await db.insert(inventory).values({
    ...body,
    // Начальный остаток ВСЕГДА 0: количество меняется только через Закупки/
    // Ревизии/Списания (аудируемый PATCH /inventory/:id), а не из меню.
    stockQuantity: 0,
    price: String(body.price),
    costPrice: String(body.costPrice),
  }).returning()
  return c.json({ item }, 201)
})

// Reorder items — must be BEFORE /:id routes to avoid being captured as id="reorder"
menuRouter.patch('/items/reorder', requireAuth, requireRole('owner', 'staff'), zValidator('json', z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
})), async (c) => {
  const db = c.var.db
  const { items } = c.req.valid('json')
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of items) {
      await tx.update(inventory).set({ sortOrder, updatedAt: new Date() }).where(eq(inventory.id, id))
    }
  })
  return c.json({ ok: true })
})

menuRouter.patch('/items/:id', requireAuth, requireRole('owner', 'staff'), zValidator('json', ItemSchema.partial()), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const updateData: Record<string, any> = { ...body, updatedAt: new Date() }
  // Остаток меняется ТОЛЬКО через аудируемый PATCH /inventory/:id (с блокировкой
  // строки и записью движения). Здесь абсолютная перезапись затёрла бы
  // параллельные продажи без аудита — поэтому stockQuantity не трогаем.
  // minThreshold/trackStock — это конфигурация, их править можно.
  delete updateData.stockQuantity
  if (body.price !== undefined) updateData.price = String(body.price)
  if (body.costPrice !== undefined) updateData.costPrice = String(body.costPrice)
  const [item] = await db.update(inventory).set(updateData).where(eq(inventory.id, c.req.param('id'))).returning()
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json({ item })
})

menuRouter.delete('/items/:id', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  // Мягкое удаление: позиция остаётся в БД ради исторических чеков, но помечается
  // deletedAt и исчезает из всех списков меню. См. 009_inventory_soft_delete.sql.
  await db.update(inventory).set({ deletedAt: new Date() }).where(eq(inventory.id, c.req.param('id')))
  return c.json({ ok: true })
})

// Modifiers
menuRouter.get('/items/:id/modifiers', async (c) => {
  const db = c.var.db
  const mods = await db.select().from(modifiers).where(eq(modifiers.productId, c.req.param('id')))
  return c.json({ modifiers: mods })
})

menuRouter.post('/items/:id/modifiers', requireAuth, requireRole('owner', 'staff'), zValidator('json', ModifierSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [mod] = await db.insert(modifiers).values({
    ...body,
    price: String(body.price),
    productId: c.req.param('id'),
  }).returning()
  return c.json({ modifier: mod }, 201)
})

menuRouter.delete('/items/:itemId/modifiers/:modId', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  await db.delete(modifiers).where(eq(modifiers.id, c.req.param('modId')))
  return c.json({ ok: true })
})
