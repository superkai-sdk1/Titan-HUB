import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  checks, checkItems, checkItemModifiers, checkPayments, checkDiscounts, pendingOrders, chatMessages,
  inventory, profiles, spaces, certificates, bonusHistory, transactions, modifiers as modifiersTable,
  appSettings, events, discounts, clientDiscountRules,
  eq, and, ne, inArray, desc, asc, sql, isNull,
} from '@titan/database'
import type { Database } from '@titan/database'
import { recordMovement } from '../inventory/ledger.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift, getShiftCashBalance } from '../shifts/shifts.service.js'
import { computeShiftForecast } from '../../lib/shiftForecast.js'
import { aiAllowed } from '../../middleware/module.js'
import { notify, notifyClient } from '../notifications/push.js'
import { maybePromoteToResident } from '../../lib/loyalty.js'
import { profileNameCondition, profileTagCondition } from '../../lib/searchVariants.js'
import { getPrecheckCandidates } from '../../lib/prechecks.js'
import { getCheckSuggestions, learnFromCheckClose } from '../../lib/suggestions.js'
import { accrueBonusLot, spendBonusLots, getBonusExpiryDays } from '../../lib/bonusLots.js'
import { getNumericSetting, LARGE_CHECK_KEY, DEFAULT_LARGE_CHECK, getBoolSetting, STAFF_DISCOUNT_KEY, STAFF_MAX_DISCOUNT_KEY, DEFAULT_STAFF_MAX_DISCOUNT } from '../../lib/appSettings.js'
import { round2, computeRental, computeTotals } from '../../lib/money.js'
import { publishEvent, updatesChannel } from '../../lib/realtime.js'
import { getClubIntegration } from '../../lib/secrets.js'
import { getActiveSbpProvider, getProvider, resolveCreds, getPaymentTestMode } from '../pay/registry.js'
import { buildCheckReceipt } from '../pay/fiscal/receipt.js'
import { Redis } from 'ioredis'
import { streamSSE } from 'hono/streaming'

// Единый расчёт суммы чека: позиции + модификаторы − скидки.
// Скидки пересчитываются от ТЕКУЩИХ позиций (не доверяем сохранённому amount),
// иначе изменение/удаление позиции оставит «застывшую» скидку.


const AddItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  modifierIds: z.array(z.string().uuid()).default([]),
})

const PaySchema = z.object({
  // min(0): чек на 0₽ (например, скидка обнулила сумму) закрывается пустым набором —
  // платить нечего. Бэкенд при пустом наборе подставляет cash на сумму total (=0).
  payments: z.array(z.object({
    method: z.enum(['cash', 'card', 'transfer', 'bonus', 'deposit', 'debt', 'split', 'certificate']),
    amount: z.number().positive(),
  })).min(0),
  certificateCode: z.string().optional(),
  bonusAmount: z.number().min(0).optional(),
  playerId: z.string().uuid().optional(),
  note: z.string().optional(),
})

const OpenCheckSchema = z.object({
  spaceId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  guestNames: z.array(z.string()).default([]),
  note: z.string().optional(),
  linkedEventId: z.string().uuid().optional(),
})

export const posRouter = new Hono<AppEnv>()
posRouter.use('*', requireAuth)

// IDOR-гард зоны для роли tablet: планшет может трогать ТОЛЬКО чек своей зоны
// (profiles.linkedSpaceId === check.spaceId). owner/staff — без ограничений.
// Возвращает Response 403 при нарушении, иначе null.
async function tabletZoneForbidden(c: any, checkId: string): Promise<Response | null> {
  const user = c.get('user')
  if (user.role !== 'tablet') return null
  const db = c.var.db
  const [me] = await db.select({ spaceId: profiles.linkedSpaceId }).from(profiles).where(eq(profiles.id, user.sub))
  const [chk] = await db.select({ spaceId: checks.spaceId }).from(checks).where(eq(checks.id, checkId))
  if (!me?.spaceId || !chk || chk.spaceId !== me.spaceId) return c.json({ error: 'Forbidden' }, 403)
  return null
}

async function getCheckWithItems(checkId: string, exec: DbOrTx) {
  const [check] = await exec.select().from(checks).where(eq(checks.id, checkId))
  if (!check) return null
  const items = await exec
    .select({ checkItem: checkItems, item: inventory })
    .from(checkItems)
    .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
    .where(eq(checkItems.checkId, checkId))
  const payments = await exec.select().from(checkPayments).where(eq(checkPayments.checkId, checkId))
  const discountRows = await exec.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))

  // Модификаторы по позициям (для отображения и корректной суммы на фронте)
  const checkItemIds = items.map(i => i.checkItem.id)
  const itemMods = checkItemIds.length
    ? await exec.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, checkItemIds))
    : []
  const modsByItem = new Map<string, typeof itemMods>()
  for (const m of itemMods) {
    const arr = modsByItem.get(m.checkItemId) ?? []
    arr.push(m)
    modsByItem.set(m.checkItemId, arr)
  }
  const itemsWithMods = items.map(i => ({ ...i, modifiers: modsByItem.get(i.checkItem.id) ?? [] }))

  // Получаем hourlyRate пространства для live-расчёта аренды на фронте
  let spaceHourlyRate: string | null = null
  if (check.spaceId) {
    const [space] = await exec.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
    spaceHourlyRate = space?.hourlyRate ?? null
  }

  // Имя для заголовка чека: ник привязанного клиента либо первый из гостей.
  // (раньше деталь не отдавала guestName — заголовок всегда показывал «Гость»).
  let guestName: string | null = null
  if (check.playerId) {
    const [player] = await exec.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, check.playerId))
    guestName = player?.nickname ?? null
  } else if (check.guestNames && check.guestNames.length > 0) {
    guestName = check.guestNames[0] ?? null
  }

  // Снятые с чека авто/тир-скидки (excludedDiscountIds) — с именами, чтобы фронт
  // мог предложить их вернуть. Берём только ещё существующие активные скидки.
  const excludedIds = check.excludedDiscountIds ?? []
  const excludedDiscounts = excludedIds.length
    ? (await exec.select({ id: discounts.id, name: discounts.name, type: discounts.type, value: discounts.value })
        .from(discounts).where(inArray(discounts.id, excludedIds)))
    : []

  // Ожидающие подтверждения заказы гостя с планшета (для баннера на чеке POS и
  // отображения «ожидает подтверждения» на планшете).
  const pending = await exec
    .select()
    .from(pendingOrders)
    .where(and(eq(pendingOrders.checkId, checkId), eq(pendingOrders.status, 'pending')))
    .orderBy(pendingOrders.createdAt)

  return { ...check, items: itemsWithMods, payments, discounts: discountRows, excludedDiscounts, spaceHourlyRate, guestName, pendingOrders: pending }
}

// Добавление одной позиции в открытый чек ВНУТРИ транзакции: блокировка строки
// склада (FOR UPDATE), списание + журнал движения, мерж с существующей строкой
// того же товара без модификаторов / иначе вставка, модификаторы. Возвращает
// строку позиции и факт пересечения порога низкого остатка (уведомление шлёт
// вызывающий после коммита). Бросает CHECK_NOT_OPEN / ITEM_NOT_FOUND /
// INSUFFICIENT_STOCK. Используется и при добавлении из кассы, и при подтверждении
// заказа гостя (см. /orders/:id/confirm) — логика склада одна.
async function addCheckItemTx(
  tx: Tx,
  opts: { checkId: string; itemId: string; quantity: number; modifierIds?: string[]; userId: string },
): Promise<{ checkItem: typeof checkItems.$inferSelect | undefined; lowStock: { name: string; newQty: number } | null }> {
  const { checkId, itemId, quantity, userId } = opts
  const modifierIds = opts.modifierIds ?? []
  let lowStock: { name: string; newQty: number } | null = null

  const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
  if (!check || check.status !== 'open') throw new Error('CHECK_NOT_OPEN')

  const itemRows = await tx.execute(
    sql`SELECT id, name, price, track_stock as "trackStock", stock_quantity as "stockQuantity", min_threshold as "minThreshold"
        FROM inventory WHERE id = ${itemId} FOR UPDATE`
  )
  const item: any = (itemRows as any).rows?.[0] ?? (itemRows as any)[0]
  if (!item) throw new Error('ITEM_NOT_FOUND')

  // Продажу НЕ блокируем при нехватке остатка: позицию «нет в наличии» можно
  // пробить (оверселл). Остаток уйдёт в минус — это честно отражает дефицит,
  // владелец сводит его Ревизией. Журнал движения остаётся консистентным.
  if (item.trackStock) {
    // Продажу не блокируем при нехватке (оверселл) — clamp:false, остаток уходит в минус.
    const res = await recordMovement(tx, {
      itemId, type: 'sale', delta: -quantity, clamp: false,
      sourceType: 'check', sourceId: checkId, reason: `Продажа: чек ${checkId}`, userId,
    })
    const oldQty = Number(item.stockQuantity ?? 0)
    const newQty = res.qtyAfter
    const minThreshold = Number(item.minThreshold ?? 0)
    if (minThreshold > 0 && oldQty > minThreshold && newQty <= minThreshold) {
      lowStock = { name: String(item.name), newQty }
    }
  }

  // Мерж с существующей строкой того же товара БЕЗ модификаторов (иначе дубли и
  // ломаются авто-скидки с minQuantity). Позиции с модификаторами — всегда отдельно.
  if (!modifierIds.length) {
    const existing = await tx
      .select({ id: checkItems.id, quantity: checkItems.quantity })
      .from(checkItems)
      .leftJoin(checkItemModifiers, eq(checkItemModifiers.checkItemId, checkItems.id))
      .where(and(eq(checkItems.checkId, checkId), eq(checkItems.itemId, itemId), isNull(checkItemModifiers.id)))
      .limit(1)
    if (existing.length && existing[0]) {
      const [merged] = await tx.update(checkItems)
        .set({ quantity: sql`${checkItems.quantity} + ${quantity}` })
        .where(eq(checkItems.id, existing[0].id))
        .returning()
      return { checkItem: merged, lowStock }
    }
  }

  const [insertedItem] = await tx.insert(checkItems).values({
    checkId,
    itemId,
    quantity,
    priceAtTime: String(item.price),
  }).returning()

  if (modifierIds.length) {
    const modRows = await tx.select().from(modifiersTable).where(inArray(modifiersTable.id, modifierIds))
    if (modRows.length) {
      await tx.insert(checkItemModifiers).values(modRows.map(m => ({
        checkItemId: insertedItem!.id,
        modifierId: m.id,
        priceAtTime: m.price,
      })))
    }
  }

  return { checkItem: insertedItem, lowStock }
}

// Авто-скидки из справочника `discounts` (isActive && isAuto) применяются к чеку
// при каждом пересчёте. Правила:
//   • discount.itemId  → target='item' на эту позицию, если она есть в чеке
//                        и её количество ≥ minQuantity.
//   • discount.clientId→ общая скидка на чек, только если playerId чека совпадает.
//   • без itemId/clientId → общая скидка на чек.
// Прежде применённые авто-строки (discountId IS NOT NULL) удаляются и
// пересоздаются, чтобы суммы оставались верными при изменении позиций и не
// плодились дубли. Ручные скидки (discountId IS NULL из /discount) не трогаем.
// База/сумма считаются тем же правилом, что и computeTotals / ручная скидка.
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type DbOrTx = Database | Tx

