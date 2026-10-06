/**
 * «Экраны» — телевизоры клуба с приложением Titan Menu (миграция 068).
 *
 * HUB (веб и приложение): список экранов, настройки каждого (тип, поворот, тема,
 * лента), слайды, привязка и отвязка приставки. Правит владелец, персонал смотрит.
 *
 * Приставка: телефон находит её в локальной сети, берёт здесь одноразовый секрет
 * (POST /:id/pairing, 10 минут) и передаёт приставке; та меняет его на свой токен
 * (POST /device/claim) и раз в 20 с отмечается (POST /device/heartbeat) — так HUB
 * видит «в сети», а приставка узнаёт поворот. Экран удалили или отвязали — пульс
 * отвечает 401, приставка возвращается к экрану привязки.
 *
 * Показ: GET /:id/public — без авторизации, то же, что видит гость на ТВ.
 */
import type { AppEnv } from '../../types.js'
import type { Screen } from '@titan/database'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createHash, randomBytes } from 'node:crypto'
import { screens, screenSlides, eq, and, ne, asc, desc, gt } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { clientIp } from '../../lib/clientIp.js'
import { requestOrigin } from '../notifications/staff-calls.js'
import { SCREEN_THEMES, screenPayload } from './screen-content.js'

const PAIRING_TTL_MS = 10 * 60_000
/** Приставка отмечается раз в 20 с; дольше минуты тишины — «не в сети». */
const ONLINE_WINDOW_MS = 60_000

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const httpUrl = z.string().trim().max(1000).url().refine((u) => /^https?:\/\//i.test(u), 'Нужна ссылка http(s)')

const ScreenSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['menu', 'slideshow']).default('menu'),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(270)]).default(0),
  theme: z.enum(SCREEN_THEMES).default('night'),
  bandSec: z.number().int().min(5).max(300).default(20),
})

const SlideSchema = z.object({
  kind: z.enum(['image', 'card']),
  imageUrl: httpUrl.nullable().optional(),
  title: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().max(240).nullable().optional(),
  linkUrl: httpUrl.nullable().optional(),
  durationSec: z.number().int().min(3).max(600).default(10),
  transition: z.enum(['fade', 'slide', 'zoom', 'flip', 'none']).default('fade'),
  fit: z.enum(['contain', 'cover']).default('contain'),
  isActive: z.boolean().default(true),
})

const ClaimSchema = z.object({
  secret: z.string().min(16).max(200),
  deviceId: z.string().trim().min(4).max(100),
  model: z.string().trim().max(100).optional(),
  appVersion: z.string().trim().max(30).optional(),
})

const HeartbeatSchema = z.object({ appVersion: z.string().trim().max(30).optional() })

/** Экран для HUB: без хэшей токенов, со статусом приставки. */
function publicScreen(s: Screen) {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    rotation: s.rotation,
    theme: s.theme,
    bandSec: s.bandSec,
    sortOrder: s.sortOrder,
    paired: !!s.deviceTokenHash,
    online: !!s.deviceTokenHash && !!s.lastSeenAt && Date.now() - s.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
    deviceModel: s.deviceModel,
    appVersion: s.appVersion,
    deviceIp: s.deviceIp,
    pairedAt: s.pairedAt,
    lastSeenAt: s.lastSeenAt,
  }
}

/** Что приставке нужно знать о своём экране (ответ привязки и пульса). */
const deviceView = (s: Screen) => ({ screenId: s.id, name: s.name, kind: s.kind, rotation: s.rotation })

const unpairedFields = {
  deviceId: null,
  deviceModel: null,
  appVersion: null,
  deviceIp: null,
  deviceTokenHash: null,
  pairedAt: null,
  lastSeenAt: null,
}

export const screensRouter = new Hono<AppEnv>()

// ── Приставка (до /:id, иначе 'device' поймался бы как id) ─────────────────

screensRouter.post('/device/claim', zValidator('json', ClaimSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [screen] = await db.select().from(screens)
    .where(and(eq(screens.pairingHash, sha256(body.secret)), gt(screens.pairingExpiresAt, new Date())))
  if (!screen) return c.json({ error: 'Код привязки устарел — начните привязку на телефоне заново' }, 404)

  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const [paired] = await db.transaction(async (tx) => {
    // Приставка была привязана к другому экрану — там она больше не показывает.
    await tx.update(screens).set({ ...unpairedFields, updatedAt: now })
      .where(and(eq(screens.deviceId, body.deviceId), ne(screens.id, screen.id)))
    return tx.update(screens).set({
      deviceId: body.deviceId,
      deviceModel: body.model || null,
      appVersion: body.appVersion || null,
      deviceIp: clientIp(c),
      deviceTokenHash: sha256(token),
      pairedAt: now,
      lastSeenAt: now,
      pairingHash: null,
      pairingExpiresAt: null,
      updatedAt: now,
    }).where(eq(screens.id, screen.id)).returning()
  })
  if (!paired) return c.json({ error: 'Экран не найден' }, 404)
  return c.json({ ...deviceView(paired), token })
})

screensRouter.post('/device/heartbeat', zValidator('json', HeartbeatSchema), async (c) => {
  const db = c.var.db
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return c.json({ error: 'Нет токена приставки' }, 401)
  const { appVersion } = c.req.valid('json')
  const [screen] = await db.update(screens)
    .set({ lastSeenAt: new Date(), deviceIp: clientIp(c), ...(appVersion ? { appVersion } : {}) })
    .where(eq(screens.deviceTokenHash, sha256(token)))
    .returning()
  if (!screen) return c.json({ error: 'Приставка не привязана' }, 401)
  return c.json(deviceView(screen))
})

