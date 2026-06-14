import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  profiles, transactions, bonusHistory, clientTiers, clientDiscountRules,
  eq, and, isNull, isNotNull, ilike, or, desc, asc, sql, count, inArray,
} from '@titan/database'

// Роли, видимые в разделе «Клиенты». Сотрудники/владельцы — тоже клиенты (имеют
// депозит/бонусы/тариф в том же профиле). Исключаем только планшеты.
const CLIENT_ROLES = ['client', 'staff', 'owner'] as const
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { accrueBonusLot, getBonusExpiryDays } from '../../lib/bonusLots.js'
import { hashPassword } from '@titan/auth'
import { notify, notifyClient } from '../notifications/push.js'
import { visitProgress, maybePromoteToResident } from '../../lib/loyalty.js'
import { listRoster } from '../../lib/roster.js'
import { readAliases, aliasesForProfile, addAlias, removeAlias, resolveProfileIdByAlias } from '../../lib/tgAliases.js'
import { playerDetail as gomafiaPlayer } from '../../lib/gomafia.js'
import { createHmac } from 'node:crypto'

const GM_TAG_RE = /^gomafia:\d+$/

const CreateClientSchema = z.object({
  nickname: z.string().min(2),
  fullName: z.string().nullable().optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  clientTier: z.string().min(1).default('newbie'),
  password: z.string().optional(),
  tgId: z.string().optional(),
  tgUsername: z.string().optional(),
  photoUrl: z.string().max(500).optional(),
  gomafiaPhotoUrl: z.string().max(500).optional(),
  searchTags: z.array(z.string()).default([]),
})

const UpdateClientSchema = z.object({
  nickname: z.string().min(2).optional(),
  fullName: z.string().nullable().optional(),
  // nullable: фронт шлёт null, когда поле очищено (иначе весь PATCH падал 400 и
  // не сохранялось НИЧЕГО, включая статус/имя).
  phone: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  clientTier: z.string().min(1).optional(),
  // nullable: null очищает ручное фото (тогда показывается фото из TG/GoMafia).
  photoUrl: z.string().nullable().optional(),
  searchTags: z.array(z.string()).optional(),
  isResident: z.boolean().optional(),
  tgId: z.string().nullable().optional(),
  tgUsername: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
})

export const clientsRouter = new Hono<AppEnv>()
clientsRouter.use('*', requireAuth)
// Все операции с клиентами — только персонал/владелец (PII, балансы, история).
// Клиентский кошелёк (роль client) обслуживается отдельным self-эндпоинтом.
clientsRouter.use('*', requireRole('owner', 'staff'))

