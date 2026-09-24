import type { SFSymbol } from 'sf-symbols-typescript';

import { api, ApiError } from './api';

/**
 * Tai — ИИ-ассистент клуба. POST /ai/chat принимает готовое действие или
 * произвольный вопрос (`custom_query`) и возвращает готовый текст ответа.
 * Модуль платный: без подписки сервер отвечает 403 `ai_subscription_required`.
 */

export type TaiAction =
  | 'daily_summary'
  | 'revenue_summary'
  | 'low_stock_alert'
  | 'product_analysis'
  | 'client_analysis'
  | 'shift_report'
  | 'avg_check_trend'
  | 'popular_hours'
  | 'expense_analysis'
  | 'refund_analysis'
  | 'salary_report'
  | 'event_summary'
  | 'certificate_usage'
  | 'bonus_usage'
  | 'custom_query';

export const TAI_ACTIONS: { key: TaiAction; label: string; icon: SFSymbol; color: string }[] = [
  { key: 'daily_summary', label: 'Сводка за день', icon: 'sun.max', color: '#F59E0B' },
  { key: 'revenue_summary', label: 'Выручка', icon: 'rublesign.circle', color: '#22C55E' },
  { key: 'low_stock_alert', label: 'Что заканчивается', icon: 'exclamationmark.triangle', color: '#EF4444' },
  { key: 'product_analysis', label: 'Топ товаров', icon: 'cup.and.saucer', color: '#F97316' },
  { key: 'client_analysis', label: 'Игроки', icon: 'person.2', color: '#3B82F6' },
  { key: 'shift_report', label: 'Смены', icon: 'clock', color: '#8B5CF6' },
  { key: 'avg_check_trend', label: 'Средний чек', icon: 'chart.bar', color: '#06B6D4' },
  { key: 'popular_hours', label: 'Часы пик', icon: 'chart.xyaxis.line', color: '#6366F1' },
  { key: 'expense_analysis', label: 'Расходы', icon: 'arrow.down.right.circle', color: '#F43F5E' },
  { key: 'refund_analysis', label: 'Возвраты', icon: 'arrow.uturn.backward', color: '#FB7185' },
  { key: 'salary_report', label: 'Зарплаты', icon: 'wallet.bifold', color: '#0EA5E9' },
  { key: 'event_summary', label: 'Мероприятия', icon: 'calendar', color: '#A855F7' },
  { key: 'certificate_usage', label: 'Сертификаты', icon: 'giftcard', color: '#EAB308' },
  { key: 'bonus_usage', label: 'Бонусы', icon: 'star.circle', color: '#FACC15' },
];

export const taiActionLabel = (action: TaiAction) => TAI_ACTIONS.find((item) => item.key === action)?.label ?? 'Вопрос';

/** Ответ Tai. Вопрос уходит без ретраев: повтор — это ещё один запрос к модели. */
export async function askTai(action: TaiAction, query?: string, signal?: AbortSignal): Promise<string> {
  const body = action === 'custom_query' ? { action, payload: { query } } : { action };
  const { result } = await api.post<{ result: string; cached?: boolean }>('/ai/chat', body, { signal });
  return result;
}

/** 403 ai_subscription_required — клуб без подписки на Tai. */
export const isTaiLocked = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && (error.data as { error?: string } | null)?.error === 'ai_subscription_required';

export function taiErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 502) return 'Модель не ответила. Попробуйте ещё раз.';
  return error instanceof Error ? error.message : String(error);
}
