import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from './api';
import { queryClient } from './query';
import { useClubKey } from './queries';
import { useSession } from './session';

/**
 * Рассылки клиентам (приложение Titan Resident + бот кошелька). Сервер —
 * `/api/client-broadcasts`: владелец шлёт любой аудитории, сотрудник — только выбранным.
 */

export type BroadcastAudience = 'all' | 'tier' | 'debtors' | 'depositors' | 'profiles' | 'poll';

export type PollTarget = { chatId: string; options: number[]; notVoted: boolean };

export type BroadcastTarget = {
  audience: BroadcastAudience;
  tier?: string;
  profileIds?: string[];
  poll?: PollTarget;
};

export type AudienceStats = { recipients: number; withApp: number; withTelegram: number };

export type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  /** all / debtors / depositors / profiles / tier:<ключ> / poll:<подпись>. */
  audience: string;
  channels: { push?: boolean; telegram?: boolean };
  recipientsCount: number;
  pushCount: number;
  telegramCount: number;
  createdAt: string;
  sentBy: string | null;
};

export type RecipientRow = {
  id: string;
  nickname: string;
  fullName: string | null;
  photoUrl: string | null;
  clientTier: string;
  hasApp: boolean;
  hasTelegram: boolean;
};

export type PollRow = {
  chatId: string;
  title: string;
  postedAt: string;
  totalVotes: number;
  options: { index: number; label: string; votes: number; clients: number }[];
  notVoted: { people: number; clients: number };
};

/** Пустой ручной выбор или опрос без отмеченных вариантов — получателей нет. */
export function isTargetEmpty(t: BroadcastTarget): boolean {
  if (t.audience === 'profiles') return !t.profileIds?.length;
  if (t.audience === 'poll') return !t.poll || (t.poll.options.length === 0 && !t.poll.notVoted);
  return false;
}

export function useBroadcasts() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'broadcasts', 'list'],
    queryFn: () => api.get<{ broadcasts: BroadcastRow[] }>('/client-broadcasts').then((r) => r.broadcasts),
    staleTime: 15_000,
  });
}

export function useBroadcastRecipients(enabled: boolean) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'broadcasts', 'recipients'],
    queryFn: () => api.get<{ clients: RecipientRow[] }>('/client-broadcasts/recipients').then((r) => r.clients),
    staleTime: 60_000,
    enabled,
  });
}

export function useBroadcastPolls(enabled: boolean) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'broadcasts', 'polls'],
    queryFn: () => api.get<{ polls: PollRow[] }>('/client-broadcasts/polls').then((r) => r.polls),
    staleTime: 30_000,
    enabled,
  });
}

/** Сколько получат и по каким каналам — пересчитывается при смене аудитории. */
export function useAudienceStats(target: BroadcastTarget) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'broadcasts', 'audience', target],
    queryFn: () => api.post<AudienceStats>('/client-broadcasts/audience', target),
    enabled: !isTargetEmpty(target),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export async function sendBroadcast(
  target: BroadcastTarget,
  message: { title: string; body: string; push: boolean; telegram: boolean },
): Promise<{ id: string; recipients: number }> {
  const result = await api.post<{ id: string; recipients: number }>('/client-broadcasts', {
    ...target,
    title: message.title.trim(),
    body: message.body.trim(),
    channels: { push: message.push, telegram: message.telegram },
  });
  const club = useSession.getState().club?.host ?? 'none';
  void queryClient.invalidateQueries({ queryKey: [club, 'broadcasts', 'list'] });
  // Счётчики доставки сервер дописывает в фоне — перечитаем журнал чуть позже.
  setTimeout(() => void queryClient.invalidateQueries({ queryKey: [club, 'broadcasts', 'list'] }), 4000);
  return result;
}

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Все клиенты',
  debtors: 'Должники',
  depositors: 'С депозитом',
  profiles: 'Выбранные',
};

/** Подпись аудитории из журнала. */
export function audienceLabel(audience: string, tiers?: { key: string; label: string }[]): string {
  if (audience.startsWith('tier:')) return tiers?.find((t) => t.key === audience.slice(5))?.label ?? 'По статусу';
  if (audience.startsWith('poll:')) return `Опрос: ${audience.slice(5)}`;
  return AUDIENCE_LABELS[audience] ?? audience;
}