clientsRouter.get('/', async (c) => {
  const db = c.var.db
  const search = c.req.query('search')
  const filter = c.req.query('filter')
  const page = Number(c.req.query('page') ?? 1)
  const limit = 30
  const offset = (page - 1) * limit

  // debtors filter — clients with negative balance
  if (filter === 'debtors') {
    const clients = await db
      .select()
      .from(profiles)
      .where(and(
        inArray(profiles.role, CLIENT_ROLES),
        isNull(profiles.deletedAt),
        sql`${profiles.balance}::numeric < 0`,
      ))
      .orderBy(sql`${profiles.balance}::numeric asc`)
    const safe = clients.map(({ pin, passwordHash, ...c }) => c)
    return c.json({ clients: safe, total: safe.length, page: 1, limit: safe.length })
  }

  // balances filter — все клиенты с НЕнулевым балансом (депозиты + долги) для
  // единого экрана «Депозиты и долги». Сортировка desc: депозиты сверху, долги снизу.
  if (filter === 'balances') {
    const clients = await db
      .select()
      .from(profiles)
      .where(and(
        inArray(profiles.role, CLIENT_ROLES),
        isNull(profiles.deletedAt),
        sql`${profiles.balance}::numeric <> 0`,
      ))
      .orderBy(sql`${profiles.balance}::numeric desc`)
    const safe = clients.map(({ pin, passwordHash, ...c }) => c)
    return c.json({ clients: safe, total: safe.length, page: 1, limit: safe.length })
  }

  // deposits filter — clients with positive balance (депозит)
  if (filter === 'deposits') {
    const clients = await db
      .select()
      .from(profiles)
      .where(and(
        inArray(profiles.role, CLIENT_ROLES),
        isNull(profiles.deletedAt),
        sql`${profiles.balance}::numeric > 0`,
      ))
      .orderBy(sql`${profiles.balance}::numeric desc`)
    const safe = clients.map(({ pin, passwordHash, ...c }) => c)
    return c.json({ clients: safe, total: safe.length, page: 1, limit: safe.length })
  }

  // Архив — заблокированные (deletedAt задан). Иначе — активные.
  const archived = filter === 'archived'
  // Раздел по статусу: «Резиденты»/«Гости»/«Студенты» — фильтр по clientTier.
  const tier = c.req.query('tier')
  const where = and(
    inArray(profiles.role, CLIENT_ROLES),
    archived ? isNotNull(profiles.deletedAt) : isNull(profiles.deletedAt),
    tier ? eq(profiles.clientTier, tier) : undefined,
    search
      ? or(
          ilike(profiles.nickname, `%${search}%`),
          ilike(profiles.phone ?? '', `%${search}%`),
          // Поиск и по тегам клиента (search_tags), как в /pos/players/search.
          sql`exists (select 1 from unnest(${profiles.searchTags}) as tag where lower(tag) like ${`%${search.toLowerCase()}%`})`,
        )
      : undefined,
  )

  // Сортировка. По умолчанию (и 'last_check') — по дате последнего пробитого
  // (закрытого) чека, активные сверху; затем имя/новизна/баланс/бонусы.
  // last_check считаем коррелированным подзапросом (без join, чтобы не плодить строки).
  const sort = c.req.query('sort')
  const lastCheckExpr = sql`(select max(c.created_at) from checks c where c.player_id = ${profiles.id} and c.status = 'closed')`
  const orderExpr =
    sort === 'name' ? asc(sql`lower(${profiles.nickname})`)
    : sort === 'recent' ? desc(profiles.createdAt)
    : sort === 'balance' ? desc(sql`${profiles.balance}::numeric`)
    : sort === 'bonus' ? desc(sql`${profiles.bonusPoints}::numeric`)
    : sql`${lastCheckExpr} desc nulls last` // default = last_check
  const clients = await db
    .select()
    .from(profiles)
    .where(where)
    .orderBy(orderExpr, desc(profiles.createdAt))
    .limit(limit)
    .offset(offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(profiles)
    .where(where)

  // Сотрудники теперь тоже в списке — НЕ отдаём их хеши (pin/passwordHash).
  const safe = clients.map(({ pin, passwordHash, ...rest }) => rest)
  return c.json({ clients: safe, total, page, limit })
})

// ─── Статусы клиентов (справочник) ─────────────────────────────────────────────
// Регистрируем ДО '/:id', иначе GET '/tiers' попал бы в обработчик '/:id'.

// Транслит ключа из метки (латиница-слаг). Ключ хранится в profiles.client_tier.
const RU_SLUG: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
function slugifyTierKey(label: string): string {
  const base = label.toLowerCase().split('').map(ch => RU_SLUG[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return base || `tier_${Date.now().toString(36)}`
}

clientsRouter.get('/tiers', async (c) => {
  const db = c.var.db
  const tiers = await db.select().from(clientTiers).orderBy(asc(clientTiers.sortOrder), asc(clientTiers.key))
  return c.json({ tiers })
})

const CreateTierSchema = z.object({
  label: z.string().min(1).max(40),
  color: z.string().min(1).max(40).optional(),
  key: z.string().min(1).max(32).optional(),
})
clientsRouter.post('/tiers', requireRole('owner'), zValidator('json', CreateTierSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  let key = (body.key && body.key.trim()) ? slugifyTierKey(body.key) : slugifyTierKey(body.label)
  // Уникальность ключа: если занят — добавляем суффикс.
  const existing = await db.select({ key: clientTiers.key }).from(clientTiers)
  const taken = new Set(existing.map(t => t.key))
  if (taken.has(key)) { let i = 2; while (taken.has(`${key}_${i}`)) i++; key = `${key}_${i}` }
  const [maxRow] = await db.select({ m: sql<number>`coalesce(max(${clientTiers.sortOrder}), 0)::int` }).from(clientTiers)
  const [tier] = await db.insert(clientTiers).values({
    key, label: body.label.trim(), color: body.color?.trim() || '#8B5CF6',
    sortOrder: (maxRow?.m ?? 0) + 1, isSystem: false,
  }).returning()
  return c.json({ tier }, 201)
})

clientsRouter.delete('/tiers/:key', requireRole('owner'), async (c) => {
  const db = c.var.db
  const key = c.req.param('key')
  const [tier] = await db.select().from(clientTiers).where(eq(clientTiers.key, key))
  if (!tier) return c.json({ error: 'Not found' }, 404)
  if (tier.isSystem) return c.json({ error: 'Системный статус нельзя удалить' }, 400)
  // Клиентов с этим статусом переводим в 'guest', затем удаляем статус.
  const [used] = await db.select({ n: count() }).from(profiles).where(eq(profiles.clientTier, key))
  const reassigned = used?.n ?? 0
  if (reassigned > 0) await db.update(profiles).set({ clientTier: 'guest' }).where(eq(profiles.clientTier, key))
  // Правила скидок, ссылающиеся на удаляемый статус, переводим на 'guest', чтобы
  // не оставлять висячих ссылок на несуществующий тир.
  await db.update(clientDiscountRules).set({ clientTier: 'guest' }).where(eq(clientDiscountRules.clientTier, key))
  await db.delete(clientTiers).where(eq(clientTiers.key, key))
  return c.json({ ok: true, reassigned })
})

clientsRouter.post('/', requireRole('owner', 'staff'), zValidator('json', CreateClientSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const passwordHash = body.password ? await hashPassword(body.password) : undefined
  const [client] = await db.insert(profiles).values({
    nickname: body.nickname,
    fullName: body.fullName ?? null,
    role: 'client',
    phone: body.phone,
    birthday: body.birthday,
    clientTier: body.clientTier,
    tgId: body.tgId,
    tgUsername: body.tgUsername,
    photoUrl: body.photoUrl ?? null,
    gomafiaPhotoUrl: body.gomafiaPhotoUrl ?? null,
    searchTags: body.searchTags,
    passwordHash,
  }).returning()
  const { pin, passwordHash: _, ...safe } = client

  const newClientTier = ({ newbie: 'Новичок', guest: 'Гость', resident: 'Резидент', student: 'Студент' } as Record<string, string>)[client.clientTier ?? '']
  void notify({
    type: 'new_client',
    title: 'Новый клиент',
    body: newClientTier ? `${client.nickname} · ${newClientTier}` : client.nickname,
    meta: { clientId: client.id },
  }, db).catch(() => {})

  return c.json({ client: safe }, 201)
})

// Ростер «увиденных» Telegram-пользователей чата (для сопоставления клиента с TG).
// Регистрируем ДО /:id, иначе «tg-roster» попало бы в параметр :id.
clientsRouter.get('/tg-roster', async (c) => {
  const db = c.var.db
  const users = await listRoster(db)
  // Помечаем, кто из ростера уже привязан к клиенту (как ОСНОВНОЙ tg_id ИЛИ как
  // дополнительный аккаунт — алиас), чтобы UI не дублировал.
  const ids = users.map((u) => u.tgId)
  const linkMap = new Map<string, string>()
  if (ids.length) {
    const linkedPrimary = await db
      .select({ tgId: profiles.tgId, nickname: profiles.nickname })
      .from(profiles)
      .where(and(inArray(profiles.tgId, ids), isNull(profiles.deletedAt)))
    for (const l of linkedPrimary) if (l.tgId) linkMap.set(l.tgId, l.nickname)

    const aliasMap = await readAliases(db)
    const aliasPids = ids.filter((id) => aliasMap[id]).map((id) => aliasMap[id]!.profileId)
    if (aliasPids.length) {
      const aliasProfiles = await db
        .select({ id: profiles.id, nickname: profiles.nickname })
        .from(profiles)
        .where(and(inArray(profiles.id, aliasPids), isNull(profiles.deletedAt)))
      const nickById = new Map(aliasProfiles.map((p) => [p.id, p.nickname]))
      for (const id of ids) {
        const a = aliasMap[id]
        if (a && !linkMap.has(id)) {
          const nick = nickById.get(a.profileId)
          if (nick) linkMap.set(id, nick)
        }
      }
    }
  }
  return c.json({ users: users.map((u) => ({ ...u, linkedTo: linkMap.get(u.tgId) ?? null })) })
})

clientsRouter.get('/:id', async (c) => {
  const db = c.var.db
  const [client] = await db.select().from(profiles).where(and(eq(profiles.id, c.req.param('id')), isNull(profiles.deletedAt)))
  if (!client) return c.json({ error: 'Not found' }, 404)
  const { pin, passwordHash, ...safe } = client
  return c.json({ client: safe })
})

clientsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', UpdateClientSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  const update: Record<string, any> = { ...body }
  if (body.deletedAt !== undefined) update.deletedAt = body.deletedAt ? new Date(body.deletedAt) : null

  const [client] = await db.update(profiles).set(update).where(eq(profiles.id, c.req.param('id'))).returning()
  if (!client) return c.json({ error: 'Not found' }, 404)
  const { pin, passwordHash, ...safe } = client
  return c.json({ client: safe })
})

// Подписанный диплинк + QR для привязки Telegram клиента через Wallet-бота.
// Эндпоинт ТОЛЬКО подписывает и кодирует токен — запущенный бот не требуется.
// Формат токена обязан совпадать с тем, что проверяет apps/bot-wallet/src/index.ts.
const WALLET_BOT_USERNAME = process.env['WALLET_BOT_USERNAME'] ?? 'titanwalletrobot'

clientsRouter.post('/:id/telegram-link', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const [client] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, c.req.param('id')), inArray(profiles.role, CLIENT_ROLES), isNull(profiles.deletedAt)))
  if (!client) return c.json({ error: 'Not found' }, 404)

  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) return c.json({ error: 'JWT_SECRET is not configured' }, 500)

  // UUID профиля → 16 сырых байт → base64url (22 симв.)
  const idB64 = Buffer.from(client.id.replace(/-/g, ''), 'hex').toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 15 * 60
  const expB36 = exp.toString(36)
  const sigMsg = `${idB64}_${expB36}`
  const sig = createHmac('sha256', jwtSecret).update(sigMsg).digest().subarray(0, 12).toString('base64url')
  const payload = `link_${idB64}_${expB36}_${sig}`
  const deepLink = `https://t.me/${WALLET_BOT_USERNAME}?start=${payload}`

  const QRCode = await import('qrcode')
  const qrDataUrl = await QRCode.toDataURL(deepLink, { margin: 1, width: 320 })

  return c.json({ deepLink, qrDataUrl, expiresIn: 900 })
})

