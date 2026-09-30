import { formatDuration, toNumber } from './format';
import type { CheckDetail, CheckListItem, CheckRow } from './types';

/**
 * Расчёты чека — как в веб-кассе (apps/web/src/app/pos/page.tsx, CheckDetailView.tsx).
 * Окончательную сумму при оплате всё равно пересчитывает сервер.
 */

/**
 * Аренда: целые минуты, начатая минута сверх часа — полный час; пока spaceEndAt пуст,
 * считаем до «сейчас». Секунды не учитываем — как сервер (apps/api/src/lib/money.ts).
 */
export function computeRental(
  startAt: string | null,
  endAt: string | null,
  hourlyRate: string | null,
  now = Date.now(),
): number {
  if (!startAt || !hourlyRate) return 0;
  const end = endAt ? new Date(endAt).getTime() : now;
  const minutes = Math.floor(Math.max(0, end - new Date(startAt).getTime()) / 60_000);
  return Math.ceil(minutes / 60) * toNumber(hourlyRate);
}

export type CheckTotals = { items: number; rental: number; eventBase: number; total: number; prepaid: number; due: number };

export function checkTotals(check: CheckRow & { spaceHourlyRate: string | null }, now = Date.now()): CheckTotals {
  const items = toNumber(check.totalAmount);
  const rental = check.spaceId ? computeRental(check.spaceStartAt, check.spaceEndAt, check.spaceHourlyRate, now) : 0;
  const eventBase = toNumber(check.eventBaseAmount);
  const total = items + rental + eventBase;
  const prepaid = Math.min(toNumber(check.prepaidAmount), total);
  return { items, rental, eventBase, total, prepaid, due: Math.max(0, total - prepaid) };
}

const ADJ = [
  'Бодрый', 'Хитрый', 'Грозный', 'Пушистый', 'Сонный', 'Дерзкий', 'Весёлый',
  'Ленивый', 'Шустрый', 'Наглый', 'Добрый', 'Угрюмый', 'Смелый', 'Важный',
  'Лохматый', 'Колючий', 'Пухлый', 'Суровый', 'Загадочный', 'Бешеный',
  'Могучий', 'Космический', 'Брутальный', 'Хмурый', 'Танцующий', 'Боевой',
];

const NOUN = [
  'Ёжик', 'Пельмень', 'Бублик', 'Барсук', 'Кактус', 'Хомяк', 'Бобёр', 'Енот',
  'Пингвин', 'Сырок', 'Мопс', 'Карасик', 'Шмель', 'Тапок', 'Огурчик', 'Жук',
  'Бутерброд', 'Кабачок', 'Кашалот', 'Сухарик', 'Мандарин', 'Носок', 'Чайник',
  'Пончик', 'Барабан', 'Валенок',
];

/** Имя-заглушка безымянного гостя — то же, что в вебе (детерминировано по id чека). */
export function funnyGuestName(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `${ADJ[h % ADJ.length]} ${NOUN[Math.floor(h / ADJ.length) % NOUN.length]}`;
}

export function checkTitle(check: Pick<CheckDetail, 'id' | 'guestName'>): string {
  return check.guestName || funnyGuestName(check.id);
}

/** Строки позиций карточки: до 5; если позиций больше — 4 и «Ещё N». */
export function cardLines(check: CheckListItem): { lines: string[]; moreCount: number } {
  if (check.itemCount > 5) return { lines: check.items.slice(0, 4), moreCount: check.itemCount - 4 };
  return { lines: check.items, moreCount: 0 };
}

export function openedLabel(check: CheckRow, now = Date.now()): string {
  return formatDuration(check.createdAt, now);
}
