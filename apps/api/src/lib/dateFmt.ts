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

/**
 * Бизнес-день (по умолч. 09:00→06:00) строкой YYYY-MM-DD; 00:00..(startHour−1):59
 * МСК → прошлая дата. startHour — настройка business_day_start_hour (по умолч. 9 →
 * прежнее поведение байт-в-байт). Передаётся явно вызывающим (хелпер синхронный).
 */
export function bizDayStr(daysAgo = 0, startHour = 9): string {
  return new Date(Date.now() + MSK_MS - startHour * 3600000 - daysAgo * 86400000).toISOString().split('T')[0]
}

/** Абсолютное начало бизнес-дня — startHour:00 МСК указанной даты YYYY-MM-DD (по умолч. 09:00). */
export function bizDayStart(dateStr: string, startHour = 9): Date {
  return new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00+03:00`)
}

/** Начало бизнес-месяца: 1-е число (по МСК) в startHour:00 МСК (по умолч. 09:00). offsetMonths: 0=текущий, −1=прошлый. */
export function bizMonthStart(offsetMonths = 0, startHour = 9): Date {
  const m = new Date(Date.now() + MSK_MS)
  const first = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + offsetMonths, 1))
  return new Date(`${first.toISOString().split('T')[0]}T${String(startHour).padStart(2, '0')}:00:00+03:00`)
}