// Список Telegram-аккаунтов клиента (один человек может иметь несколько TG):
// основной (profiles.tg_id) + дополнительные (алиасы в app_settings).
clientsRouter.get('/:id/tg-accounts', async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const [me] = await db.select({ tgId: profiles.tgId, tgUsername: profiles.tgUsername }).from(profiles).where(eq(profiles.id, id)).limit(1)
  if (!me) return c.json({ error: 'Not found' }, 404)
  const aliases = await aliasesForProfile(db, id)
  const accounts = [
    ...(me.tgId ? [{ tgId: me.tgId, username: me.tgUsername, primary: true }] : []),
    ...aliases.map((a) => ({ tgId: a.tgId, username: a.username, primary: false })),
  ]
  return c.json({ accounts })
})

// Привязать TG-аккаунт к клиенту. Если у клиента ещё нет основного — ставим
// основным (profiles.tg_id); иначе добавляем ДОПОЛНИТЕЛЬНЫМ (алиас). Один tg_id
// не может принадлежать двум профилям (проверка по основным И алиасам → 409).
clientsRouter.post(
  '/:id/tg-link',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({ tgId: z.string().min(1), tgUsername: z.string().nullable().optional() })),
  async (c) => {
    const db = c.var.db
    const id = c.req.param('id')
    const { tgId, tgUsername } = c.req.valid('json')

    // Занят ли этот tgId другим профилем (как основной)?
    const [otherPrimary] = await db
      .select({ id: profiles.id, nickname: profiles.nickname })
      .from(profiles)
      .where(and(eq(profiles.tgId, tgId), isNull(profiles.deletedAt)))
      .limit(1)
    if (otherPrimary && otherPrimary.id !== id) {
      return c.json({ error: `Этот Telegram уже привязан к «${otherPrimary.nickname}»` }, 409)
    }
    // ...или как дополнительный (алиас) у другого профиля?
    const aliasOwner = await resolveProfileIdByAlias(db, tgId)
    if (aliasOwner && aliasOwner !== id) {
      return c.json({ error: 'Этот Telegram уже привязан к другому профилю' }, 409)
    }

    const [me] = await db.select({ tgId: profiles.tgId }).from(profiles).where(eq(profiles.id, id)).limit(1)
    if (!me) return c.json({ error: 'Not found' }, 404)

    // Уже привязан к этому профилю — ок (идемпотентно).
    if (me.tgId === tgId || aliasOwner === id) {
      // обновим username при необходимости
      if (me.tgId === tgId) await db.update(profiles).set({ tgUsername: tgUsername ?? null }).where(eq(profiles.id, id))
      else await addAlias(db, tgId, id, tgUsername ?? null)
    } else if (!me.tgId) {
      // Нет основного → ставим основным.
      try {
        await db.update(profiles).set({ tgId, tgUsername: tgUsername ?? null }).where(eq(profiles.id, id))
      } catch (err: any) {
        if (err?.code === '23505') return c.json({ error: 'Этот Telegram уже привязан к другому профилю' }, 409)
        throw err
      }
    } else {
      // Основной уже есть → добавляем дополнительным аккаунтом.
      await addAlias(db, tgId, id, tgUsername ?? null)
    }

    const aliases = await aliasesForProfile(db, id)
    const [meNow] = await db.select({ tgId: profiles.tgId, tgUsername: profiles.tgUsername }).from(profiles).where(eq(profiles.id, id)).limit(1)
    const accounts = [
      ...(meNow?.tgId ? [{ tgId: meNow.tgId, username: meNow.tgUsername, primary: true }] : []),
      ...aliases.map((a) => ({ tgId: a.tgId, username: a.username, primary: false })),
    ]
    return c.json({ ok: true, accounts })
  },
)