async function applyAutoDiscounts(exec: DbOrTx, checkId: string) {
  const [check] = await exec.select().from(checks).where(eq(checks.id, checkId))
  if (!check) return

  const items = await exec.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  // База для check-скидок = позиции + платные модификаторы (та же база, что у
  // computeTotals). Иначе сохранённый/отображаемый amount процентной check-скидки
  // расходится со списываемой при наличии платных модификаторов.
  const itemIds = items.map(i => i.id)
  const mods = itemIds.length
    ? await exec.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, itemIds))
    : []
  const qtyByItem = new Map(items.map(i => [i.id, i.quantity]))
  const modsSum = mods.reduce((s, m) => s + parseFloat(m.priceAtTime) * (qtyByItem.get(m.checkItemId) ?? 1), 0)
  const itemsOnlySum = items.reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)
  const itemsSum = itemsOnlySum + modsSum

  // Удаляем ранее применённые авто-скидки (по наличию discountId) перед пересчётом.
  await exec.delete(checkDiscounts).where(
    and(eq(checkDiscounts.checkId, checkId), sql`${checkDiscounts.discountId} IS NOT NULL`),
  )

  const toInsert: (typeof checkDiscounts.$inferInsert)[] = []
  const applied = new Set<string>() // дедуп по id скидки (auto + tier не задвоить)
  // Скидки, вручную снятые с этого чека — не применяем повторно.
  const excluded = new Set<string>(check.excludedDiscountIds ?? [])

  function pushDiscount(d: typeof discounts.$inferSelect) {
    if (applied.has(d.id) || excluded.has(d.id)) return
    applied.add(d.id)
    if (d.itemId) {
      // Скидка на конкретную позицию: к каждой строке этого товара, прошедшей minQuantity.
      const minQty = d.minQuantity ?? 1
      for (const it of items.filter(i => i.itemId === d.itemId && i.quantity >= minQty)) {
        const base = parseFloat(it.priceAtTime) * it.quantity
        const amount = d.type === 'percent'
          ? base * (parseFloat(d.value) / 100)
          : Math.min(parseFloat(d.value), base)
        if (amount <= 0) continue
        toInsert.push({
          checkId, discountId: d.id, name: d.name, type: d.type,
          value: String(d.value), amount: String(round2(amount)),
          target: 'item', itemId: it.id,
        })
      }
    } else {
      const base = itemsSum
      const amount = d.type === 'percent'
        ? base * (parseFloat(d.value) / 100)
        : Math.min(parseFloat(d.value), base)
      if (amount <= 0) return
      toInsert.push({
        checkId, discountId: d.id, name: d.name, type: d.type,
        value: String(d.value), amount: String(round2(amount)),
        target: 'check', itemId: null,
      })
    }
  }

  // 1. Авто-скидки (isAuto). Скидка с clientId (персональная) применяется ТОЛЬКО к
  //    чеку этого клиента — независимо от того, на позицию она или на весь чек.
  //    (Был баг: проверка клиента срабатывала лишь при отсутствии itemId, поэтому
  //    персональная скидка на конкретную позицию протекала во ВСЕ чеки с этой
  //    позицией. Теперь клиент-привязка проверяется всегда.)
  const autoRows = await exec.select().from(discounts)
    .where(and(eq(discounts.isActive, true), eq(discounts.isAuto, true)))
  for (const d of autoRows) {
    if (d.clientId && d.clientId !== check.playerId) continue
    pushDiscount(d)
  }

  // 2. Скидки по тиру: активное правило для тира клиента → связанная активная скидка
  //    (применяется в силу правила, независимо от флага isAuto самой скидки).
  //    Если на тир настроено НЕСКОЛЬКО активных правил — применяем ТОЛЬКО ОДНО,
  //    с максимальным эффектом (а не стопку), чтобы скидки не складывались сверх
  //    замысла. Эффект оцениваем на сумме позиций (check-level база).
  if (check.playerId) {
    const [player] = await exec.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, check.playerId))
    if (player?.tier) {
      const tierRows = await exec.select({ d: discounts })
        .from(clientDiscountRules)
        .innerJoin(discounts, eq(discounts.id, clientDiscountRules.discountId))
        .where(and(
          eq(clientDiscountRules.isActive, true),
          eq(clientDiscountRules.clientTier, player.tier),
          eq(discounts.isActive, true),
        ))
      const effect = (d: typeof discounts.$inferSelect) => {
        const base = d.itemId
          ? items.filter(i => i.itemId === d.itemId).reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0)
          : itemsSum
        return d.type === 'percent' ? base * (parseFloat(d.value) / 100) : Math.min(parseFloat(d.value), base)
      }
      const best = tierRows.map(r => r.d).filter(d => !applied.has(d.id))
        .sort((a, b) => effect(b) - effect(a))[0]
      if (best) pushDiscount(best)
    }
  }

  if (toInsert.length) await exec.insert(checkDiscounts).values(toInsert)
}

// Скидка персоналу/владельцу (тумблер в разделе скидок): если включена И плательщик
// чека — owner/staff, чек помечается списанием на персонал (staffCompId = плательщик),
// иначе метка снимается. Применяется автоматически (без ручной кнопки).
async function applyStaffComp(exec: DbOrTx, checkId: string) {
  const [check] = await exec.select({ playerId: checks.playerId, staffCompId: checks.staffCompId }).from(checks).where(eq(checks.id, checkId))
  if (!check) return
  let target: string | null = null
  if (check.playerId && await getBoolSetting(STAFF_DISCOUNT_KEY, false, exec)) {
    const [p] = await exec.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, check.playerId))
    if (p && (p.role === 'owner' || p.role === 'staff')) target = check.playerId
  }
  if ((check.staffCompId ?? null) !== target) {
    await exec.update(checks).set({ staffCompId: target }).where(eq(checks.id, checkId))
  }
}

async function recalcCheckTotal(checkId: string, exec: DbOrTx) {
  // Сначала пересчитываем авто-скидки от текущих позиций, затем списание на персонал, затем итог.
  await applyAutoDiscounts(exec, checkId)
  await applyStaffComp(exec, checkId)
  const items = await exec.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  const ids = items.map(i => i.id)
  const mods = ids.length
    ? await exec.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ids))
    : []
  const discountRows = await exec.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
  const [chk] = await exec.select({ staffCompId: checks.staffCompId }).from(checks).where(eq(checks.id, checkId))
  let { discountTotal, total } = computeTotals(items, mods, discountRows)
  // Списание на персонал: итог 0₽, а вся товарная сумма уходит в «скидку» (−100%).
  if (chk?.staffCompId) { discountTotal = round2(total + discountTotal); total = 0 }
  await exec.update(checks).set({
    totalAmount: String(total),
    discountTotal: String(discountTotal),
  }).where(eq(checks.id, checkId))
  return total
}

// Аренда зоны на момент now (или до spaceEndAt): ceil(минуты/60) × ставка.
// Тем же правилом считают /pay и вебхук Platega — держать синхронно.
async function computeRentalForCheck(exec: DbOrTx, check: typeof checks.$inferSelect): Promise<number> {
  if (!check.spaceId || !check.spaceStartAt) return 0
  const [space] = await exec.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
  return computeRental(check.spaceStartAt, check.spaceEndAt, space?.hourlyRate, Date.now())
}

// Авторитетный итог чека к оплате = позиции+модификаторы−скидки + аренда.
// Используется для QR (сумма НЕ берётся с клиента) и сверки.
async function computeCheckGrandTotal(exec: DbOrTx, check: typeof checks.$inferSelect): Promise<number> {
  // Списание на персонал — итог всегда 0₽.
  if (check.staffCompId) return 0
  const items = await exec.select().from(checkItems).where(eq(checkItems.checkId, check.id))
  const ids = items.map(i => i.id)
  const mods = ids.length
    ? await exec.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ids))
    : []
  const discountRows = await exec.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, check.id))
  const { total: itemsTotal } = computeTotals(items, mods, discountRows)
  const rental = await computeRentalForCheck(exec, check)
  // База события (фикс/ручная сумма мероприятия) — отдельное слагаемое итога,
  // как и аренда. Хранится в checks.event_base_amount, редактируется отдельно.
  const eventBase = parseFloat(check.eventBaseAmount ?? '0') || 0
  return round2(itemsTotal + rental + eventBase)
}

posRouter.get('/players/search', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const q = c.req.query('q') ?? ''
  if (!q.trim()) return c.json({ players: [] })

  const playerFields = {
    id: profiles.id,
    nickname: profiles.nickname,
    clientTier: profiles.clientTier,
    balance: profiles.balance,
    bonusPoints: profiles.bonusPoints,
    // Эффективное фото: ручное → Telegram → GoMafia.
    photoUrl: sql<string | null>`coalesce(${profiles.photoUrl}, ${profiles.tgPhotoUrl}, ${profiles.gomafiaPhotoUrl})`,
  }
  // Плательщиком может быть и сотрудник/владелец (у них тот же профиль с балансом/
  // тарифом и они есть в разделе «Клиенты»). Раньше фильтр role='client' исключал
  // их из подбора — сотрудника нельзя было выбрать плательщиком. Исключаем только
  // планшеты (role='tablet').
  const baseWhere = and(inArray(profiles.role, ['client', 'staff', 'owner']), isNull(profiles.deletedAt))

  // Сквозной умный поиск (раскладка + транслитерация в обе стороны) по нику/имени/
  // нику в Telegram (byNick — приоритет) и по тегам (byTags, вкл. ник GoMafia).
  const nameCond = profileNameCondition(q)
  const tagCond = profileTagCondition(q)
  const [byNick, byTags] = await Promise.all([
    nameCond ? db.select(playerFields).from(profiles).where(and(baseWhere, nameCond)).limit(20) : Promise.resolve([] as any[]),
    tagCond ? db.select(playerFields).from(profiles).where(and(baseWhere, tagCond)).limit(20) : Promise.resolve([] as any[]),
  ])

  // Дедупликация: byNick приоритетнее, потом byTags без дублей
  const seen = new Set<string>()
  const players = [...byNick, ...byTags].filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).slice(0, 20)

  return c.json({ players })
})

posRouter.get('/spaces', async (c) => {
  const db = c.var.db
  const rows = await db.select().from(spaces).where(eq(spaces.isActive, true))
  return c.json({ spaces: rows })
})

posRouter.get('/players/:id', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const [player] = await db.select({
    id: profiles.id,
    nickname: profiles.nickname,
    clientTier: profiles.clientTier,
    balance: profiles.balance,
    bonusPoints: profiles.bonusPoints,
    photoUrl: sql<string | null>`coalesce(${profiles.photoUrl}, ${profiles.tgPhotoUrl}, ${profiles.gomafiaPhotoUrl})`,
    linkedSpaceId: profiles.linkedSpaceId,
  }).from(profiles).where(eq(profiles.id, c.req.param('id')))
  if (!player) return c.json({ error: 'Not found' }, 404)
  return c.json({ player })
})

// Сводка смены для карточки кассы: открытые чеки, прогноз вечера (Tai), касса.
posRouter.get('/shift-summary', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const shift = await getCurrentShift(db)
  if (!shift) return c.json({ shift: null })
  const [{ expected }, forecast] = await Promise.all([
    getShiftCashBalance(shift.id, db),
    computeShiftForecast(db, shift.id),
  ])
  // ИИ-прогноз вечера (Tai) — только при подписке; открытые чеки и касса доступны всегда.
  const tai = aiAllowed(c.var.club)
  return c.json({
    shift: { id: shift.id, openedAt: shift.openedAt, eveningType: shift.eveningType },
    openChecks: { count: forecast.perCheck.length, total: forecast.currentTotal },
    cashInRegister: expected,
    taiEnabled: tai,
    forecast: tai ? forecast : null,
  })
})

