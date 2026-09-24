import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import { queryClient } from './query';
import { useSession } from './session';
import type { AppNotification, CheckDetail, CheckListItem, Me, ShiftSummary } from './types';

/** Ключи запросов включают хост клуба, чтобы кэш разных клубов не смешивался. */
export function useClubKey() {
  return useSession((s) => s.club?.host ?? 'none');
}

export function useMe() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'me'],
    queryFn: () => api.get<Me>('/auth/me'),
    staleTime: 5 * 60_000,
  });
}

/** Выход: серверный отзыв токена (не критично, если сеть недоступна) и очистка кэша. */
export async function signOutEverywhere() {
  await api.post('/auth/logout').catch(() => {});
  queryClient.clear();
  await useSession.getState().signOut();
}

/* ─────────────────────────── Касса ─────────────────────────── */


/** Открытые чеки текущей смены. Пока без SSE — опрос, как в вебе. */
export function useChecks() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'pos', 'checks'],
    queryFn: () => api.get<{ checks: CheckListItem[] }>('/pos/checks').then((r) => r.checks),
    // Основной источник — SSE (lib/realtime.ts); опрос — страховка на случай обрыва.
    refetchInterval: 30_000,
  });
}

export function useCheck(checkId: string) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'pos', 'check', checkId],
    queryFn: () => api.get<{ check: CheckDetail }>(`/pos/checks/${checkId}`).then((r) => r.check),
    refetchInterval: 30_000,
  });
}

export function useShiftSummary() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'pos', 'shift-summary'],
    queryFn: () => api.get<ShiftSummary>('/pos/shift-summary'),
    refetchInterval: 60_000,
  });
}

export function useNotifications() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'notifications'],
    queryFn: () => api.get<{ notifications: AppNotification[] }>('/notifications').then((r) => r.notifications),
    refetchInterval: 60_000,
  });
}

/* ─────────────────────────── Прочтение уведомлений ─────────────────────────── */

const ATTENTION_TYPES = ['staff_call', 'request_bill', 'client_order', 'chat_message'];

/** Открыли чек — вызовы, счёт, заказы и чат по нему прочитаны (как в вебе). */
export async function markCheckNotificationsRead(host: string, check: { id: string; spaceId: string | null }) {
  const list = queryClient.getQueryData<AppNotification[]>([host, 'notifications']);
  const matches = (n: AppNotification) =>
    !n.isRead &&
    ATTENTION_TYPES.includes(n.type) &&
    (n.meta?.checkId === check.id || (!!check.spaceId && n.meta?.spaceId === check.spaceId));
  if (!list?.some(matches)) return;
  queryClient.setQueryData<AppNotification[]>([host, 'notifications'], (old) =>
    (old ?? []).map((n) => (matches(n) ? { ...n, isRead: true } : n)),
  );
  await api
    .put('/notifications/read-by-check', { checkId: check.id, spaceId: check.spaceId ?? undefined, types: ATTENTION_TYPES })
    .catch(() => {});
}

export async function markAllNotificationsRead(host: string) {
  const list = queryClient.getQueryData<AppNotification[]>([host, 'notifications']);
  if (!list?.some((n) => !n.isRead)) return;
  queryClient.setQueryData<AppNotification[]>([host, 'notifications'], (old) => (old ?? []).map((n) => ({ ...n, isRead: true })));
  await api.put('/notifications/read-all').catch(() => {});
}