// Отвязать конкретный TG-аккаунт клиента (основной или дополнительный).
clientsRouter.delete(
  '/:id/tg-link',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({ tgId: z.string().min(1) })),
  async (c) => {
    const db = c.var.db
    const id = c.req.param('id')
    const { tgId } = c.req.valid('json')
    const [me] = await db.select({ tgId: profiles.tgId }).from(profiles).where(eq(profiles.id, id)).limit(1)
    if (!me) return c.json({ error: 'Not found' }, 404)
    if (me.tgId === tgId) {
      await db.update(profiles).set({ tgId: null, tgUsername: null }).where(eq(profiles.id, id))
    } else {
      await removeAlias(db, tgId)
    }
    return c.json({ ok: true })
  },
)

// ─── Сопоставление клиента с игроком GoMafia ───────────────────────────────────
// Связь хранится тегом searchTags «gomafia:<id>» (без миграции). Один профиль
// GoMafia не может быть привязан к двум клиентам (проверка по тегу → 409). При
// привязке дозаполняем имя/фото из карточки GoMafia, НЕ затирая ручные значения.
clientsRouter.post(
  '/:id/gomafia-link',
  requireRole('owner', 'staff'),
  zValidator('json', z.object({ gomafiaId: z.string().regex(/^\d+$/) })),
  async (c) => {
    const db = c.var.db
    const id = c.req.param('id')
    const { gomafiaId } = c.req.valid('json')
    const tag = `gomafia:${gomafiaId}`

    const [me] = await db
      .select({ searchTags: profiles.searchTags, fullName: profiles.fullName, photoUrl: profiles.photoUrl })
      .from(profiles).where(eq(profiles.id, id)).limit(1)
    if (!me) return c.json({ error: 'Not found' }, 404)

    // Занят ли этот игрок GoMafia другим клиентом?
    const [other] = await db
      .select({ id: profiles.id, nickname: profiles.nickname })
      .from(profiles)
      .where(and(sql`${profiles.searchTags} @> ARRAY[${tag}]::text[]`, isNull(profiles.deletedAt)))
      .limit(1)
    if (other && other.id !== id) {
      return c.json({ error: `Этот игрок GoMafia уже сопоставлен с «${other.nickname}»` }, 409)
    }

    // Карточка GoMafia — имя для дозаполнения + аватар в СВОЙ слот (gomafia_photo_url).
    // Ручное фото (photo_url) и фото Telegram имеют приоритет — их не трогаем.
    const player = await gomafiaPlayer(gomafiaId).catch(() => null)

    const tags = (me.searchTags ?? []).filter((t) => !GM_TAG_RE.test(t))
    tags.push(tag)
    const patch: Record<string, unknown> = { searchTags: tags, gomafiaPhotoUrl: player?.avatar ?? null }
    if (!me.fullName && player?.fullName) patch['fullName'] = player.fullName

    const [updated] = await db.update(profiles).set(patch).where(eq(profiles.id, id)).returning()
    const { pin, passwordHash, ...safe } = updated
    return c.json({ ok: true, client: safe, gomafia: player })
  },
)