posRouter.get('/checks', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const shift = await getCurrentShift(db)
  if (!shift) return c.json({ checks: [] })
  const reqUser = c.get('user')
  let spaceId = c.req.query('spaceId')
  // tablet видит чеки ТОЛЬКО своей зоны (нельзя подсмотреть чужие через ?spaceId).
  if (reqUser.role === 'tablet') {
    const [me] = await db.select({ spaceId: profiles.linkedSpaceId }).from(profiles).where(eq(profiles.id, reqUser.sub))
    spaceId = me?.spaceId ?? '00000000-0000-0000-0000-000000000000'
  }
  const eventId = c.req.query('eventId')
  const conditions: any[] = [
    eq(checks.shiftId, shift.id),
    inArray(checks.status, ['open']),
  ]
  if (spaceId) conditions.push(eq(checks.spaceId, spaceId))
  if (eventId) conditions.push(eq(checks.linkedEventId, eventId))
  const whereClause = and(...(conditions as [any, ...any[]]))
  const rows = await db
    .select()
    .from(checks)
    .where(whereClause)
    .orderBy(desc(checks.createdAt))

  // Обогащение списка чеков set-based запросами вместо N+1 (этот эндпоинт POS
  // поллит каждые 5с). Раньше на каждый чек шло 3 запроса (счётчик позиций, ник
  // игрока, имя/ставка зоны) → 1 + 3N. Теперь ровно 3 агрегата на весь список:
  // одна группировка count(checkItems) по checkId, одна выборка профилей по
  // playerId-набору, одна выборка зон по spaceId-набору; сшивка через Map.
  // Форма ответа дословно прежняя (itemCount/guestName/spaceName/
  // spaceHourlyRate/hasRental + поля чека из ...ch, включая spaceStartAt/End).
  const checkIds = rows.map(ch => ch.id)
  const playerIds = [...new Set(rows.map(ch => ch.playerId).filter((v): v is string => !!v))]
  const spaceIds = [...new Set(rows.map(ch => ch.spaceId).filter((v): v is string => !!v))]

  // Счётчик позиций по чекам одним group by (пустой набор не запрашиваем).
  const itemCountRows = checkIds.length
    ? await db
        .select({ checkId: checkItems.checkId, count: sql<number>`count(*)::int` })
        .from(checkItems)
        .where(inArray(checkItems.checkId, checkIds))
        .groupBy(checkItems.checkId)
    : []
  const itemCountByCheck = new Map<string, number>()
  for (const r of itemCountRows) itemCountByCheck.set(r.checkId, r.count)

  // Превью позиций для карточек кассы: до 5 названий на чек (по алфавиту —
  // у check_items нет поля порядка, id случайный). Карточка решает, как показать.
  const itemNameRows = checkIds.length
    ? await db
        .select({ checkId: checkItems.checkId, name: inventory.name, quantity: checkItems.quantity })
        .from(checkItems)
        .innerJoin(inventory, eq(inventory.id, checkItems.itemId))
        .where(inArray(checkItems.checkId, checkIds))
        .orderBy(asc(inventory.name))
    : []
  const itemsByCheck = new Map<string, string[]>()
  for (const r of itemNameRows as any[]) {
    const arr = itemsByCheck.get(r.checkId) ?? []
    if (arr.length < 5) arr.push((r.quantity ?? 1) > 1 ? `${r.name} ×${r.quantity}` : String(r.name))
    itemsByCheck.set(r.checkId, arr)
  }

  // Ники привязанных игроков одной выборкой.
  const playerRows = playerIds.length
    ? await db
        .select({
          id: profiles.id,
          nickname: profiles.nickname,
          photoUrl: sql<string | null>`coalesce(${profiles.photoUrl}, ${profiles.tgPhotoUrl}, ${profiles.gomafiaPhotoUrl})`,
        })
        .from(profiles)
        .where(inArray(profiles.id, playerIds))
    : []
  const nicknameByPlayer = new Map<string, string | null>()
  const photoByPlayer = new Map<string, string | null>()
  for (const p of playerRows) { nicknameByPlayer.set(p.id, p.nickname ?? null); photoByPlayer.set(p.id, p.photoUrl ?? null) }

  // Имя + ставка зон одной выборкой.
  const spaceRows = spaceIds.length
    ? await db
        .select({ id: spaces.id, name: spaces.name, hourlyRate: spaces.hourlyRate })
        .from(spaces)
        .where(inArray(spaces.id, spaceIds))
    : []
  const spaceById = new Map<string, { name: string | null; hourlyRate: string | null }>()
  for (const s of spaceRows) spaceById.set(s.id, { name: s.name ?? null, hourlyRate: s.hourlyRate ?? null })

  const enriched = rows.map((ch) => {
    const count = itemCountByCheck.get(ch.id) ?? 0

    let guestName: string | null = null
    let guestPhotoUrl: string | null = null
    if (ch.playerId) {
      guestName = nicknameByPlayer.get(ch.playerId) ?? null
      guestPhotoUrl = photoByPlayer.get(ch.playerId) ?? null
    } else if (ch.guestNames && ch.guestNames.length > 0) {
      guestName = ch.guestNames[0]
    }

    // Аренда: имя зоны + ставка (нужно планшету для live-таймера и карточкам POS)
    let spaceName: string | null = null
    let spaceHourlyRate: string | null = null
    if (ch.spaceId) {
      const sp = spaceById.get(ch.spaceId)
      spaceName = sp?.name ?? null
      spaceHourlyRate = sp?.hourlyRate ?? null
    }

    return { ...ch, itemCount: count, items: itemsByCheck.get(ch.id) ?? [], guestName, guestPhotoUrl, spaceName, spaceHourlyRate, hasRental: !!ch.spaceId }
  })
  return c.json({ checks: enriched })
})

// ПРЕДЧЕКИ: виртуальные карточки для отметившихся «Да»/«Опоздаю» в опросе вечера.
posRouter.get('/prechecks', requireRole('owner', 'staff', 'tablet'), async (c) => {
  // Предчеки — функция Tai: без подписки отдаём пусто (UI деградирует тихо).
  if (!aiAllowed(c.var.club)) return c.json({ prechecks: [] })
  // Планшету предчеки не нужны, но роль допускаем (вернёт по смене/данным клуба).
  const prechecks = await getPrecheckCandidates(c.var.db)
  return c.json({ prechecks })
})

// ПРЕДУГАДАННЫЕ ПОЗИЦИИ: частые заказы клиента-резидента (Tai). Пусто для не-резидентов.
posRouter.get('/checks/:id/suggestions', requireRole('owner', 'staff', 'tablet'), async (c) => {
  if (!aiAllowed(c.var.club)) return c.json({ suggestions: [] }) // функция Tai — по подписке
  const suggestions = await getCheckSuggestions(c.var.db, c.req.param('id'))
  return c.json({ suggestions })
})

posRouter.post('/checks', requireRole('owner', 'staff'), zValidator('json', OpenCheckSchema), async (c) => {
  const db = c.var.db
  const user = c.get('user')
  const body = c.req.valid('json')
  const shift = await getCurrentShift(db)
  if (!shift) return c.json({ error: 'No open shift' }, 400)

  // Проверка лимита гостей события, если чек привязывается к нему
  if (body.linkedEventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, body.linkedEventId))
    if (!ev) return c.json({ error: 'Linked event not found' }, 404)
    if (ev.status === 'cancelled' || ev.status === 'completed') {
      return c.json({ error: 'Невозможно прикрепить чек к завершённому или отменённому событию' }, 400)
    }
    if (ev.maxGuests != null && (ev.attendeesCount ?? 0) >= ev.maxGuests) {
      return c.json({ error: `Превышен лимит гостей мероприятия (${ev.maxGuests})` }, 400)
    }
  }

  // Анти-двойная-бронь: одна активная аренда на зону. Если зона уже занята другим
  // открытым чеком — отклоняем (иначе двойная тарификация/путаница на одном столе).
  // Вторую «вкладку» на тот же стол можно открыть без spaceId (без аренды зоны).
  // ПРИМЕЧАНИЕ: app-level гард закрывает обычный случай; от гонки двух одновременных
  // запросов защитит partial unique index (см. план, follow-up миграция).
  if (body.spaceId) {
    const [occupied] = await db.select({ id: checks.id })
      .from(checks)
      .where(and(eq(checks.spaceId, body.spaceId), eq(checks.status, 'open')))
      .limit(1)
    if (occupied) {
      return c.json({ error: 'Зона уже занята другим открытым чеком' }, 409)
    }
  }

  const [check] = await db.insert(checks).values({
    staffId: user.sub,
    shiftId: shift.id,
    status: 'open',
    ...body,
    // Устанавливаем время начала аренды если передан spaceId
    spaceStartAt: body.spaceId ? new Date() : undefined,
  }).returning()

  // Инкрементим attendeesCount события если чек привязан
  if (body.linkedEventId) {
    await db.update(events)
      .set({ attendeesCount: sql`${events.attendeesCount} + 1` })
      .where(eq(events.id, body.linkedEventId))
  }

  publishEvent(c.var.club?.id, 'check:created', { checkId: check!.id, shiftId: shift.id })

  // Уведомления (fire-and-forget, после операции)
  {
    let guestInfo: string | null = null
    if (check!.playerId) {
      const [p] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, check!.playerId))
      guestInfo = p?.nickname ?? null
    } else if (check!.guestNames && check!.guestNames.length > 0) {
      guestInfo = check!.guestNames[0] ?? null
    }
    void notify({
      type: 'check_opened',
      title: 'Новый чек',
      body: guestInfo ? `Гость: ${guestInfo}` : 'Открыт новый чек',
      meta: { checkId: check!.id },
    }, db).catch(() => {})

    if (check!.spaceId) {
      const [sp] = await db.select({ name: spaces.name }).from(spaces).where(eq(spaces.id, check!.spaceId))
      void notify({
        type: 'rental_started',
        title: 'Аренда зоны',
        body: sp?.name ? `Зона: ${sp.name}` : 'Начата аренда зоны',
        meta: { checkId: check!.id, spaceId: check!.spaceId },
      }, db).catch(() => {})
    }
  }

  return c.json({ check }, 201)
})

// Недавно закрытые чеки — для выбора при оформлении возврата.
// Должен идти ДО /checks/:id, иначе "closed" перехватится как id.
posRouter.get('/checks/closed', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const limit = Math.min(Number(c.req.query('limit') ?? 30) || 30, 50)
  const rows = await db.select().from(checks)
    .where(eq(checks.status, 'closed'))
    .orderBy(desc(checks.closedAt))
    .limit(limit)
  // Set-based обогащение (было N+1: 1 + 2N запросов). Два агрегата на весь список:
  // count(checkItems) group by checkId + ники игроков одной выборкой; сшивка Map.
  const ids = rows.map(ch => ch.id)
  const playerIds = [...new Set(rows.map(ch => ch.playerId).filter((v): v is string => !!v))]
  const countRows = ids.length
    ? await db.select({ checkId: checkItems.checkId, count: sql<number>`count(*)::int` })
        .from(checkItems).where(inArray(checkItems.checkId, ids)).groupBy(checkItems.checkId)
    : []
  const countBy = new Map<string, number>()
  for (const r of countRows) countBy.set(r.checkId, r.count)
  const playerRows = playerIds.length
    ? await db.select({ id: profiles.id, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.id, playerIds))
    : []
  const nickBy = new Map<string, string | null>()
  for (const p of playerRows) nickBy.set(p.id, p.nickname ?? null)
  const enriched = rows.map((ch) => {
    let guestName: string | null = null
    if (ch.playerId) guestName = nickBy.get(ch.playerId) ?? null
    else if (ch.guestNames && ch.guestNames.length > 0) guestName = ch.guestNames[0]
    return { id: ch.id, totalAmount: ch.totalAmount, closedAt: ch.closedAt, paymentMethod: ch.paymentMethod, itemCount: countBy.get(ch.id) ?? 0, guestName }
  })
  return c.json({ checks: enriched })
})

