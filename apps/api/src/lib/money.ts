// Единый источник правды для денежной математики чеков.
// Раньше round2 и расчёт аренды дублировались в pos.router.ts и platega.router.ts
// (с комментарием «держать синхронно»). Чтобы математика не разъезжалась —
// одна реализация на оба сервера. Поведение байт-в-байт как было.

/** Округление до 2 знаков с защитой от плавающей погрешности. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Аренда зоны: ceil(минуты/60) × ставка.
 * Конец аренды — заданный вручную spaceEndAt либо «живой счётчик» (nowMs).
 * Возвращает 0, если зона/время начала/ставка отсутствуют (NULL-handling
 * идентичен прежним инлайновым копиям в /pay и вебхуке Platega).
 *
 * Чистая функция (без БД): вызывающий код сам тянет hourlyRate из spaces.
 */
export function computeRental(
  spaceStartAt: Date | string | null | undefined,
  spaceEndAt: Date | string | null | undefined,
  hourlyRate: string | null | undefined,
  nowMs: number,
): number {
  if (!spaceStartAt || !hourlyRate) return 0
  const endMs = spaceEndAt ? new Date(spaceEndAt).getTime() : nowMs
  const mins = Math.max(0, (endMs - new Date(spaceStartAt).getTime()) / 60000)
  return Math.ceil(mins / 60) * parseFloat(hourlyRate)
}