// Отвязать клиента от GoMafia (убираем тег gomafia:*; имя/фото не трогаем).
clientsRouter.delete('/:id/gomafia-link', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  const [me] = await db.select({ searchTags: profiles.searchTags }).from(profiles).where(eq(profiles.id, id)).limit(1)
  if (!me) return c.json({ error: 'Not found' }, 404)
  const tags = (me.searchTags ?? []).filter((t) => !GM_TAG_RE.test(t))
  const [updated] = await db.update(profiles).set({ searchTags: tags, gomafiaPhotoUrl: null }).where(eq(profiles.id, id)).returning()
  const { pin, passwordHash, ...safe } = updated
  return c.json({ ok: true, client: safe })
})

clientsRouter.delete('/:id', requireRole('owner'), async (c) => {
  const db = c.var.db
  await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.id, c.req.param('id')))
  return c.json({ ok: true })
})

// Полное удаление профиля (НАВСЕГДА). Только из архива (deletedAt задан) и только
// владельцем. Все ссылки на профиль чистятся обобщённо по каталогу FK:
//  - passkeys → удаляются (учётные данные не должны пережить пользователя);
//  - nullable-колонки → NULL (чек/уведомление сохраняются, но «обезличиваются»);
//  - NOT NULL-колонки → переносятся на sentinel-профиль «Удалённый пользователь»
//    (кто открыл смену/пробил чек и т.п.) — иначе удаление либо падает на FK
//    (напр. checks.shift_id → shifts), либо разрушило бы операционно-финансовую
//    историю заведения. Сотрудник со сменами/чеками теперь удаляется корректно.
clientsRouter.delete('/:id/permanent', requireRole('owner'), async (c) => {
  const db = c.var.db
  const id = c.req.param('id')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'Bad id' }, 400)
  }
  const [client] = await db.select({ id: profiles.id, deletedAt: profiles.deletedAt }).from(profiles).where(eq(profiles.id, id))
  if (!client) return c.json({ error: 'Not found' }, 404)
  if (!client.deletedAt) return c.json({ error: 'Сначала отправьте клиента в архив' }, 400)

  await db.transaction(async (tx) => {
    // Sentinel создаём лениво — только если есть NOT NULL-ссылки (у обычного клиента
    // их нет, тогда «надгробие» не плодится).
    let sentinelId: string | null = null
    const ensureSentinel = async (): Promise<string> => {
      if (sentinelId) return sentinelId
      const SENTINEL_NICK = '__deleted_user__'
      const [ex] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.nickname, SENTINEL_NICK))
      if (ex) { sentinelId = ex.id; return sentinelId }
      // role 'tablet' → не попадает ни в список клиентов, ни в список персонала,
      // а без linkedSpaceId не матчится и при входе планшета.
      const [created] = await tx.insert(profiles).values({ nickname: SENTINEL_NICK, fullName: 'Удалённый пользователь', role: 'tablet' }).returning({ id: profiles.id })
      sentinelId = created!.id
      return sentinelId
    }

    const fkRes = await tx.execute(sql`
      SELECT cl.relname AS tbl, att.attname AS col, att.attnotnull AS notnull
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND con.confrelid = 'profiles'::regclass AND array_length(con.conkey, 1) = 1
    `)
    const fks: any[] = (fkRes as any).rows ?? fkRes ?? []
    for (const fk of fks) {
      const tblName = String(fk.tbl)
      const tbl = sql.identifier(tblName)
      const col = sql.identifier(String(fk.col))
      if (tblName === 'passkeys') {
        await tx.execute(sql`DELETE FROM ${tbl} WHERE ${col} = ${id}`)
      } else if (fk.notnull) {
        const sid = await ensureSentinel()
        await tx.execute(sql`UPDATE ${tbl} SET ${col} = ${sid} WHERE ${col} = ${id}`)
      } else {
        await tx.execute(sql`UPDATE ${tbl} SET ${col} = NULL WHERE ${col} = ${id}`)
      }
    }
    await tx.delete(profiles).where(eq(profiles.id, id))
  })
  return c.json({ ok: true })
})