posRouter.get('/checks/:id', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const data = await getCheckWithItems(c.req.param('id'), db)
  if (!data) return c.json({ error: 'Not found' }, 404)
  // IDOR-защита для планшета: планшет видит только чеки СВОЕЙ зоны
  // (linkedSpaceId), а не любой чек по id. owner/staff — без ограничений.
  const user = c.get('user')
  if (user.role === 'tablet') {
    const [me] = await db.select({ spaceId: profiles.linkedSpaceId }).from(profiles).where(eq(profiles.id, user.sub))
    if (!me?.spaceId || data.spaceId !== me.spaceId) return c.json({ error: 'Forbidden' }, 403)
  }
  return c.json({ check: data })
})

// SSE живого обновления чека: позиции добавлены/изменены, оплата прошла, чек
// закрыт. Подписываемся на канал titan:updates и шлём только события ЭТОГО чека.
// Планшет подключается с ?ticket= (см. /auth/sse-ticket). IDOR: только своя зона.
posRouter.get('/checks/:id/events', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const user = c.get('user')
  if (user.role === 'tablet') {
    const [me] = await db.select({ spaceId: profiles.linkedSpaceId }).from(profiles).where(eq(profiles.id, user.sub))
    const [chk] = await db.select({ spaceId: checks.spaceId }).from(checks).where(eq(checks.id, checkId))
    if (!me?.spaceId || chk?.spaceId !== me.spaceId) return c.json({ error: 'Forbidden' }, 403)
  }
  // Канал — пер-клубный (база-на-клуб): подписка и публикация используют один
  // суффикс по c.var.club?.id (на основном домене → 'default').
  const channel = updatesChannel(c.var.club?.id)
  return streamSSE(c, async (stream) => {
    const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
    let closed = false
    await redis.subscribe(channel).catch(() => {})
    redis.on('message', async (_ch, msg) => {
      if (closed) return
      try {
        const parsed = JSON.parse(msg)
        if (parsed?.data?.checkId === checkId) await stream.writeSSE({ data: msg })
      } catch { /* ignore malformed */ }
    })
    const hb = setInterval(() => { if (!closed) stream.writeSSE({ event: 'ping', data: '1' }).catch(() => {}) }, 25_000)
    stream.onAbort(() => { closed = true; clearInterval(hb); redis.unsubscribe(channel).catch(() => {}); redis.disconnect() })
    await new Promise<void>((resolve) => { const t = setInterval(() => { if (closed) { clearInterval(t); resolve() } }, 1000) })
  })
})

posRouter.patch('/checks/:id', requireRole('owner', 'staff'), zValidator('json', z.object({
  spaceId: z.string().uuid().optional(),
  // nullable: null снимает привязанного плательщика (можно исправить ошибочную привязку).
  playerId: z.string().uuid().nullable().optional(),
  guestNames: z.array(z.string()).optional(),
  note: z.string().optional(),
  linkedEventId: z.string().uuid().optional(),
  // Время аренды зоны: ISO-строки. spaceEndAt=null → снова «открытая» аренда
  // (живой счётчик до момента оплаты).
  spaceStartAt: z.string().datetime().optional(),
  spaceEndAt: z.string().datetime().nullable().optional(),
})), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const { spaceStartAt, spaceEndAt, ...rest } = c.req.valid('json')
  const update: Record<string, any> = { ...rest }
  if (spaceStartAt !== undefined) update.spaceStartAt = new Date(spaceStartAt)
  if (spaceEndAt !== undefined) update.spaceEndAt = spaceEndAt === null ? null : new Date(spaceEndAt)
  const [prev] = await db.select({ playerId: checks.playerId, spaceId: checks.spaceId })
    .from(checks).where(eq(checks.id, checkId))
  const [updated] = await db.update(checks).set(update).where(eq(checks.id, checkId)).returning()
  if (!updated) return c.json({ error: 'Not found' }, 404)
  // Смена клиента/зоны влияет на персональные/тировые авто-скидки и итог —
  // пересчитываем сразу, чтобы фронт получил актуальные суммы.
  if ((prev && updated.playerId !== prev.playerId) || (prev && updated.spaceId !== prev.spaceId)) {
    await recalcCheckTotal(checkId, db)
  }
  publishEvent(c.var.club?.id, 'check:updated', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

posRouter.delete('/checks/:id', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const user = c.get('user')
  const check = await db.transaction(async (tx) => {
    const [ch] = await tx
      .update(checks)
      .set({ status: 'cancelled' })
      .where(and(eq(checks.id, checkId), eq(checks.status, 'open')))
      .returning()
    if (!ch) return null

    // Возвращаем списанный сток по всем учётным позициям отменённого чека
    const lines = await tx.select({ itemId: checkItems.itemId, quantity: checkItems.quantity })
      .from(checkItems).where(eq(checkItems.checkId, checkId))
    for (const ln of lines) {
      // Отмена чека возвращает сток (return). requireTracked — только учётные товары.
      await recordMovement(tx, {
        itemId: ln.itemId, type: 'return', delta: ln.quantity, requireTracked: true,
        sourceType: 'check', sourceId: checkId, reason: `Отмена чека ${checkId}`, userId: user.sub,
      })
    }

    // Декрементим attendeesCount, если чек был привязан к событию
    if (ch.linkedEventId) {
      await tx.update(events)
        .set({ attendeesCount: sql`GREATEST(${events.attendeesCount} - 1, 0)` })
        .where(eq(events.id, ch.linkedEventId))

      // Удаление чека мероприятия → возвращаем событие в «Запланировано»
      // (если оно не отменено), сбрасывая привязку к чеку.
      await tx.update(events)
        .set({ checkId: null, status: 'planned' })
        .where(and(eq(events.id, ch.linkedEventId), ne(events.status, 'cancelled')))
    }
    return ch
  })
  if (!check) return c.json({ error: 'Not found or already closed' }, 400)

  publishEvent(c.var.club?.id, 'check:deleted', { checkId: check.id })
  return c.json({ ok: true })
})

posRouter.post('/checks/:id/items', requireRole('owner', 'staff', 'tablet'), zValidator('json', AddItemSchema), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const { itemId, quantity, modifierIds } = c.req.valid('json')
  const checkId = c.req.param('id')
  const user = c.get('user')

  // Атомарная транзакция: проверка чека + блокировка stock + списание + insert позиции
  // Пересечение порога низкого остатка фиксируем внутри транзакции, а само
  // уведомление шлём после коммита (fire-and-forget).
  let lowStock: { name: string; newQty: number } | null = null
  try {
    const { checkItem, lowStock: ls } = await db.transaction(async (tx) =>
      addCheckItemTx(tx, { checkId, itemId, quantity, modifierIds, userId: user.sub })
    )
    lowStock = ls

    if (!checkItem) return c.json({ error: 'Failed to add item' }, 500)

    await recalcCheckTotal(checkId, db)
    publishEvent(c.var.club?.id, 'check:updated', { checkId })

    if (lowStock) {
      const ls: { name: string; newQty: number } = lowStock
      void notify({
        type: 'low_stock',
        title: 'Низкий остаток',
        body: `${ls.name}: осталось ${ls.newQty}`,
        meta: { itemId },
      }, db).catch(() => {})
    }

    const data = await getCheckWithItems(checkId, db)
    return c.json({ check: data }, 201)
  } catch (err: any) {
    if (err.message === 'CHECK_NOT_OPEN') return c.json({ error: 'Check not open' }, 400)
    if (err.message === 'ITEM_NOT_FOUND') return c.json({ error: 'Item not found' }, 404)
    if (err.message === 'INSUFFICIENT_STOCK') return c.json({ error: 'Insufficient stock' }, 400)
    console.error('POST /checks/:id/items error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
})

// ─── Заказы гостя с планшета (pending → подтверждение сотрудником) ────────────

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
})

// POST /checks/:id/orders — гость отправляет заказ. Создаёт pending-заказ (НЕ
// добавляет в чек), шлёт уведомление персоналу (тип client_order). Позиции
// попадут в чек только при подтверждении сотрудником.
posRouter.post('/checks/:id/orders', requireRole('owner', 'staff', 'tablet'), zValidator('json', CreateOrderSchema), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const checkId = c.req.param('id')
  const user = c.get('user')
  const { items } = c.req.valid('json')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  // Снимок состава: имена и цены на момент заказа (для отображения у гостя и в
  // баннере на чеке). При подтверждении цена берётся актуальная из inventory.
  const ids = [...new Set(items.map((i) => i.itemId))]
  const invRows = await db.select({ id: inventory.id, name: inventory.name, price: inventory.price })
    .from(inventory).where(inArray(inventory.id, ids))
  const invById = new Map(invRows.map((r) => [r.id, r]))
  const snapshot = items
    .map((i) => {
      const inv = invById.get(i.itemId)
      return inv ? { itemId: i.itemId, name: inv.name, quantity: i.quantity, price: String(inv.price) } : null
    })
    .filter((x): x is { itemId: string; name: string; quantity: number; price: string } => !!x)
  if (!snapshot.length) return c.json({ error: 'No valid items' }, 400)

  const [order] = await db.insert(pendingOrders).values({
    checkId,
    spaceId: check.spaceId ?? null,
    status: 'pending',
    items: snapshot,
    createdBy: user.sub,
  }).returning()

  let spaceName = ''
  if (check.spaceId) {
    const [sp] = await db.select({ name: spaces.name }).from(spaces).where(eq(spaces.id, check.spaceId))
    spaceName = sp?.name ?? ''
  }
  const sum = snapshot.reduce((s, it) => s + parseFloat(it.price) * it.quantity, 0)
  const lines = snapshot.map((it) => `${it.name} ×${it.quantity}`).join(', ')
  void notify({
    type: 'client_order',
    title: spaceName ? `Новый заказ: ${spaceName}` : 'Новый заказ',
    body: `${lines} — ${sum.toLocaleString('ru')} ₽`,
    meta: { checkId, spaceId: check.spaceId, orderId: order!.id },
  }, db).catch(() => {})

  publishEvent(c.var.club?.id, 'order:created', { checkId, orderId: order!.id })
  return c.json({ order }, 201)
})

