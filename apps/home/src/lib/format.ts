// Форматирование денег, времени и склонений для экранов киоска.

const rub0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const rub2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1 250 ₽ (копейки — только если они есть). */
export function money(amount: number): string {
  const abs = Math.abs(amount);
  const body = Number.isInteger(Math.round(abs * 100) / 100) ? rub0.format(abs) : rub2.format(abs);
  return `${amount < 0 ? '−' : ''}${body} ₽`;
}

/** Только число без знака рубля — для крупных сумм с отдельным «₽». */
export function amount(value: number): string {
  const abs = Math.abs(value);
  return Number.isInteger(Math.round(abs * 100) / 100) ? rub0.format(abs) : rub2.format(abs);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Пятница, 3 октября». */
export function longDay(d: Date): string {
  const w = WEEKDAYS[d.getDay()] ?? '';
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Длительность «2 ч 15 мин» / «45 мин». */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} мин`;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}
