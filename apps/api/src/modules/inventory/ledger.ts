import { db, inventory, stockMovements, eq } from '@titan/database'
import { round2 } from '../../lib/money.js'

// Единая воронка записи движений склада. ЛЮБОЕ изменение остатка (продажа,
// приёмка, ревизия, списание, корректировка, возврат) проходит через неё, поэтому
// журнал stock_movements — единственный источник истины, а inventory.stockQuantity
// и cost_price (WAC) — материализованный кэш, синхронный с журналом в той же
// транзакции. Инвариант: stockQuantity == SUM(delta) по товару.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type MovementType =
  | 'opening' | 'receipt' | 'sale' | 'return'
  | 'adjustment' | 'write_off' | 'count' | 'transfer'

export interface RecordMovementInput {
  itemId: string
  type: MovementType
  /** Знаковая дельта (штук). Фактически применённая дельта может отличаться при clamp. */
  delta: number
  /** Цена единицы прихода (receipt). Включает пересчёт WAC, когда delta > 0. */
  unitCost?: number
  /** Не уходить ниже нуля: qty_after = max(0, before+delta). По умолчанию true. */
  clamp?: boolean
  /** Менять остаток только у учётных (trackStock) товаров. Для POS — true. */
  requireTracked?: boolean
  sourceType?: string | null
  sourceId?: string | null
  reason?: string | null
  note?: string | null
  userId?: string | null
}

export interface MovementResult {
  /** Остаток после движения. */
  qtyAfter: number
  /** Фактически применённая дельта (с учётом clamp). 0 — товара нет/не учётный. */
  applied: number
  /** Себестоимость (WAC) после движения. */
  avgCost: number
  /** false, если товар не найден (или мягко удалён). */
  ok: boolean
}

/**
 * Провести движение склада в рамках транзакции tx.
 * Лочит строку товара FOR UPDATE, вычисляет остаток, на приходе пересчитывает WAC,
 * обновляет кэш inventory и пишет строку журнала. Возвращает фактическую дельту и
 * новый остаток (нулевая дельта строку журнала не создаёт).
 */
export async function recordMovement(tx: Tx, input: RecordMovementInput): Promise<MovementResult> {
  const clamp = input.clamp ?? true
  const [item] = await tx.select().from(inventory).where(eq(inventory.id, input.itemId)).for('update')
  if (!item) return { qtyAfter: 0, applied: 0, avgCost: 0, ok: false }

  const before = item.stockQuantity ?? 0
  // POS трогает остаток только у учётных товаров — не-учётные пропускаем без записи.
  if (input.requireTracked && !item.trackStock) {
    return { qtyAfter: before, applied: 0, avgCost: parseFloat(String(item.costPrice ?? 0)) || 0, ok: true }
  }
  const rawAfter = before + input.delta
  const qtyAfter = clamp ? Math.max(0, rawAfter) : rawAfter
  const applied = qtyAfter - before

  const oldCost = parseFloat(String(item.costPrice ?? 0)) || 0
  let avgCost = oldCost
  // WAC только на приходе с известной ценой: (before·old + in·cost) / after.
  // База «до» клампится в ноль: после оверселла остаток уходит в минус
  // (clamp:false у продажи), а отрицательный before искажает средневзвешенную
  // (числитель занижается, WAC может уйти в минус и отравить маржу/стоимость
  // склада навсегда). Приход на «дыру» считаем как чистый приход по своей цене:
  // используем effectiveBefore = max(0, before) и в числителе, и в знаменателе.
  if (input.type === 'receipt' && applied > 0 && input.unitCost !== undefined && qtyAfter > 0) {
    const effectiveBefore = Math.max(0, before)
    avgCost = round2(
      (effectiveBefore * oldCost + applied * input.unitCost) / (effectiveBefore + applied),
    )
  }

  if (applied !== 0 || avgCost !== oldCost) {
    const set: Record<string, unknown> = { stockQuantity: qtyAfter, updatedAt: new Date() }
    if (avgCost !== oldCost) set.costPrice = String(avgCost)
    await tx.update(inventory).set(set).where(eq(inventory.id, input.itemId))
  }

  // Нулевую дельту в журнал не пишем (нет факта движения остатка).
  if (applied !== 0) {
    const unitCost = input.type === 'receipt' ? input.unitCost : avgCost
    await tx.insert(stockMovements).values({
      itemId: input.itemId,
      type: input.type,
      delta: applied,
      qtyAfter,
      unitCost: unitCost !== undefined && unitCost !== null ? String(round2(unitCost)) : null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      createdBy: input.userId ?? null,
    })
  }

  return { qtyAfter, applied, avgCost, ok: true }
}