// POST /orders/:orderId/confirm — сотрудник подтверждает: позиции добавляются в
// чек (через ту же логику склада). Только owner/staff.
posRouter.post('/orders/:orderId/confirm', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const orderId = c.req.param('orderId')
  const user = c.get('user')
  const [order] = await db.select().from(pendingOrders).where(eq(pendingOrders.id, orderId))
  if (!order) return c.json({ error: 'Not found' }, 404)
  if (order.status !== 'pending') return c.json({ error: 'Already resolved' }, 409)

  const lowStocks: { name: string; newQty: number }[] = []
  try {
    await db.transaction(async (tx) => {
      // Блокировка + идемпотентность: повторно читаем заказ FOR UPDATE.
      const [o] = await tx.select().from(pendingOrders).where(eq(pendingOrders.id, orderId)).for('update')
      if (!o || o.status !== 'pending') throw new Error('ALREADY_RESOLVED')
      for (const it of (o.items ?? [])) {
        const { lowStock } = await addCheckItemTx(tx, { checkId: o.checkId, itemId: it.itemId, quantity: it.quantity, userId: user.sub })
        if (lowStock) lowStocks.push(lowStock)
      }
      await tx.update(pendingOrders).set({ status: 'confirmed', resolvedBy: user.sub, resolvedAt: new Date() }).where(eq(pendingOrders.id, orderId))
    })
  } catch (err: any) {
    if (err.message === 'ALREADY_RESOLVED') return c.json({ error: 'Заказ уже обработан' }, 409)
    if (err.message === 'CHECK_NOT_OPEN') return c.json({ error: 'Чек закрыт' }, 400)
    if (err.message === 'INSUFFICIENT_STOCK') return c.json({ error: 'Недостаточно товара на складе' }, 400)
    if (err.message === 'ITEM_NOT_FOUND') return c.json({ error: 'Позиция не найдена' }, 404)
    console.error('confirm order error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }

  await recalcCheckTotal(order.checkId, db)
  publishEvent(c.var.club?.id, 'check:updated', { checkId: order.checkId })
  publishEvent(c.var.club?.id, 'order:resolved', { checkId: order.checkId, orderId, status: 'confirmed' })
  for (const ls of lowStocks) {
    void notify({ type: 'low_stock', title: 'Низкий остаток', body: `${ls.name}: осталось ${ls.newQty}`, meta: {} }, db).catch(() => {})
  }

  const data = await getCheckWithItems(order.checkId, db)
  return c.json({ check: data }, 200)
})

// POST /orders/:orderId/reject — сотрудник отклоняет заказ. Только owner/staff.
posRouter.post('/orders/:orderId/reject', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const orderId = c.req.param('orderId')
  const user = c.get('user')
  const [order] = await db.select().from(pendingOrders).where(eq(pendingOrders.id, orderId))
  if (!order) return c.json({ error: 'Not found' }, 404)
  if (order.status !== 'pending') return c.json({ error: 'Already resolved' }, 409)
  await db.update(pendingOrders)
    .set({ status: 'rejected', resolvedBy: user.sub, resolvedAt: new Date() })
    .where(and(eq(pendingOrders.id, orderId), eq(pendingOrders.status, 'pending')))
  publishEvent(c.var.club?.id, 'order:resolved', { checkId: order.checkId, orderId, status: 'rejected' })
  return c.json({ ok: true })
})

// POST /orders/:orderId/cancel — гость отменяет СВОЙ ещё не подтверждённый заказ.
posRouter.post('/orders/:orderId/cancel', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const orderId = c.req.param('orderId')
  const [order] = await db.select().from(pendingOrders).where(eq(pendingOrders.id, orderId))
  if (!order) return c.json({ error: 'Not found' }, 404)
  if (order.status !== 'pending') return c.json({ error: 'Already resolved' }, 409)
  const _tf = await tabletZoneForbidden(c, order.checkId); if (_tf) return _tf
  await db.update(pendingOrders)
    .set({ status: 'cancelled', resolvedAt: new Date() })
    .where(and(eq(pendingOrders.id, orderId), eq(pendingOrders.status, 'pending')))
  publishEvent(c.var.club?.id, 'order:resolved', { checkId: order.checkId, orderId, status: 'cancelled' })
  return c.json({ ok: true })
})

// ─── Чат гость (планшет) ↔ персонал (касса) в рамках чека ────────────────────

const ChatSendSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  // Кто пишет. Планшет-киоск ходит под staff-токеном, поэтому отправитель
  // приходит явно из клиента ('guest' с планшета / 'staff' из кассы).
  from: z.enum(['guest', 'staff']).optional(),
})

// GET /checks/:id/chat — история сообщений чека (по возрастанию времени).
posRouter.get('/checks/:id/chat', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const checkId = c.req.param('id')
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.checkId, checkId))
    .orderBy(chatMessages.createdAt)
    .limit(300)
  return c.json({ messages: rows })
})

// POST /checks/:id/chat — отправить сообщение. На сообщение ГОСТЯ шлём уведомление
// персоналу (тип chat_message, настраивается). Живое обновление — через SSE
// (chat:message по titan:updates, фильтр по checkId).
posRouter.post('/checks/:id/chat', requireRole('owner', 'staff', 'tablet'), zValidator('json', ChatSendSchema), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const checkId = c.req.param('id')
  const user = c.get('user')
  const body = c.req.valid('json')
  const from = body.from ?? (user.role === 'tablet' ? 'guest' : 'staff')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  const [msg] = await db.insert(chatMessages).values({
    checkId,
    spaceId: check.spaceId ?? null,
    sender: from,
    senderId: user.sub,
    text: body.text,
  }).returning()

  publishEvent(c.var.club?.id, 'chat:message', { checkId, messageId: msg!.id, sender: from })

  if (from === 'guest') {
    let spaceName = ''
    if (check.spaceId) {
      const [sp] = await db.select({ name: spaces.name }).from(spaces).where(eq(spaces.id, check.spaceId))
      spaceName = sp?.name ?? ''
    }
    void notify({
      type: 'chat_message',
      title: spaceName ? `Сообщение из «${spaceName}»` : 'Сообщение от гостя',
      body: body.text.slice(0, 140),
      meta: { checkId, spaceId: check.spaceId },
    }, db).catch(() => {})
  }

  return c.json({ message: msg }, 201)
})

// POST /checks/:id/chat/read — читающая сторона ({as}) видит чат: помечаем
// прочитанными сообщения ПРОТИВОПОЛОЖНОЙ стороны (read_at = now).
posRouter.post('/checks/:id/chat/read', requireRole('owner', 'staff', 'tablet'), zValidator('json', z.object({ as: z.enum(['guest', 'staff']) })), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const checkId = c.req.param('id')
  const { as } = c.req.valid('json')
  const other = as === 'guest' ? 'staff' : 'guest'
  await db.update(chatMessages)
    .set({ readAt: new Date() })
    .where(and(eq(chatMessages.checkId, checkId), eq(chatMessages.sender, other), isNull(chatMessages.readAt)))
  publishEvent(c.var.club?.id, 'chat:read', { checkId })
  return c.json({ ok: true })
})

