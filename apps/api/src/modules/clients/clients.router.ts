import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  db, profiles, transactions, bonusHistory, clientTiers, clientDiscountRules,
  eq, and, isNull, ilike, or, desc, asc, sql, count,
} from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { accrueBonusLot, getBonusExpiryDays } from '../../lib/bonusLots.js'
import { hashPassword } from '@titan/auth'
import { createHmac } from 'node:crypto'

const CreateClientSchema = z.object({
  nickname: z.string().min(2),
  fullName: z.string().nullable().optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  clientTier: z.string().min(1).default('guest'),
  password: z.string().optional(),
  tgId: z.string().optional(),
  tgUsername: z.string().optional(),
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
  photoUrl: z.string().optional(),
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
        eq(profiles.role, 'client'),
        isNull(profiles.deletedAt),
        sql`${profiles.balance}::numeric < 0`,
      ))
      .orderBy(sql`${profiles.balance}::numeric asc`)
    const safe = clients.map(({ pin, passwordHash, ...c }) => c)
    return c.json({ clients: safe, total: safe.length, page: 1, limit: safe.length })
  }

  // deposits filter — clients with positive balance (депозит)
  if (filter === 'deposits') {
    const clients = await db
      .select()
      .from(profiles)
      .where(and(
        eq(profiles.role, 'client'),
        isNull(profiles.deletedAt),
        sql`${profiles.balance}::numeric > 0`,
      ))
      .orderBy(sql`${profiles.balance}::numeric desc`)
    const safe = clients.map(({ pin, passwordHash, ...c }) => c)
    return c.json({ clients: safe, total: safe.length, page: 1, limit: safe.length })
  }

  const where = and(
    eq(profiles.role, 'client'),
    isNull(profiles.deletedAt),
    search
      ? or(
          ilike(profiles.nickname, `%${search}%`),
          ilike(profiles.phone ?? '', `%${search}%`),
        )
      : undefined,
  )

  const clients = await db
    .select()
    .from(profiles)
    .where(where)
    .orderBy(desc(profiles.createdAt))
    .limit(limit)
    .offset(offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(profiles)
    .where(where)

  return c.json({ clients, total, page, limit })
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
  const tiers = await db.select().from(clientTiers).orderBy(asc(clientTiers.sortOrder), asc(clientTiers.key))
  return c.json({ tiers })
})

const CreateTierSchema = z.object({
  label: z.string().min(1).max(40),
  color: z.string().min(1).max(40).optional(),
  key: z.string().min(1).max(32).optional(),
})
clientsRouter.post('/tiers', requireRole('owner'), zValidator('json', CreateTierSchema), async (c) => {
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
    searchTags: body.searchTags,
    passwordHash,
  }).returning()
  const { pin, passwordHash: _, ...safe } = client
  return c.json({ client: safe }, 201)
})

clientsRouter.get('/:id', async (c) => {
  const [client] = await db.select().from(profiles).where(and(eq(profiles.id, c.req.param('id')), isNull(profiles.deletedAt)))
  if (!client) return c.json({ error: 'Not found' }, 404)
  const { pin, passwordHash, ...safe } = client
  return c.json({ client: safe })
})

clientsRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', UpdateClientSchema), async (c) => {
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
  const [client] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, c.req.param('id')), eq(profiles.role, 'client'), isNull(profiles.deletedAt)))
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

clientsRouter.delete('/:id', requireRole('owner'), async (c) => {
  await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.id, c.req.param('id')))
  return c.json({ ok: true })
})

clientsRouter.get('/:id/transactions', async (c) => {
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
})), async (c) => {
  const { amount, description, reason } = c.req.valid('json')
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
    | { kind: 'ok'; newBalance: number }

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

    await tx.execute(sql`
      UPDATE profiles SET balance = ${String(newBalance)} WHERE id = ${clientId}
    `)

    await tx.insert(transactions).values({
      type: amount >= 0 ? 'deposit' : 'withdrawal',
      amount: String(Math.abs(amount)),
      playerId: clientId,
      createdBy: user.sub,
      description: note,
    })

    return { kind: 'ok', newBalance }
  })

  if (result.kind === 'not_found') return c.json({ error: 'Not found' }, 404)
  if (result.kind === 'limit') {
    return c.json({ error: `Превышен лимит долга (${result.maxDebt}₽). Запрошенный баланс: ${result.newBalance.toFixed(2)}₽` }, 400)
  }
  return c.json({ balance: result.newBalance })
})

clientsRouter.post('/:id/bonus', requireRole('owner', 'staff'), zValidator('json', z.object({
  amount: z.number().min(-1_000_000).max(1_000_000),
  reason: z.string().min(3, 'Причина обязательна (минимум 3 символа)'),
})), async (c) => {
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

  return c.json({ bonusPoints: newBonus })
})

clientsRouter.get('/:id/bonus-history', async (c) => {
  const rows = await db
    .select()
    .from(bonusHistory)
    .where(eq(bonusHistory.profileId, c.req.param('id')))
    .orderBy(desc(bonusHistory.createdAt))
    .limit(50)
  return c.json({ history: rows })
})