// Прогресс к статусу Резидент (посещения) — для карточки клиента.
clientsRouter.get('/:id/visit-progress', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  return c.json(await visitProgress(c.req.param('id'), db))
})

// Ручная корректировка «виртуальных» посещений (±). На кассу/баланс не влияет:
// меняем profiles.manual_visits и пишем запись в историю (type='visit_adjust').
clientsRouter.post('/:id/visits', requireRole('owner', 'staff'), zValidator('json', z.object({
  delta: z.number().int().refine(v => v !== 0, 'Шаг не может быть 0'),
})), async (c) => {
  const db = c.var.db
  const user = c.get('user')
  const id = c.req.param('id')
  const { delta } = c.req.valid('json')
  const [p] = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, id), isNull(profiles.deletedAt)))
  if (!p) return c.json({ error: 'Not found' }, 404)
  await db.update(profiles).set({ manualVisits: sql`${profiles.manualVisits} + ${delta}` }).where(eq(profiles.id, id))
  await db.insert(transactions).values({
    type: 'visit_adjust',
    amount: String(delta),
    playerId: id,
    createdBy: user.sub,
    description: delta > 0 ? `Начислено посещение (+${delta})` : `Снято посещение (${delta})`,
  })
  const promo = delta > 0 ? await maybePromoteToResident(id, db) : { promoted: false }
  return c.json({ ...(await visitProgress(id, db)), promoted: promo.promoted })
})

