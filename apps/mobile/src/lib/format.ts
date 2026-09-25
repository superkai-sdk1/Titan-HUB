const MINUS = '−';
const NBSP = ' ';

const integer = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const kopecks = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Числа из API: numeric-колонки Postgres приходят строками. */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 12 400 ₽ · −350 ₽ · +1 200 ₽ — как formatMoney в веб-кассе.
 * `kopecks: 'auto'` — копейки только когда они есть (наличные в кассе, сдача).
 */
export function formatMoney(
  value: number | string | null | undefined,
  options: { sign?: boolean; kopecks?: boolean | 'auto' } = {},
): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100);
  const withKopecks = options.kopecks === 'auto' ? cents % 100 !== 0 : options.kopecks;
  const body = withKopecks ? kopecks.format(cents / 100) : integer.format(Math.round(abs));
  const prefix = n < 0 ? MINUS : options.sign && n > 0 ? '+' : '';
  return `${prefix}${body}${NBSP}₽`;
}

/** Русское множественное число: plural(3, ['чек', 'чека', 'чеков']) → «чека». */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Время по Москве: бизнес-день клуба считается по МСК. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : time.format(d);
}

/** «2 ч 15 мин» с момента `iso`. */
export function formatDuration(fromIso: string | null | undefined, now = Date.now()): string {
  if (!fromIso) return '';
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return '';
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
