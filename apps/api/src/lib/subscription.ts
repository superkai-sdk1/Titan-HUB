import type { ClubContext } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Расчёт состояния подписки клуба (единый источник истины для middleware
// энфорсмента и публичного /api/club/context — чтобы фронт и бэк не разъезжались).
//
// Решение владельца: ГРЕЙС, затем ПОЛНАЯ блокировка с экраном «продлите подписку».
//   • active   — оплачено, всё работает;
//   • expiring — оплачено, но < EXPIRING_SOON_DAYS до конца → мягкий баннер;
//   • grace    — срок вышел, но в пределах грейса → предупреждающий баннер, доступ есть;
//   • expired  — грейс кончился → БЛОК;
//   • suspended— оператор приостановил → БЛОК;
//   • none      — подписки нет (клуб не настроен) → БЛОК;
//   • unknown   — обогащение подписки не удалось → FAIL-OPEN (не блокируем).
// ─────────────────────────────────────────────────────────────────────────────

export const SUBSCRIPTION_GRACE_DAYS = 3
const EXPIRING_SOON_DAYS = 5
const DAY_MS = 86_400_000

export type SubscriptionState =
  | 'active'
  | 'expiring'
  | 'grace'
  | 'expired'
  | 'suspended'
  | 'none'
  | 'unknown'

export interface SubscriptionStatus {
  state: SubscriptionState
  blocked: boolean
  paidUntil: string | null
  graceUntil: string | null
  // Дней до окончания оплаченного периода (отрицательное в грейсе/после). null —
  // если срок не задан/неизвестен.
  daysLeft: number | null
}

function toIso(d: Date | string | null): string | null {
  if (!d) return null
  const dt = typeof d === 'string' ? new Date(d) : d
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/**
 * Вычислить состояние подписки клуба на момент nowMs (= Date.now()).
 * club=null (основной домен) → всегда active/не блокируется (одно-клубный режим).
 */
export function computeSubscriptionStatus(
  club: ClubContext | null,
  nowMs: number,
): SubscriptionStatus {
  if (!club) {
    return { state: 'active', blocked: false, paidUntil: null, graceUntil: null, daysLeft: null }
  }
  const sub = club.subscription
  // Обогащение не удалось → не блокируем (доступность важнее транзиентной ошибки).
  if (sub === undefined) {
    return { state: 'unknown', blocked: false, paidUntil: null, graceUntil: null, daysLeft: null }
  }
  // Подписки нет — клуб не настроен → блок.
  if (sub === null) {
    return { state: 'none', blocked: true, paidUntil: null, graceUntil: null, daysLeft: null }
  }
  if (sub.status === 'suspended') {
    return {
      state: 'suspended',
      blocked: true,
      paidUntil: toIso(sub.paidUntil),
      graceUntil: null,
      daysLeft: null,
    }
  }
  const paid = sub.paidUntil ? new Date(sub.paidUntil).getTime() : null
  // Активная без срока окончания (например ручной 'active' без даты) → не блокируем.
  if (paid === null || Number.isNaN(paid)) {
    return { state: 'active', blocked: false, paidUntil: null, graceUntil: null, daysLeft: null }
  }
  const graceMs = paid + SUBSCRIPTION_GRACE_DAYS * DAY_MS
  const daysLeft = Math.floor((paid - nowMs) / DAY_MS)
  const paidIso = toIso(sub.paidUntil)
  const graceIso = toIso(new Date(graceMs))

  if (nowMs <= paid) {
    const state: SubscriptionState =
      paid - nowMs <= EXPIRING_SOON_DAYS * DAY_MS ? 'expiring' : 'active'
    return { state, blocked: false, paidUntil: paidIso, graceUntil: graceIso, daysLeft }
  }
  if (nowMs <= graceMs) {
    return { state: 'grace', blocked: false, paidUntil: paidIso, graceUntil: graceIso, daysLeft }
  }
  return { state: 'expired', blocked: true, paidUntil: paidIso, graceUntil: graceIso, daysLeft }
}