clientsRouter.get('/:id/transactions', async (c) => {
  const db = c.var.db
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.playerId, c.req.param('id')))
    .orderBy(desc(transactions.createdAt))
    .limit(50)
  return c.json({ transactions: rows })
})

clientsRouter.post('/:id/balance', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number(),
  description: z.string().min(3, 'Причина обязательна (минимум 3 символа)').optional(),
  reason: z.string().min(3, 'Причина обязательна (минимум 3 символа)').optional(),
  // Ключ идемпотентности (опционально): повтор с тем же ключом не задваивает баланс.
  idempotencyKey: z.string().min(1).max(80).optional(),
})), async (c) => {
  const db = c.var.db
  const { amount, description, reason, idempotencyKey } = c.req.valid('json')
  const note = description ?? reason
  if (!note) {
    return c.json({ error: 'Необходимо указать причину изменения баланса (description или reason)' }, 400)
  }
  const user = c.get('user')
  const clientId = c.req.param('id')

  // Обновление баланса и запись транзакции — в ОДНОЙ транзакции БД, с блокировкой
  // строки клиента (SELECT … FOR UPDATE). Иначе параллельные списания читали
  // устаревший баланс и могли пробить лимит долга / разъехаться с историей.
  type Result =
    | { kind: 'not_found' }
    | { kind: 'limit'; maxDebt: number; newBalance: number }
    | { kind: 'duplicate'; newBalance: number }
    | { kind: 'ok'; newBalance: number; prevBalance: number }

  const result = await db.transaction<Result>(async (tx) => {
    // Блокируем строку клиента до конца транзакции.
    const lockRes = await tx.execute(sql`
      SELECT balance FROM profiles WHERE id = ${clientId} FOR UPDATE
    `)
    const lockRows = (lockRes as any).rows ?? lockRes
    if (!lockRows || lockRows.length === 0) return { kind: 'not_found' }

    const currentBalance = parseFloat(String(lockRows[0].balance))
    const newBalance = currentBalance + amount

    // Лимит долга из app_settings (max_client_debt): >0 → ограничение; 0/пусто → без лимита.
    if (amount < 0) {
      const maxDebtRow = await tx.execute(sql`SELECT value FROM app_settings WHERE key = 'max_client_debt'`)
      const maxDebt = parseFloat(((maxDebtRow as any).rows?.[0]?.value ?? (maxDebtRow as any)[0]?.value) ?? '0') || 0
      if (maxDebt > 0 && newBalance < -maxDebt) {
        return { kind: 'limit', maxDebt, newBalance }
      }
    }

    // Сначала пишем транзакцию (с ключом идемпотентности, если есть). Повтор с тем же
    // ключом → ON CONFLICT DO NOTHING вернёт 0 строк → баланс НЕ меняем (дубль).
    const ins = await tx.insert(transactions).values({
      type: amount >= 0 ? 'deposit' : 'withdrawal',
      amount: String(Math.abs(amount)),
      playerId: clientId,
      createdBy: user.sub,
      description: note,
      idempotencyKey: idempotencyKey ?? null,
    }).onConflictDoNothing({ target: transactions.idempotencyKey }).returning({ id: transactions.id })

    if (idempotencyKey && ins.length === 0) {
      return { kind: 'duplicate', newBalance: currentBalance }
    }

    await tx.execute(sql`
      UPDATE profiles SET balance = ${String(newBalance)} WHERE id = ${clientId}
    `)

    return { kind: 'ok', newBalance, prevBalance: currentBalance }
  })

  if (result.kind === 'not_found') return c.json({ error: 'Not found' }, 404)
  if (result.kind === 'duplicate') return c.json({ balance: result.newBalance, duplicate: true })
  if (result.kind === 'limit') {
    return c.json({ error: `Превышен лимит долга (${result.maxDebt}₽). Запрошенный баланс: ${result.newBalance.toFixed(2)}₽` }, 400)
  }

  // Уведомления (fire-and-forget, после транзакции). Имя клиента — чтобы из текста
  // было ясно, КТО пополнил/закрыл долг.
  const [cli] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, clientId))
  const who = cli?.nickname ?? 'Клиент'
  const fmtAmt = Math.abs(amount).toLocaleString('ru')
  const fmtBal = result.newBalance.toLocaleString('ru', { maximumFractionDigits: 0 })

  if (amount > 0) {
    // Если до пополнения был долг — это его погашение (полное или частичное).
    let depTitle = 'Пополнение депозита'
    let depBody = `${who} · +${fmtAmt} ₽ · баланс ${fmtBal} ₽`
    if (result.prevBalance < 0) {
      if (result.newBalance >= 0) {
        depTitle = 'Долг погашен'
        depBody = `${who} · внёс ${fmtAmt} ₽ · долг закрыт, баланс ${fmtBal} ₽`
      } else {
        depTitle = 'Частичное погашение долга'
        depBody = `${who} · внёс ${fmtAmt} ₽ · остаток долга ${Math.abs(result.newBalance).toLocaleString('ru', { maximumFractionDigits: 0 })} ₽`
      }
    }
    void notify({ type: 'deposit_topup', title: depTitle, body: depBody, meta: { clientId } }, db).catch(() => {})
    void notifyClient(clientId, `💰 Депозит пополнен на ${fmtAmt} ₽.\nБаланс: ${fmtBal} ₽`, db)
  }
  // Долг образовался: баланс только что ушёл в минус (раньше был неотрицателен).
  if (result.newBalance < 0 && result.prevBalance >= 0) {
    void notify({
      type: 'debt_created',
      title: 'Новый долг клиента',
      body: `${who} · долг ${Math.abs(result.newBalance).toLocaleString('ru', { maximumFractionDigits: 0 })} ₽`,
      meta: { clientId },
    }, db).catch(() => {})
    void notifyClient(clientId, `⚠️ У вас образовался долг: ${Math.abs(result.newBalance).toLocaleString('ru')} ₽`, db)
  }

  return c.json({ balance: result.newBalance })
})