posRouter.patch('/checks/:id/items/:itemId', requireRole('owner', 'staff', 'tablet'), zValidator('json', z.object({ quantity: z.number().int().min(0) })), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const checkId = c.req.param('id')
  const itemId = c.req.param('itemId')
  const { quantity } = c.req.valid('json')
  const user = c.get('user')

  try {
    await db.transaction(async (tx) => {
      // Status-guard: правка позиций допустима только на открытом чеке. Иначе
      // правка/удаление позиции на отменённом/закрытом чеке (отмена уже вернула
      // сток, не удалив строки checkItems) вернула бы сток повторно.
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
      if (!check || check.status !== 'open') throw new Error('CHECK_NOT_OPEN')

      const [ci] = await tx.select().from(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      if (!ci) throw new Error('ITEM_NOT_FOUND')
      // delta > 0 → возвращаем на склад; delta < 0 → дополнительно списываем
      const delta = ci.quantity - quantity
      if (delta !== 0) {
        const rows: any = await tx.execute(
          sql`SELECT track_stock as "trackStock", stock_quantity as "stockQuantity" FROM inventory WHERE id = ${ci.itemId} FOR UPDATE`
        )
        const inv: any = rows.rows?.[0] ?? rows[0]
        if (inv?.trackStock) {
          if (delta < 0 && (inv.stockQuantity ?? 0) + delta < 0) throw new Error('INSUFFICIENT_STOCK')
          // delta > 0 → возврат позиции (return); delta < 0 → доп. списание (sale).
          await recordMovement(tx, {
            itemId: ci.itemId, type: delta > 0 ? 'return' : 'sale', delta, clamp: false,
            sourceType: 'check', sourceId: checkId,
            reason: delta > 0 ? `Возврат позиции: чек ${checkId}` : `Продажа: чек ${checkId}`,
            userId: user.sub,
          })
        }
      }
      if (quantity === 0) {
        await tx.delete(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      } else {
        await tx.update(checkItems).set({ quantity }).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      }
    })
  } catch (err: any) {
    if (err.message === 'CHECK_NOT_OPEN') return c.json({ error: 'Check not open' }, 400)
    if (err.message === 'ITEM_NOT_FOUND') return c.json({ error: 'Item not found' }, 404)
    if (err.message === 'INSUFFICIENT_STOCK') return c.json({ error: 'Insufficient stock' }, 400)
    console.error('PATCH /checks/:id/items/:itemId error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }

  await recalcCheckTotal(checkId, db)
  // Realtime: уведомляем планшет клиента (и кассу), что состав чека изменился —
  // иначе изменение/удаление позиции персоналом не отражалось бы на планшете.
  publishEvent(c.var.club?.id, 'check:updated', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

posRouter.delete('/checks/:id/items/:itemId', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const _tf = await tabletZoneForbidden(c, c.req.param('id')); if (_tf) return _tf
  const checkId = c.req.param('id')
  const itemId = c.req.param('itemId')
  const user = c.get('user')
  try {
    await db.transaction(async (tx) => {
      // Status-guard: удаление позиции допустимо только на открытом чеке. Иначе
      // удаление позиции на отменённом/закрытом чеке (отмена уже вернула сток, не
      // удалив строки checkItems) вернуло бы сток повторно.
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
      if (!check || check.status !== 'open') throw new Error('CHECK_NOT_OPEN')

      const [ci] = await tx.select().from(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
      if (!ci) return
      // Возвращаем списанный сток для учётных товаров (return).
      await recordMovement(tx, {
        itemId: ci.itemId, type: 'return', delta: ci.quantity, requireTracked: true,
        sourceType: 'check', sourceId: checkId, reason: `Возврат позиции: чек ${checkId}`, userId: user.sub,
      })
      await tx.delete(checkItems).where(and(eq(checkItems.id, itemId), eq(checkItems.checkId, checkId)))
    })
  } catch (err: any) {
    if (err.message === 'CHECK_NOT_OPEN') return c.json({ error: 'Check not open' }, 400)
    console.error('DELETE /checks/:id/items/:itemId error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
  await recalcCheckTotal(checkId, db)
  // Realtime: удаление позиции персоналом должно сразу отражаться на планшете клиента.
  publishEvent(c.var.club?.id, 'check:updated', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

posRouter.post('/checks/:id/discount', requireRole('owner', 'staff'), zValidator('json', z.object({
  name: z.string(),
  type: z.enum(['percent', 'fixed']),
  value: z.number().positive(),
  target: z.enum(['check', 'item']).default('check'),
  itemId: z.string().uuid().optional(),
}).refine((d) => d.type !== 'percent' || d.value <= 100, {
  // Процентная скидка не может превышать 100%. Фиксированные — без верхней границы.
  message: 'Процентная скидка не может превышать 100%',
  path: ['value'],
})), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const body = c.req.valid('json')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  // Считаем сумму позиций (без скидок) как базу — иначе процентные скидки
  // применённые последовательно дают каскадный эффект (10% + 10% != 19%).
  // Для check-скидок база = позиции + платные модификаторы (та же база, что у
  // computeTotals), чтобы сохранённый amount совпадал со списываемым.
  const items = await db.select().from(checkItems).where(eq(checkItems.checkId, checkId))
  const itemIds = items.map(i => i.id)
  const mods = itemIds.length
    ? await db.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, itemIds))
    : []
  const qtyByItem = new Map(items.map(i => [i.id, i.quantity]))
  const modsSum = mods.reduce((s, m) => s + parseFloat(m.priceAtTime) * (qtyByItem.get(m.checkItemId) ?? 1), 0)
  const itemsSum = items.reduce((s, i) => s + parseFloat(i.priceAtTime) * i.quantity, 0) + modsSum

  // Для itemDiscount базой служит цена позиции, для check — позиции + модификаторы
  let baseAmount = itemsSum
  if (body.target === 'item' && body.itemId) {
    const [targetItem] = items.filter(i => i.id === body.itemId)
    if (targetItem) {
      baseAmount = parseFloat(targetItem.priceAtTime) * targetItem.quantity
    }
  }

  const discountAmount = body.type === 'percent'
    ? baseAmount * (body.value / 100)
    : Math.min(body.value, baseAmount)  // fixed скидка не может быть больше базы

  // Анти-злоупотребление: сотрудник (staff) не может суммарно «обнулить» чек,
  // навесив несколько скидок подряд. Owner — без лимита. Порог настраивается
  // (staff_max_discount_percent, по умолчанию 50% от суммы позиций). Считаем в
  // деньгах: сумма всех уже применённых скидок + новая ≤ cap% × itemsSum.
  const user = c.get('user')
  if (user.role !== 'owner' && itemsSum > 0) {
    const capPct = await getNumericSetting(STAFF_MAX_DISCOUNT_KEY, DEFAULT_STAFF_MAX_DISCOUNT, db)
    const existingRows = await db.select({ amount: checkDiscounts.amount })
      .from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
    const existingSum = existingRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    const maxAllowed = itemsSum * (capPct / 100)
    if (existingSum + discountAmount > maxAllowed + 0.01) {
      return c.json({
        error: capPct <= 0
          ? 'Скидки доступны только владельцу'
          : `Суммарная скидка сотрудника не может превышать ${capPct}% от суммы позиций — обратитесь к владельцу`,
      }, 403)
    }
  }

  await db.insert(checkDiscounts).values({
    checkId,
    name: body.name,
    type: body.type,
    value: String(body.value),
    amount: String(discountAmount),
    target: body.target,
    itemId: body.itemId,
  })

  await recalcCheckTotal(checkId, db)
  publishEvent(c.var.club?.id, 'check:updated', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

// Снятие ЛЮБОЙ применённой скидки с чека. Ручная (discountId IS NULL) — просто
// удаляем строку. Авто/тир (discountId задан) — заносим discountId в исключения
// чека, иначе recalcCheckTotal пересоздал бы её. Снятие постоянно для этого чека.
posRouter.delete('/checks/:id/discount/:discountRowId', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const rowId = c.req.param('discountRowId')
  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  const [row] = await db.select().from(checkDiscounts)
    .where(and(eq(checkDiscounts.id, rowId), eq(checkDiscounts.checkId, checkId)))
  if (!row) return c.json({ error: 'Discount not found' }, 404)

  if (row.discountId) {
    // Авто/тир-скидка: добавляем в исключения чека (дедуп), recalc уберёт её.
    const next = Array.from(new Set([...(check.excludedDiscountIds ?? []), row.discountId]))
    await db.update(checks).set({ excludedDiscountIds: next }).where(eq(checks.id, checkId))
  } else {
    // Ручная скидка: просто удаляем строку.
    await db.delete(checkDiscounts).where(and(eq(checkDiscounts.id, rowId), eq(checkDiscounts.checkId, checkId)))
  }

  await recalcCheckTotal(checkId, db)
  publishEvent(c.var.club?.id, 'check:updated', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

// Вернуть ранее снятую авто/тир-скидку: убираем её discountId из исключений чека,
// recalc применит её заново (если она всё ещё подходит чеку).
posRouter.post('/checks/:id/discount/:discountId/restore', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const discountId = c.req.param('discountId')
  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)
  const next = (check.excludedDiscountIds ?? []).filter(id => id !== discountId)
  await db.update(checks).set({ excludedDiscountIds: next }).where(eq(checks.id, checkId))
  await recalcCheckTotal(checkId, db)
  publishEvent(c.var.club?.id, 'check:updated', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

// Списание на персонал/владельца (100%): закрываем чек бесплатно (итог 0₽).
// Остаток уже списан при добавлении позиций. Товар «продан за 0₽», а в аналитике
// «Персонал» учитывается товарная сумма и себестоимость по staffCompId.
posRouter.post('/checks/:id/comp', requireRole('owner', 'staff'), zValidator('json', z.object({ staffId: z.string().uuid().optional() })), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const user = c.get('user')
  const { staffId } = c.req.valid('json')
  const consumerId = staffId ?? user.sub
  try {
    await db.transaction(async (tx) => {
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
      if (!check || check.status !== 'open') throw new Error('CHECK_NOT_OPEN')
      const [consumer] = await tx.select({ id: profiles.id, role: profiles.role }).from(profiles).where(eq(profiles.id, consumerId))
      if (!consumer || !['owner', 'staff'].includes(consumer.role)) throw new Error('NOT_STAFF')
      // Товарная сумма (до обнуления) — кладём в discountTotal для отображения «−100%».
      const itemRows = await tx.select().from(checkItems).where(eq(checkItems.checkId, checkId))
      const ciIds = itemRows.map(i => i.id)
      const modRows = ciIds.length ? await tx.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ciIds)) : []
      const discRows = await tx.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
      const { total: base } = computeTotals(itemRows, modRows, discRows)
      await tx.update(checks).set({
        status: 'closed',
        closedAt: new Date(),
        staffCompId: consumerId,
        totalAmount: '0',
        discountTotal: String(round2(base)),
        paymentMethod: null,
      }).where(eq(checks.id, checkId))
    })
  } catch (err: any) {
    if (err.message === 'CHECK_NOT_OPEN') return c.json({ error: 'Check not open' }, 400)
    if (err.message === 'NOT_STAFF') return c.json({ error: 'Списание возможно только на сотрудника или владельца' }, 400)
    console.error('POST /checks/:id/comp error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
  publishEvent(c.var.club?.id, 'check:paid', { checkId })
  publishEvent(c.var.club?.id, 'check:closed', { checkId })
  const data = await getCheckWithItems(checkId, db)
  return c.json({ check: data })
})

posRouter.post('/checks/:id/qr', requireRole('owner', 'staff', 'tablet'), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const user = c.get('user')

  const [check] = await db.select().from(checks).where(eq(checks.id, checkId))
  if (!check || check.status !== 'open') return c.json({ error: 'Check not open' }, 400)

  // Планшет может оплачивать ТОЛЬКО чек своего пространства (как и просмотр/заказ).
  if (user.role === 'tablet') {
    const [me] = await db.select({ spaceId: profiles.linkedSpaceId }).from(profiles).where(eq(profiles.id, user.sub))
    if (!me?.spaceId || check.spaceId !== me.spaceId) return c.json({ error: 'Forbidden' }, 403)
  }

  // Опциональная эквайринговая надбавка 8% — её платит КЛИЕНТ поверх товарной
  // суммы (комиссия за перевод). Это НЕ выручка магазина: при подтверждении
  // (см. platega webhook) чек закрывается на БАЗОВУЮ товарную сумму, а надбавка
  // лишь увеличивает сумму к оплате в QR. Эндпоинт раньше тела не читал — читаем
  // его опционально, чтобы не ломать клиентов, шлющих пустой/отсутствующий body.
  const body = await c.req.json().catch(() => ({})) as { surcharge8?: boolean; tip?: number } | null
  // Гость (планшет) платит ровно сумму чека, без эквайринговой надбавки.
  const surcharge8 = user.role !== 'tablet' && body?.surcharge8 === true

  // Сумма QR считается на СЕРВЕРЕ из чека (позиции−скидки+аренда+база события),
  // а НЕ берётся с клиента — иначе можно выставить QR на произвольную сумму.
  // Сначала пересчитываем авто/тир-скидки, затем берём авторитетный итог.
  await recalcCheckTotal(checkId, db)
  const baseAmount = await computeCheckGrandTotal(db, check)
  if (baseAmount < 0.01) return c.json({ error: 'Сумма чека равна нулю' }, 400)

  // Чаевые: гость добровольно добавляет их ПОВЕРХ суммы чека. В отличие от базы,
  // их МОЖНО взять с клиента — это его собственные деньги (риска «выставить QR на
  // произвольную сумму в свою пользу» нет). Ограничиваем разумным потолком от
  // случайного ввода. Чаевые НЕ выручка: webhook закроет чек на baseAmount, а
  // факт чаевых зафиксирует отдельно в checks.tip_amount.
  const rawTip = Number(body?.tip)
  const tip = Number.isFinite(rawTip) && rawTip > 0
    ? Math.min(round2(rawTip), round2(baseAmount * 3) + 100000)
    : 0
  // amount — сумма к оплате в QR (товары + чаевые, ×1.08 при надбавке). baseAmount —
  // товарная сумма, на которую webhook закроет чек.
  const beforeSurcharge = round2(baseAmount + tip)
  const amount = surcharge8 ? round2(beforeSurcharge * 1.08) : beforeSurcharge

  // Сохраняем запрошенные чаевые и предварительную эквайринговую надбавку на чеке —
  // webhook по ним валидирует увеличенную сумму к оплате и зафиксирует факт. Надбавка
  // (8%, её доплачивает клиент) хранится, чтобы в отчётах эквайринг не списывался как
  // потеря владельца. Перезаписываем всегда (повторная генерация QR с другими
  // параметрами корректно обновляет значения).
  await db.update(checks).set({
    tipAmount: String(tip),
    acquiringSurcharge: surcharge8 ? String(round2(beforeSurcharge * 0.08)) : '0',
  }).where(eq(checks.id, checkId))

  // ── Диспатч по активному СБП-эквайеру. 'platega' (дефолт) — существующий путь
  // ниже без изменений; иначе создаём платёж через адаптер провайдера. ──
  const activeProvider = await getActiveSbpProvider(db)
  if (activeProvider !== 'platega') {
    const provider = getProvider(activeProvider)
    if (!provider) return c.json({ error: 'Неизвестный эквайер' }, 503)
    const creds = await resolveCreds(db, provider)
    if (provider.credKeys.some((k) => !creds[k])) {
      return c.json({ error: `${provider.label}: не заданы ключи` }, 503)
    }
    const origin = new URL(c.req.url).origin
    // Фискальный чек 54-ФЗ: только если провайдер умеет слать его сам (ЮKassa) и
    // фискализация включена. Сумма чека = СПИСЫВАЕМАЯ (amount, с чаевыми/надбавкой) —
    // у ЮKassa итог чека обязан совпадать с суммой платежа, иначе платёж отклонят.
    const receipt = provider.supportsReceipt ? await buildCheckReceipt(db, check, amount).catch(() => undefined) : undefined
    let result
    try {
      result = await provider.createSbpPayment({
        creds,
        amount,
        checkId,
        description: `Titan POS чек ${checkId.slice(0, 8)}`,
        notificationUrl: `${origin}/api/pay/${provider.id}/webhook`,
        returnUrl: origin,
        receipt,
        test: await getPaymentTestMode(db),
      })
    } catch (err) {
      console.error(`[pay:${provider.id}] create error:`, err)
      return c.json({ error: 'Ошибка создания платежа' }, 502)
    }
    // Рендерим СБП-payload (или ссылку на платёжную страницу) как QR-картинку.
    let qrDataUrl: string | undefined
    const payload = result.qrString ?? result.redirectUrl
    if (payload) {
      const QRCode = await import('qrcode')
      const svgString = await QRCode.toString(payload, { type: 'svg', width: 280, margin: 1 })
      qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`
    }
    return c.json({
      transactionId: result.transactionId,
      qrDataUrl,
      redirectUrl: result.redirectUrl,
      chargedAmount: amount,
      baseAmount,
      surcharge8,
      tip,
    })
  }

  // ── Platega (дефолт) — креды пер-клубные (integrations) с фолбэком на env. ──
  const merchantId = (await getClubIntegration(db, 'platega_merchant_id')) ?? process.env['PLATEGA_MERCHANT_ID']
  const secret = (await getClubIntegration(db, 'platega_secret')) ?? process.env['PLATEGA_SECRET']
  if (!merchantId || !secret) return c.json({ error: 'Platega не настроен' }, 503)

  // payload для вебхука Platega. Вебхук приходит на фиксированный URL основного
  // домена (без клуб-поддомена), поэтому целевой клуб определяется ИЗ payload.
  // На клуб-поддомене — 'club:<clubId>:<checkId>'; на основном домене (club=null,
  // инстанс оператора) — голый checkId (вебхук фолбэкнется на синглтон).
  const clubId = c.var.club?.id
  const plategaPayload = clubId ? `club:${clubId}:${checkId}` : checkId

  const createRes = await fetch('https://app.platega.io/transaction/process', {
    method: 'POST',
    headers: { 'X-MerchantId': merchantId, 'X-Secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 2,
      paymentDetails: { amount, currency: 'RUB' },
      description: `Titan POS чек ${checkId.slice(0, 8)}`,
      payload: plategaPayload,
    }),
  })

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '')
    console.error('Platega create error:', createRes.status, errText)
    return c.json({ error: 'Ошибка создания платежа' }, 502)
  }

  const createData = await createRes.json() as Record<string, unknown>
  const transactionId = createData['transactionId'] as string
  const redirectUrl = createData['redirect'] as string | undefined

  // GET /h2h/{id} — специальный endpoint Platega для получения СБП QR
  let qrString: string | undefined
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 700))
    const h2hRes = await fetch(`https://app.platega.io/h2h/${transactionId}`, {
      headers: { 'X-MerchantId': merchantId, 'X-Secret': secret },
    })
    if (!h2hRes.ok) {
      console.error('Platega h2h error:', h2hRes.status, await h2hRes.text().catch(() => ''))
      return c.json({ error: 'Ошибка получения QR от Platega', redirectUrl, transactionId }, 502)
    }
    const h2hData = await h2hRes.json() as Record<string, unknown>
    qrString = h2hData['qr'] as string | undefined
    if (qrString) break
  }

  if (!qrString) return c.json({ error: 'Platega не вернул QR для СБП', redirectUrl, transactionId }, 502)

  // Рендерим СБП-строку как QR-изображение
  const QRCode = await import('qrcode')
  const svgString = await QRCode.toString(qrString, { type: 'svg', width: 280, margin: 1 })
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`

  return c.json({
    transactionId,
    qrDataUrl,
    expiresIn: createData['expiresIn'] as string | undefined,
    // chargedAmount — сумма в QR (с надбавкой 8%, если запрошена); baseAmount —
    // товарная сумма, на которую закроется чек. surcharge8 — была ли надбавка.
    chargedAmount: amount,
    baseAmount,
    surcharge8,
    tip,
  })
})

posRouter.get('/checks/:id/qr/:transactionId/status', requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const transactionId = c.req.param('transactionId')

  // Диспатч по активному эквайеру. Нормализуем к строкам Platega (CONFIRMED/
  // CANCELED/NEW), которые уже понимает фронт CheckDetailView.
  const activeProvider = await getActiveSbpProvider(db)
  if (activeProvider !== 'platega') {
    const provider = getProvider(activeProvider)
    if (!provider) return c.json({ error: 'Неизвестный эквайер' }, 503)
    const creds = await resolveCreds(db, provider)
    const st = await provider.fetchStatus({ creds, transactionId }).catch(() => null)
    const status = st?.status === 'confirmed' ? 'CONFIRMED' : st?.status === 'failed' ? 'CANCELED' : 'NEW'
    return c.json({ status })
  }

  // ── Platega ── креды пер-клубные (integrations) с фолбэком на env.
  const merchantId = (await getClubIntegration(db, 'platega_merchant_id')) ?? process.env['PLATEGA_MERCHANT_ID']
  const secret = (await getClubIntegration(db, 'platega_secret')) ?? process.env['PLATEGA_SECRET']
  if (!merchantId || !secret) return c.json({ error: 'Platega не настроен' }, 503)

  const res = await fetch(`https://app.platega.io/transaction/${transactionId}`, {
    headers: { 'X-MerchantId': merchantId, 'X-Secret': secret },
  })
  if (!res.ok) return c.json({ error: 'Platega error' }, 502)
  const data = await res.json() as Record<string, unknown>

  return c.json({ status: data['status'] as string, expiresIn: data['expiresIn'] as string | undefined })
})

posRouter.post('/checks/:id/pay', requireRole('owner', 'staff'), zValidator('json', PaySchema), async (c) => {
  const db = c.var.db
  const checkId = c.req.param('id')
  const user = c.get('user')
  const body = c.req.valid('json')

  try {
    // Вся денежная мутация — в одной транзакции. Любой throw откатывает всё.
    // Строки чека / клиента / сертификата блокируются FOR UPDATE против гонок.
    const closed = await db.transaction(async (tx) => {
      const [check] = await tx.select().from(checks).where(eq(checks.id, checkId)).for('update')
      if (!check || check.status !== 'open') throw new Error('CHECK_NOT_OPEN')

      // Авторитетная сумма: пересчитываем из позиций+модификаторов−скидок в транзакции
      // (не доверяем totalAmount — он мог устареть и не включать модификаторы).
      // Сначала пересобираем авто-скидки от текущих позиций (на случай, если
      // позиции менялись без recalc) — иначе оплата прошла бы без авто-скидки.
      await applyAutoDiscounts(tx, checkId)
      const itemRows = await tx.select().from(checkItems).where(eq(checkItems.checkId, checkId))
      const ciIds = itemRows.map(i => i.id)
      const modRowsForTotal = ciIds.length
        ? await tx.select().from(checkItemModifiers).where(inArray(checkItemModifiers.checkItemId, ciIds))
        : []
      const discRows = await tx.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId))
      const { total: itemsTotal } = computeTotals(itemRows, modRowsForTotal, discRows)

      // Аренда зоны («живой счётчик») считается на сервере на момент оплаты
      // тем же правилом, что и на фронте: ceil(минуты/60) × ставка.
      // Конец аренды: заданный вручную spaceEndAt либо момент оплаты (живой счётчик).
      let rental = 0
      if (check.spaceId && check.spaceStartAt) {
        const [space] = await tx.select({ hourlyRate: spaces.hourlyRate }).from(spaces).where(eq(spaces.id, check.spaceId))
        rental = computeRental(check.spaceStartAt, check.spaceEndAt, space?.hourlyRate, Date.now())
      }
      // База события (фикс/ручная сумма мероприятия) — слагаемое итога к оплате.
      const eventBase = parseFloat(check.eventBaseAmount ?? '0') || 0
      // Списание на персонал — итог 0₽ (закрывается бесплатно, остаток уже списан).
      const total = check.staffCompId ? 0 : round2(itemsTotal + rental + eventBase)
      // Предоплаченная часть (напр. взнос участия миникапа): пробивается ПОЛНЫЙ total,
      // но в этой сессии кассир собирает только остаток `due`. Предоплата затем войдёт
      // в записанные платежи как наличные (cashRequired = total − безнал), т.е. выручка
      // считается один раз по полному total, а на экране оплаты виден лишь остаток.
      const prepaid = check.staffCompId ? 0 : Math.min(parseFloat(check.prepaidAmount ?? '0') || 0, total)
      const due = round2(total - prepaid)

      // Суммы по способам оплаты
      const sumBy = (m: string) => body.payments.filter(p => p.method === m).reduce((s, p) => s + p.amount, 0)
      const sentPaid = round2(body.payments.reduce((s, p) => s + p.amount, 0))
      const depositSent = round2(sumBy('deposit'))
      const bonusSent = round2(sumBy('bonus'))
      const certSent = round2(sumBy('certificate'))
      const debtAmount = round2(sumBy('debt'))

      // Недоплата (в сессии собираем остаток за вычетом предоплаты).
      if (sentPaid < due - 0.01) throw new Error('UNDERPAYMENT')
      // Безналичные тендеры (всё кроме наличных) не могут превышать остаток к оплате —
      // защита от «отрицательной сдачи» и переоплаты бонусом/депозитом/картой.
      const nonCash = body.payments.filter(p => p.method !== 'cash')
      const nonCashSum = round2(nonCash.reduce((s, p) => s + p.amount, 0))
      if (nonCashSum > due + 0.01) throw new Error('OVERPAYMENT')
      // Бонус-тендер обязан совпадать с bonusAmount (иначе «оплата» бонусом без списания).
      if (Math.abs((body.bonusAmount ?? 0) - bonusSent) > 0.01) throw new Error('BONUS_MISMATCH')
      // Бонусы списываются только с клиента: без playerId списание не произойдёт
      // (ниже на :643), а тендер закроет чек → «бесплатная» оплата. Запрещаем.
      if (bonusSent > 0.005 && !body.playerId) throw new Error('BONUS_NO_PLAYER')

      // Лимит оплаты бонусами: owner задаёт bonus_max_spend (% от суммы чека) в
      // настройках. Бонус-тендер не может превышать этот процент авторитетного total.
      if (bonusSent > 0.005) {
        const [maxSpendRow] = await tx.select().from(appSettings).where(eq(appSettings.key, 'bonus_max_spend'))
        const parsed = parseFloat(maxSpendRow?.value ?? '')
        const maxSpendPct = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 50
        const maxBonus = round2(total * (maxSpendPct / 100))
        if (bonusSent > maxBonus + 0.01) throw new Error('BONUS_LIMIT')
      }

      // Validate + lock certificate
      let cert = null
      if (body.certificateCode) {
        const [c2] = await tx.select().from(certificates)
          .where(eq(certificates.code, body.certificateCode)).for('update')
        if (!c2 || c2.isUsed || parseFloat(c2.balance) < 0.01) throw new Error('INVALID_CERT')
        if (certSent > parseFloat(c2.balance) + 0.01) throw new Error('CERT_INSUFFICIENT')
        cert = c2
      } else if (certSent > 0.005) {
        throw new Error('INVALID_CERT')
      }

      // Lock player row once (депозит, долг, списание и начисление бонусов)
      let player = null
      if (body.playerId) {
        const [p] = await tx.select().from(profiles).where(eq(profiles.id, body.playerId)).for('update')
        player = p ?? null
      }

      // Оплата депозитом: списание предоплаченного баланса клиента (не уходит в минус)
      if (depositSent > 0.005) {
        if (!body.playerId || !player) throw new Error('DEPOSIT_NO_PLAYER')
        const bal = parseFloat(player.balance)
        if (bal + 0.01 < depositSent) throw new Error('INSUFFICIENT_DEPOSIT')
        const nb = round2(bal - depositSent)
        await tx.update(profiles).set({ balance: String(nb) }).where(eq(profiles.id, body.playerId))
        await tx.insert(transactions).values({
          type: 'withdrawal',
          amount: String(depositSent),
          checkId,
          playerId: body.playerId,
          createdBy: user.sub,
          description: 'Оплата депозитом за чек',
        })
        player = { ...player, balance: String(nb) }
      }

      // Оплата в долг: проверка лимита + списание баланса клиента в минус
      if (debtAmount > 0) {
        if (!body.playerId || !player) throw new Error('DEBT_NO_PLAYER')
        // Лимит долга: max_client_debt > 0 → ограничение; 0/пусто → без лимита.
        const maxDebtRow = await tx.select().from(appSettings).where(eq(appSettings.key, 'max_client_debt'))
        const maxDebt = parseFloat(maxDebtRow[0]?.value ?? '0') || 0
        const newBalance = round2(parseFloat(player.balance) - debtAmount)
        if (maxDebt > 0 && newBalance < -maxDebt) throw new Error('DEBT_LIMIT')
        await tx.update(profiles).set({ balance: String(newBalance) }).where(eq(profiles.id, body.playerId))
        await tx.insert(transactions).values({
          type: 'withdrawal',
          amount: String(debtAmount),
          checkId,
          playerId: body.playerId,
          createdBy: user.sub,
          description: 'Долг за чек',
        })
        player = { ...player, balance: String(newBalance) }
      }

      // Списание бонусов
      if (body.bonusAmount && body.bonusAmount > 0 && body.playerId) {
        if (!player || parseFloat(player.bonusPoints) < body.bonusAmount) throw new Error('INSUFFICIENT_BONUS')
        const newBonus = round2(parseFloat(player.bonusPoints) - body.bonusAmount)
        await tx.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, body.playerId))
        await tx.insert(bonusHistory).values({
          profileId: body.playerId,
          amount: String(-body.bonusAmount),
          balanceAfter: String(newBonus),
          reason: 'Списание за чек',
        })
        // Списываем из лотов (FIFO по сроку сгорания) — параллельный учёт для expiry.
        await spendBonusLots(tx, body.playerId, body.bonusAmount)
        player = { ...player, bonusPoints: String(newBonus) }
      }

      // Нормализуем платежи: записанная сумма == total (наличные = total − безнал),
      // чтобы переплата/сдача не попадала в выручку и кассу.
      const cashRequired = round2(Math.max(0, total - nonCashSum))
      const normalizedPayments: { method: string; amount: number }[] = nonCash.map(p => ({ method: p.method, amount: round2(p.amount) }))
      if (cashRequired > 0.005) normalizedPayments.push({ method: 'cash', amount: cashRequired })
      if (normalizedPayments.length === 0) normalizedPayments.push({ method: 'cash', amount: total })

      await tx.insert(checkPayments).values(normalizedPayments.map(p => ({
        checkId,
        method: p.method as any,
        amount: String(p.amount),
      })))

      // Списание сертификата
      if (cert) {
        const newCertBalance = round2(parseFloat(cert.balance) - certSent)
        await tx.update(certificates).set({
          balance: String(Math.max(0, newCertBalance)),
          isUsed: newCertBalance <= 0.005,
          // Кто погасил: клиент чека, иначе сотрудник, закрывший чек (user.sub —
          // валидный profile id), чтобы не оставлять usedBy пустым при анонимном чеке.
          usedBy: body.playerId ?? user.sub,
          usedAt: new Date(),
        }).where(eq(certificates.id, cert.id))
      }

      // Финансовая проводка оплаты (на полную сумму, включая аренду)
      await tx.insert(transactions).values({
        type: 'payment',
        amount: String(total),
        checkId,
        playerId: body.playerId ?? null,
        createdBy: user.sub,
        description: 'Оплата чека',
      })

      // Закрытие чека
      const primaryMethod = normalizedPayments.reduce((a, b) => a.amount >= b.amount ? a : b)
      const [closedCheck] = await tx.update(checks).set({
        status: 'closed',
        paymentMethod: primaryMethod.method as any,
        totalAmount: String(total),
        // Закрытие из кассы (нал/карта/бонусы) — QR-чаевые не оплачивались;
        // сбрасываем возможный «запрошенный» хвост от генерации QR.
        tipAmount: '0',
        bonusUsed: String(body.bonusAmount ?? 0),
        certificateId: cert?.id ?? null,
        certificateUsed: cert ? String(certSent) : '0',
        playerId: body.playerId ?? null,
        note: body.note ?? null,
        spaceEndAt: check.spaceEndAt ?? (check.spaceId ? new Date() : undefined),
        closedAt: new Date(),
      }).where(eq(checks.id, checkId)).returning()

      // Авто-завершение мероприятия: чек события оплачен и закрыт → событие
      // переходит в «Завершено» (ручной кнопки «Завершить» нет — финал только здесь).
      let completedEvent: { id: string; title: string | null } | null = null
      if (check.linkedEventId) {
        const [evRow] = await tx.update(events).set({ status: 'completed' })
          .where(and(eq(events.id, check.linkedEventId), ne(events.status, 'cancelled')))
          .returning({ id: events.id, title: events.title })
        if (evRow) completedEvent = evRow
      }

      // Начисление бонусов с учётом настроек app_settings (на полную сумму, включая аренду)
      let bonusAwarded = 0
      if (body.playerId && player) {
        const settingsRows = await tx.select().from(appSettings)
          .where(inArray(appSettings.key, ['bonus_enabled', 'bonus_accrual_rate', 'bonus_min_purchase', 'bonus_accrual_on_debt']))
        const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]))

        const bonusEnabled = settings['bonus_enabled'] !== 'false'
        const accrualRate = parseFloat(settings['bonus_accrual_rate'] ?? '5') / 100
        const minPurchase = parseFloat(settings['bonus_min_purchase'] ?? '0')
        const accrualOnDebt = settings['bonus_accrual_on_debt'] === 'true'

        if (bonusEnabled && total >= minPurchase && !(debtAmount > 0 && !accrualOnDebt)) {
          const bonusEarned = Math.floor(total * accrualRate)
          bonusAwarded = bonusEarned
          if (bonusEarned > 0) {
            const newBonus = round2(parseFloat(player.bonusPoints) + bonusEarned)
            await tx.update(profiles).set({ bonusPoints: String(newBonus) }).where(eq(profiles.id, body.playerId))
            await tx.insert(bonusHistory).values({
              profileId: body.playerId,
              amount: String(bonusEarned),
              balanceAfter: String(newBonus),
              reason: `${Math.round(accrualRate * 100)}% начисление за чек`,
            })
            // Лот для сгорания бонусов: expiresAt = now + bonus_expiry_days (либо null).
            const expiryDays = await getBonusExpiryDays(tx)
            await accrueBonusLot(tx, body.playerId, bonusEarned, expiryDays)
          }
        }
      }

      return { closedCheck, certSent, debtAmount, playerId: body.playerId ?? null, completedEvent, bonusAwarded }
    })

    const closedCheck = closed?.closedCheck

    publishEvent(c.var.club?.id, 'check:paid', { checkId })
    publishEvent(c.var.club?.id, 'check:closed', { checkId })

    // Обучение предугадывания (Tai): что предлагали резиденту, но он к оплате не
    // добавил → понижаем такие позиции в будущем. Fire-and-forget.
    void learnFromCheckClose(db, checkId).catch(() => {})

    // Уведомления вне денежной транзакции (fire-and-forget, не блокируют ответ).
    const paidTotal = parseFloat(String(closedCheck?.totalAmount ?? 0)) || 0
    // ОДНО сводное уведомление о закрытии чека вместо 3–4 (оплата/крупный/сертификат/
    // долг несли близкий смысл и раздували ленту). Порог «крупного» — настраиваемый.
    const largeThreshold = await getNumericSetting(LARGE_CHECK_KEY, DEFAULT_LARGE_CHECK, db)
    const isLargeCheck = paidTotal >= largeThreshold
    const checkExtras: string[] = []
    if ((closed?.certSent ?? 0) > 0.005) checkExtras.push(`сертификат ${Number(closed!.certSent).toLocaleString('ru')} ₽`)
    if ((closed?.debtAmount ?? 0) > 0) checkExtras.push(`в долг ${Number(closed!.debtAmount).toLocaleString('ru')} ₽`)
    void notify({
      type: isLargeCheck ? 'large_check' : 'check_paid',
      title: isLargeCheck ? 'Крупный чек оплачен' : 'Чек оплачен',
      body: `${paidTotal.toLocaleString('ru')} ₽${checkExtras.length ? ' · ' + checkExtras.join(' · ') : ''}`,
      meta: { checkId, playerId: closed?.playerId ?? undefined },
    }, db).catch(() => {})
    // Личные уведомления клиенту в Wallet-бот (о ЕГО событиях).
    if (closed?.playerId) {
      const pid = closed.playerId
      if ((closed.bonusAwarded ?? 0) > 0) {
        void notifyClient(pid, `⭐ Начислено ${Number(closed.bonusAwarded).toLocaleString('ru')} бонусов за покупку на ${paidTotal.toLocaleString('ru')} ₽`, db)
      }
      if ((closed.debtAmount ?? 0) > 0) {
        void notifyClient(pid, `⚠️ Оплата в долг: ${Number(closed.debtAmount).toLocaleString('ru')} ₽`, db)
      }
      // Авто-повышение Новичок→Резидент после 10 посещений (бизнес-дней с чеком);
      // maybePromoteToResident повышает ТОЛЬКО статус newbie, остальные не трогает.
      void maybePromoteToResident(pid, db).then(r => {
        if (r.promoted) void notifyClient(pid, '🎉 Поздравляем! Вы стали Резидентом Titan — спасибо, что с нами!', db)
      }).catch(() => {})
    }
    if (closed?.completedEvent) {
      void notify({
        type: 'event_completed',
        title: 'Мероприятие завершено',
        body: closed.completedEvent.title ?? 'Мероприятие завершено',
        meta: { eventId: closed.completedEvent.id, checkId },
      }, db).catch(() => {})
    }

    return c.json({ check: closedCheck })
  } catch (err: any) {
    const map: Record<string, [string, 400]> = {
      CHECK_NOT_OPEN: ['Check not open', 400],
      UNDERPAYMENT: ['Недостаточная сумма оплаты', 400],
      OVERPAYMENT: ['Сумма безналичной оплаты превышает чек', 400],
      INVALID_CERT: ['Invalid or used certificate', 400],
      CERT_INSUFFICIENT: ['Недостаточно средств на сертификате', 400],
      DEBT_NO_PLAYER: ['Для оплаты в долг нужно выбрать клиента', 400],
      DEBT_LIMIT: ['Превышен лимит долга клиента', 400],
      DEPOSIT_NO_PLAYER: ['Для оплаты депозитом нужно выбрать клиента', 400],
      INSUFFICIENT_DEPOSIT: ['Недостаточно средств на депозите клиента', 400],
      INSUFFICIENT_BONUS: ['Недостаточно бонусных баллов', 400],
      BONUS_MISMATCH: ['Несовпадение суммы бонусов', 400],
      BONUS_NO_PLAYER: ['Для списания бонусов нужно выбрать клиента', 400],
      BONUS_LIMIT: ['Сумма бонусов превышает допустимый лимит оплаты', 400],
    }
    const mapped = err?.message ? map[err.message] : undefined
    if (mapped) return c.json({ error: mapped[0] }, mapped[1])
    console.error('POST /checks/:id/pay error:', err)
    return c.json({ error: 'Internal error' }, 500)
  }
})