// ── Показ на ТВ (без авторизации, как /menu/public) ────────────────────────

screensRouter.get('/:id/public', async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'Экран не найден' }, 404)
  const [screen] = await db.select().from(screens).where(eq(screens.id, id))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  return c.json(await screenPayload(db, screen))
})

// ── HUB: экраны ─────────────────────────────────────────────────────────────

async function findScreen(db: AppEnv['Variables']['db'], id: string): Promise<Screen | null> {
  if (!UUID.test(id)) return null
  const [screen] = await db.select().from(screens).where(eq(screens.id, id))
  return screen ?? null
}

screensRouter.get('/', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const rows = await db.select().from(screens).orderBy(asc(screens.sortOrder), asc(screens.createdAt))
  return c.json({ screens: rows.map(publicScreen) })
})

screensRouter.post('/', requireAuth, requireRole('owner'), zValidator('json', ScreenSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const [last] = await db.select({ sortOrder: screens.sortOrder }).from(screens).orderBy(desc(screens.sortOrder)).limit(1)
  const [screen] = await db.insert(screens).values({ ...body, sortOrder: (last?.sortOrder ?? -1) + 1 }).returning()
  if (!screen) return c.json({ error: 'Экран не создан' }, 500)
  return c.json({ screen: publicScreen(screen) }, 201)
})

screensRouter.get('/:id', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const slides = await db.select().from(screenSlides)
    .where(eq(screenSlides.screenId, screen.id)).orderBy(asc(screenSlides.sortOrder), asc(screenSlides.createdAt))
  return c.json({ screen: publicScreen(screen), slides })
})

screensRouter.patch('/:id', requireAuth, requireRole('owner'), zValidator('json', ScreenSchema.partial()), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const [updated] = await db.update(screens).set({ ...c.req.valid('json'), updatedAt: new Date() })
    .where(eq(screens.id, screen.id)).returning()
  return c.json({ screen: publicScreen(updated ?? screen) })
})

screensRouter.delete('/:id', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  await db.delete(screens).where(eq(screens.id, screen.id))
  return c.json({ ok: true })
})

// Одноразовый секрет для приставки: телефон передаёт его по локальной сети вместе
// с адресом клуба. Новый запрос заменяет прежний секрет.
screensRouter.post('/:id/pairing', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const secret = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS)
  await db.update(screens).set({ pairingHash: sha256(secret), pairingExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(screens.id, screen.id))
  return c.json({ secret, host: requestOrigin(c), expiresAt })
})

screensRouter.post('/:id/unpair', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const [updated] = await db.update(screens)
    .set({ ...unpairedFields, pairingHash: null, pairingExpiresAt: null, updatedAt: new Date() })
    .where(eq(screens.id, screen.id)).returning()
  return c.json({ screen: publicScreen(updated ?? screen) })
})

// ── HUB: слайды экрана ──────────────────────────────────────────────────────

screensRouter.get('/:id/slides', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const slides = await db.select().from(screenSlides)
    .where(eq(screenSlides.screenId, screen.id)).orderBy(asc(screenSlides.sortOrder), asc(screenSlides.createdAt))
  return c.json({ slides })
})

screensRouter.post('/:id/slides', requireAuth, requireRole('owner'), zValidator('json', SlideSchema), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const body = c.req.valid('json')
  if (body.kind === 'image' && !body.imageUrl) return c.json({ error: 'Нужна картинка' }, 400)
  if (body.kind === 'card' && screen.kind === 'slideshow') return c.json({ error: 'В слайдшоу — только картинки' }, 400)
  const [last] = await db.select({ sortOrder: screenSlides.sortOrder }).from(screenSlides)
    .where(eq(screenSlides.screenId, screen.id)).orderBy(desc(screenSlides.sortOrder)).limit(1)
  const [slide] = await db.insert(screenSlides)
    .values({ ...body, screenId: screen.id, sortOrder: (last?.sortOrder ?? -1) + 1 }).returning()
  return c.json({ slide }, 201)
})

// Порядок — ДО /:id/slides/:slideId, иначе 'reorder' поймался бы как id слайда.
screensRouter.patch('/:id/slides/reorder', requireAuth, requireRole('owner'), zValidator('json', z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })),
})), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  if (!screen) return c.json({ error: 'Экран не найден' }, 404)
  const { items } = c.req.valid('json')
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of items) {
      await tx.update(screenSlides).set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(screenSlides.id, id), eq(screenSlides.screenId, screen.id)))
    }
  })
  return c.json({ ok: true })
})

screensRouter.patch('/:id/slides/:slideId', requireAuth, requireRole('owner'), zValidator('json', SlideSchema.partial()), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  const slideId = c.req.param('slideId')
  if (!screen || !UUID.test(slideId)) return c.json({ error: 'Слайд не найден' }, 404)
  const [slide] = await db.update(screenSlides).set({ ...c.req.valid('json'), updatedAt: new Date() })
    .where(and(eq(screenSlides.id, slideId), eq(screenSlides.screenId, screen.id))).returning()
  if (!slide) return c.json({ error: 'Слайд не найден' }, 404)
  return c.json({ slide })
})

screensRouter.delete('/:id/slides/:slideId', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const screen = await findScreen(db, c.req.param('id'))
  const slideId = c.req.param('slideId')
  if (!screen || !UUID.test(slideId)) return c.json({ error: 'Слайд не найден' }, 404)
  await db.delete(screenSlides).where(and(eq(screenSlides.id, slideId), eq(screenSlides.screenId, screen.id)))
  return c.json({ ok: true })
})