clientsRouter.post('/:id/bonus', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number().min(-1_000_000).max(1_000_000),
  reason: z.string().min(3, 'Причина обязательна (минимум 3 символа)'),
})), async (c) => {
  const db = c.var.db
  const { amount, reason } = c.req.valid('json')
  const user = c.get('user')
  const [client] = await db.select().from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!client) return c.json({ error: 'Not found' }, 404)

  // Апдейт баланса + лот в одной транзакции: положительное ручное начисление
  // должно создавать лот, чтобы сгорать как любое начисление. Отрицательное
  // списание лоты НЕ трогает — за это отвечает clamp в expireBonuses.
  let newBonus = 0
  let insufficient = false
  await db.transaction(async (tx) => {
    let updateResult: any
    if (amount < 0) {
      // Атомарный апдейт: при списании проверяем достаточность через условие в SQL
      updateResult = await tx.execute(sql`
        UPDATE profiles
        SET bonus_points = bonus_points + ${amount}
        WHERE id = ${client.id} AND bonus_points >= ${Math.abs(amount)}
        RETURNING bonus_points
      `)
    } else {
      updateResult = await tx.execute(sql`
        UPDATE profiles
        SET bonus_points = bonus_points + ${amount}
        WHERE id = ${client.id}
        RETURNING bonus_points
      `)
    }
    const rows = updateResult.rows ?? updateResult
    if (!rows || rows.length === 0) {
      insufficient = true
      return
    }
    newBonus = parseFloat(String(rows[0].bonus_points ?? rows[0].bonusPoints ?? 0))

    await tx.insert(bonusHistory).values({
      profileId: client.id,
      amount: String(amount),
      balanceAfter: String(newBonus),
      reason: `[${user.nickname ?? user.sub}] ${reason}`,
    })

    // Лот только для положительного начисления (списание клампится в cron).
    if (amount > 0) {
      const expiryDays = await getBonusExpiryDays(tx)
      await accrueBonusLot(tx, client.id, amount, expiryDays)
    }
  })

  if (insufficient) {
    return c.json({ error: 'Insufficient bonus points' }, 400)
  }

  if (amount > 0) {
    void notifyClient(client.id, `⭐ Вам начислено ${amount.toLocaleString('ru')} бонусов.\nВсего: ${Math.round(newBonus).toLocaleString('ru')} ⭐`, db)
  } else if (amount < 0) {
    void notifyClient(client.id, `💫 Списано ${Math.abs(amount).toLocaleString('ru')} бонусов.\nОстаток: ${Math.round(newBonus).toLocaleString('ru')} ⭐`, db)
  }
  return c.json({ bonusPoints: newBonus })
})

clientsRouter.get('/:id/bonus-history', async (c) => {
  const db = c.var.db
  const rows = await db
    .select()
    .from(bonusHistory)
    .where(eq(bonusHistory.profileId, c.req.param('id')))
    .orderBy(desc(bonusHistory.createdAt))
    .limit(50)
  return c.json({ history: rows })
})
