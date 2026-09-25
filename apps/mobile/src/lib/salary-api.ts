import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import { queryClient } from './query';
import { useClubKey } from './queries';
import { useSession } from './session';
import type { NumericString } from './types';

/**
 * «Зарплата» (только владелец). Контракт — mobile-api-manage-inventory-salary.md, часть 2.
 * Ставок в системе нет — одна формула от выручки. Период выплаты кодируется началом комментария
 * («2026-09-17: аванс»), и сервер допускает ОДНУ выплату на сотрудника за период: повтор молча
 * возвращает первую с `duplicate: true` — клиент обязан это показать.
 */

export type SalaryPayment = {
  id: string;
  staffId: string;
  staffName: string | null;
  staffRole: string | null;
  amount: NumericString;
  paymentMethod: 'cash' | 'card' | 'transfer' | string;
  /** Комментарий без префикса периода. */
  note: string | null;
  /** YYYY-MM-DD или YYYY-MM из начала комментария. */
  period: string | null;
  createdAt: string;
};

export type SalaryEstimate = { day?: string; revenue: number; salary: number; staffId: string };

/** 700 ₽ до 7 000 ₽ выручки, дальше +100 ₽ за каждую начатую тысячу — как на сервере. */
export const salaryFor = (revenue: number) => (revenue <= 7000 ? 700 : 700 + Math.ceil((revenue - 7000) / 1000) * 100);

const mskHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false });
const mskDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Текущий бизнес-день клуба: до часа начала дня ещё идёт вчерашний. */
export function currentBusinessDay(startHour: number): string {
  const now = new Date();
  const hour = Number(mskHour.format(now)) % 24;
  return mskDate.format(hour < startHour ? new Date(now.getTime() - 86_400_000) : now);
}

/** Час начала бизнес-дня из настроек клуба (общий кэш с настройками оплаты). */
export function useBusinessDayStartHour(): number {
  const club = useClubKey();
  const settings = useQuery({
    queryKey: [club, 'system', 'settings'],
    queryFn: () => api.get<{ settings: Record<string, string> }>('/system/settings').then((r) => r.settings),
    staleTime: 5 * 60_000,
  });
  const hour = Number(settings.data?.business_day_start_hour);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9;
}

export function useSalaryPayments(enabled: boolean) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'salary', 'payments'],
    queryFn: () => api.get<{ payments: SalaryPayment[] }>('/salary').then((r) => r.payments),
    enabled,
    staleTime: 15_000,
  });
}

/** Персональная выручка сотрудника за бизнес-день (по чекам, которые он открыл, без мероприятий). */
export function useSalaryEstimate(staffId: string | null, day: string) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'salary', 'estimate', staffId, day],
    queryFn: () => api.get<SalaryEstimate>(`/salary/estimate?staffId=${staffId}&day=${day}`),
    // Невалидная дата молча превращается в оценку за всё время — не отправляем.
    enabled: !!staffId && /^\d{4}-\d{2}-\d{2}$/.test(day),
    staleTime: 30_000,
  });
}

export async function paySalary(input: {
  profileId: string;
  amount: number;
  method: 'cash' | 'transfer';
  day: string;
  comment: string;
  idempotencyKey: string;
}): Promise<{ payment: { amount: NumericString; paymentMethod: string }; duplicate: boolean }> {
  // Перевод строки внутри комментария ломает разбор периода на сервере.
  const comment = input.comment.replace(/\s+/g, ' ').trim();
  try {
    const r = await api.post<{ payment: { amount: NumericString; paymentMethod: string }; duplicate?: boolean }>('/salary/pay', {
      profileId: input.profileId,
      amount: input.amount,
      paymentMethod: input.method,
      note: comment ? `${input.day}: ${comment}` : input.day,
      idempotencyKey: input.idempotencyKey,
    });
    return { payment: r.payment, duplicate: !!r.duplicate };
  } finally {
    const club = useSession.getState().club?.host ?? 'none';
    for (const key of [['salary'], ['shifts', 'cashops'], ['inventory', 'expenses'], ['pos', 'shift-summary']]) {
      void queryClient.invalidateQueries({ queryKey: [club, ...key] });
    }
  }
}
