import { checks, checkItems, inventory, profiles, tariffs, appSettings, eq, and, ne, isNotNull, sql, type Database } from '@titan/database'

// ─────────────────────────────────────────────────────────────────────────────
// Предугадывание позиций в чеке (для РЕЗИДЕНТОВ) на основе истории заказов клиента.
//
// Скоринг по нескольким параметрам:
//   visitRate   — доля прошлых визитов (закрытых чеков), где была эта позиция;
//   recency     — буст за недавнюю покупку (≤14 дн ×1.25, ≤30 ×1.05, иначе ×0.8);
//   qtyBoost    — лёгкий буст за объём (часто берут помногу);
//   dismissPenalty — обучение: сколько раз позицию ПРЕДЛАГАЛИ, но к оплате не
//                    добавили (app_settings pred_dismissed). Понижает выдачу.
// Порог: показываем только реально частые (effRate ≥ 0.34, т.е. ~каждый 3-й визит).
// Исключаем: уже добавленные позиции, backing-позиции тарифов (статусы),
// неактивные товары. Выдаём топ-3.
// ─────────────────────────────────────────────────────────────────────────────

const PRED_DISMISSED_KEY = 'pred_dismissed'
const MIN_SCORE = 0.34
const MAX_SUGGESTIONS = 3

export interface Suggestion { itemId: string; name: string; price: string; score: number }

type Dismissed = Record<string, Record<string, number>> // playerId → itemId → count

async function readDismissed(db: Database): Promise<Dismissed> {
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, PRED_DISMISSED_KEY))
    if (!row?.value) return {}
    const p = JSON.parse(row.value)
    return p && typeof p === 'object' ? p : {}
  } catch { return {} }
}
async function writeDismissed(db: Database, d: Dismissed): Promise<void> {
  const value = JSON.stringify(d)
  const [ex] = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, PRED_DISMISSED_KEY))
  if (ex) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, PRED_DISMISSED_KEY))
  else await db.insert(appSettings).values({ key: PRED_DISMISSED_KEY, value })
}

// Базовый расчёт кандидатов для игрока: история закрытых чеков (опц. без одного
// чека — для обучения «до оплаты»). Возвращает все позиции со скором, отсортированы.
async function scorePlayerItems(
  db: Database, playerId: string, excludeCheckId: string | null,
): Promise<{ suggestions: Suggestion[]; dismissed: Record<string, number> }> {
  const notThisCheck = excludeCheckId ? ne(checks.id, excludeCheckId) : undefined
  // Сколько всего закрытых визитов у игрока.
  const [tot] = await db.select({ n: sql<number>`count(*)::int` }).from(checks)
    .where(and(eq(checks.playerId, playerId), eq(checks.status, 'closed'), notThisCheck))
  const totalChecks = tot?.n ?? 0
  if (totalChecks < 2) return { suggestions: [], dismissed: {} } // мало истории — не угадываем

  const rows = await db.select({
    itemId: checkItems.itemId,
    name: sql<string>`max(${inventory.name})`,
    price: sql<string>`max(${inventory.price})`,
    visits: sql<number>`count(distinct ${checks.id})::int`,
    qty: sql<number>`sum(${checkItems.quantity})::int`,
    lastAt: sql<string>`max(${checks.createdAt})::text`,
  }).from(checkItems)
    .innerJoin(checks, and(eq(checks.id, checkItems.checkId), eq(checks.playerId, playerId), eq(checks.status, 'closed'), ...(notThisCheck ? [notThisCheck] : [])))
    .innerJoin(inventory, and(eq(inventory.id, checkItems.itemId), eq(inventory.isActive, true)))
    .groupBy(checkItems.itemId)

  // Backing-позиции тарифов (статусы) — не предлагаем.
  const trows = await db.select({ itemId: tariffs.itemId }).from(tariffs).where(isNotNull(tariffs.itemId))
  const tariffItemIds = new Set(trows.map((t) => t.itemId).filter(Boolean) as string[])

  const dismissedAll = await readDismissed(db)
  const dismissed = dismissedAll[playerId] ?? {}

  const now = Date.now()
  const suggestions: Suggestion[] = []
  for (const r of rows) {
    if (!r.itemId || tariffItemIds.has(r.itemId)) continue
    const visitRate = r.visits / totalChecks
    const days = r.lastAt ? (now - Date.parse(r.lastAt)) / 86400000 : 999
    const recency = days <= 14 ? 1.25 : days <= 30 ? 1.05 : 0.8
    const qtyBoost = 1 + Math.min(0.15, (r.qty / Math.max(1, r.visits) - 1) * 0.1) // берут помногу
    const penalty = Math.min(4, dismissed[r.itemId] ?? 0) * 0.12
    const score = visitRate * recency * qtyBoost - penalty
    if (score >= MIN_SCORE) suggestions.push({ itemId: r.itemId, name: r.name, price: r.price, score })
  }
  suggestions.sort((a, b) => b.score - a.score)
  return { suggestions, dismissed }
}

// Текущие предложения для ОТКРЫТОГО чека резидента (исключая уже добавленные).
export async function getCheckSuggestions(db: Database, checkId: string): Promise<Suggestion[]> {
  const [check] = await db.select({ playerId: checks.playerId, status: checks.status }).from(checks).where(eq(checks.id, checkId)).limit(1)
  if (!check?.playerId || check.status !== 'open') return []
  const [p] = await db.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, check.playerId)).limit(1)
  if (p?.tier !== 'resident') return [] // фича — только для резидентов

  const { suggestions } = await scorePlayerItems(db, check.playerId, checkId)
  // Исключаем то, что уже в чеке.
  const inCheck = await db.select({ itemId: checkItems.itemId }).from(checkItems).where(eq(checkItems.checkId, checkId))
  const have = new Set(inCheck.map((i) => i.itemId))
  return suggestions.filter((s) => !have.has(s.itemId)).slice(0, MAX_SUGGESTIONS)
}

// Обучение при оплате: что предлагали, но клиент не добавил → dismissed++ (бракуем);
// что добавил из предложенного — ослабляем штраф. Вызывать ДО смены статуса в 'closed'.
export async function learnFromCheckClose(db: Database, checkId: string): Promise<void> {
  try {
    const [check] = await db.select({ playerId: checks.playerId }).from(checks).where(eq(checks.id, checkId)).limit(1)
    if (!check?.playerId) return
    const [p] = await db.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, check.playerId)).limit(1)
    if (p?.tier !== 'resident') return

    const { suggestions } = await scorePlayerItems(db, check.playerId, checkId) // топ-кандидаты по истории
    const inCheck = new Set((await db.select({ itemId: checkItems.itemId }).from(checkItems).where(eq(checkItems.checkId, checkId))).map((i) => i.itemId))

    const top = suggestions.slice(0, MAX_SUGGESTIONS) // то, что показывали бы
    const d = await readDismissed(db)
    const pd = d[check.playerId] ?? {}
    let changed = false
    for (const s of top) {
      if (!inCheck.has(s.itemId)) { pd[s.itemId] = Math.min(6, (pd[s.itemId] ?? 0) + 1); changed = true } // показали, не добавили
    }
    // Купил то, что раньше браковали → ослабляем штраф.
    for (const itemId of inCheck) {
      if (itemId && pd[itemId]) { pd[itemId] = Math.max(0, pd[itemId] - 2); changed = true }
    }
    if (changed) { d[check.playerId] = pd; await writeDismissed(db, d) }
  } catch (e) {
    console.error('[suggestions] learnFromCheckClose failed', e)
  }
}
