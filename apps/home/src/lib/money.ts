// Итог счёта гостя — та же математика, что у сервера (apps/api/src/lib/money.ts):
// позиции−скидки (check.totalAmount) + аренда зоны + база мероприятия.
import { num } from './format';
import type { Check, CheckItemRow } from './types';

/** Аренда зоны: ceil(целые минуты / 60) × ставка; конец — заданный или «сейчас». */
export function computeRental(check: Pick<Check, 'spaceStartAt' | 'spaceEndAt' | 'spaceHourlyRate'>, nowMs: number): number {
  if (!check.spaceStartAt || !check.spaceHourlyRate) return 0;
  const endMs = check.spaceEndAt ? new Date(check.spaceEndAt).getTime() : nowMs;
  const mins = Math.floor(Math.max(0, endMs - new Date(check.spaceStartAt).getTime()) / 60000);
  return Math.ceil(mins / 60) * num(check.spaceHourlyRate);
}

/** Минуты аренды (для подписи «2 ч 15 мин»). */
export function rentalMinutes(check: Pick<Check, 'spaceStartAt' | 'spaceEndAt'>, nowMs: number): number {
  if (!check.spaceStartAt) return 0;
  const endMs = check.spaceEndAt ? new Date(check.spaceEndAt).getTime() : nowMs;
  return Math.floor(Math.max(0, endMs - new Date(check.spaceStartAt).getTime()) / 60000);
}

export function lineTotal(row: CheckItemRow): number {
  const mods = (row.modifiers ?? []).reduce((s, m) => s + num(m.priceAtTime), 0);
  return (num(row.checkItem.priceAtTime) + mods) * row.checkItem.quantity;
}

export interface Totals {
  items: number;
  discount: number;
  rental: number;
  event: number;
  total: number;
}

export function checkTotals(check: Check, nowMs: number): Totals {
  if (check.staffCompId) return { items: 0, discount: 0, rental: 0, event: 0, total: 0 };
  const items = num(check.totalAmount);
  const rental = computeRental(check, nowMs);
  const event = num(check.eventBaseAmount);
  const total = Math.round((items + rental + event) * 100) / 100;
  return { items, discount: num(check.discountTotal), rental, event, total };
}
