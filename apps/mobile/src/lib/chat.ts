import { create } from 'zustand';

/** Сообщение чата с кабинкой (GET /pos/checks/:id/chat). */
export type ChatMessage = {
  id: string;
  checkId: string;
  sender: 'guest' | 'staff';
  text: string;
  readAt: string | null;
  createdAt: string;
  /** Только на телефоне: ещё отправляется или не ушло. */
  local?: 'sending' | 'failed';
};

/**
 * Какой чат кабинки открыт на экране. Его новые сообщения не дублируем баннером
 * и системным уведомлением — сотрудник и так их видит.
 */
export const useOpenChat = create<{ checkId: string | null }>(() => ({ checkId: null }));

export function isChatOnScreen(checkId: string | null | undefined): boolean {
  return !!checkId && useOpenChat.getState().checkId === checkId;
}

/** Быстрые ответы персонала — те же, что в веб-кассе. */
export const QUICK_REPLIES = ['Уже идём 🙌', 'Одну минуту', 'Готовим ваш заказ', 'Сейчас подойдём со счётом', 'Спасибо!'];

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: ChatMessage; first: boolean; last: boolean };

/** Подряд идущие сообщения одной стороны в пределах этого окна — одна группа пузырей. */
const GROUP_MS = 5 * 60_000;

const dayKey = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });

function dayTitle(date: Date, now: number): string {
  const key = dayKey.format(date);
  if (key === dayKey.format(new Date(now))) return 'Сегодня';
  if (key === dayKey.format(new Date(now - 86_400_000))) return 'Вчера';
  return dayLabel.format(date);
}

/** Лента: разделители дней и пузыри с отметкой начала и конца группы. */
export function chatRows(messages: ChatMessage[], now: number, aliases?: ReadonlyMap<string, string>): ChatRow[] {
  const rows: ChatRow[] = [];
  messages.forEach((message, index) => {
    const at = new Date(message.createdAt);
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const day = dayKey.format(at);
    const prevAt = prev ? new Date(prev.createdAt) : null;
    const nextAt = next ? new Date(next.createdAt) : null;
    const newDay = !prevAt || dayKey.format(prevAt) !== day;
    if (newDay) rows.push({ kind: 'day', key: `day-${day}`, label: dayTitle(at, now) });
    const joinsPrev = !newDay && !!prev && !!prevAt && prev.sender === message.sender && at.getTime() - prevAt.getTime() < GROUP_MS;
    const joinsNext =
      !!next && !!nextAt && next.sender === message.sender && dayKey.format(nextAt) === day && nextAt.getTime() - at.getTime() < GROUP_MS;
    rows.push({ kind: 'message', key: aliases?.get(message.id) ?? message.id, message, first: !joinsPrev, last: !joinsNext });
  });
  return rows;
}
