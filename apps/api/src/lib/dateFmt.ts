// Форматирование и границы дат по МСК — БЕЗ зависимости от Intl/ICU. В Node-образе
// контейнера может не быть ICU-данных для 'ru', и toLocaleString('ru-RU') молча
// откатывается на en-US (мм/дд/гггг). Здесь даты считаем вручную: сдвигаем на +3ч
// (МСК) и читаем UTC-компоненты, формат всегда день.месяц.год.

const MSK_MS = 3 * 3600 * 1000

/** Дата по МСК как "ДД.ММ.ГГГГ" (или с временем "ДД.ММ.ГГГГ ЧЧ:ММ"). */
export function fmtMsk(d: Date, withTime = false): string {
  const m = new Date(d.getTime() + MSK_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  const s = `${p(m.getUTCDate())}.${p(m.getUTCMonth() + 1)}.${m.getUTCFullYear()}`
  return withTime ? `${s} ${p(m.getUTCHours())}:${p(m.getUTCMinutes())}` : s
}

/** Бизнес-день (09:00→06:00) строкой YYYY-MM-DD; 00:00–08:59 МСК → прошлая дата. */
export function bizDayStr(daysAgo = 0): string {
  return new Date(Date.now() + MSK_MS - 9 * 3600000 - daysAgo * 86400000).toISOString().split('T')[0]
}

/** Абсолютное начало бизнес-дня — 09:00 МСК указанной даты YYYY-MM-DD. */
export function bizDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T09:00:00+03:00`)
}

/** Начало бизнес-месяца: 1-е число (по МСК) в 09:00 МСК. offsetMonths: 0=текущий, −1=прошлый. */
export function bizMonthStart(offsetMonths = 0): Date {
  const m = new Date(Date.now() + MSK_MS)
  const first = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + offsetMonths, 1))
  return new Date(`${first.toISOString().split('T')[0]}T09:00:00+03:00`)
}
