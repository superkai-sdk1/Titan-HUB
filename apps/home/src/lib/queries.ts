import { QueryClient, useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';

import { api } from './api';
import { useSession } from './session';
import type { ChatMessage, Check, ClubEvent, MenuCategory, MenuItem, SmartHomeConfig } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false },
  },
});

/** Ключи с хостом клуба: данные разных клубов не смешиваются. */
const useHost = () => useSession((s) => s.club?.host ?? '');
const useSignedIn = () => useSession((s) => !!s.token && !!s.space);

/**
 * Открытый счёт зоны. Сервер сам ограничивает tablet-токен своей зоной, поэтому
 * spaceId не передаём. Опрос — единственный способ узнать, что администратор
 * открыл счёт (SSE есть только у уже открытого чека).
 */
export function useOpenCheckId(intervalMs: number) {
  const host = useHost();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: [host, 'open-check'],
    queryFn: () => api.get<{ checks: { id: string }[] }>('/pos/checks').then((r) => r.checks[0]?.id ?? null),
    enabled: signedIn,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useCheck(checkId: string | null) {
  const host = useHost();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: [host, 'check', checkId],
    queryFn: () => api.get<{ check: Check }>(`/pos/checks/${checkId}`).then((r) => r.check),
    enabled: !!checkId && signedIn,
    // Страховка, если SSE оборвался: позиции из кассы всё равно доедут.
    refetchInterval: 20_000,
    staleTime: 0,
  });
}

export const fetchCheck = (checkId: string) =>
  api.get<{ check: Check }>(`/pos/checks/${checkId}`).then((r) => r.check);

export function useMenu() {
  const host = useHost();
  const signedIn = useSignedIn();
  const categories = useQuery({
    queryKey: [host, 'menu', 'categories'],
    queryFn: () => api.get<{ categories: MenuCategory[] }>('/menu/categories?tabletOnly=true').then((r) => r.categories),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const items = useQuery({
    queryKey: [host, 'menu', 'items'],
    queryFn: () => api.get<{ items: MenuItem[] }>('/menu/items?tabletVisible=true').then((r) => r.items),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const visibleCats = (categories.data ?? []).filter((c) => c.isTabletVisible !== false);
  // Как в веб-киоске: только включённые, отмеченные «на планшете» и не закончившиеся.
  const available = (items.data ?? []).filter(
    (i) => i.isActive && i.isTabletVisible && !(i.trackStock && i.stockQuantity <= 0),
  );
  return {
    categories: visibleCats.filter((c) => available.some((i) => i.category === c.id)),
    items: available,
    isLoading: categories.isLoading || items.isLoading,
    isError: categories.isError || items.isError,
    refetch: () => Promise.all([categories.refetch(), items.refetch()]),
  };
}

export function useActiveEvent(spaceId: string | null, enabled: boolean) {
  const host = useHost();
  return useQuery({
    queryKey: [host, 'event', spaceId],
    queryFn: () => api.get<{ event: ClubEvent | null }>(`/events/active-for-space/${spaceId}`).then((r) => r.event),
    enabled: !!spaceId && enabled,
    refetchInterval: 60_000,
  });
}

export function useChat(checkId: string | null) {
  const host = useHost();
  return useQuery({
    queryKey: [host, 'chat', checkId],
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/pos/checks/${checkId}/chat`).then((r) => r.messages),
    enabled: !!checkId,
    refetchInterval: 15_000,
  });
}

// Последняя конфигурация умного дома хранится на планшете: панель «Свет и климат»
// работает, даже если сервер Titan недоступен (связь с HA идёт напрямую по LAN).
const SMART_HOME_KEY = 'titan.home.smart-home';
let smartHomeCache: SmartHomeConfig | undefined;

export async function hydrateSmartHome() {
  try {
    const raw = await SecureStore.getItemAsync(SMART_HOME_KEY);
    smartHomeCache = raw ? (JSON.parse(raw) as SmartHomeConfig) : undefined;
  } catch {
    smartHomeCache = undefined;
  }
}

export async function clearSmartHomeCache() {
  smartHomeCache = undefined;
  await SecureStore.deleteItemAsync(SMART_HOME_KEY).catch(() => {});
}

export function useSmartHome() {
  const host = useHost();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: [host, 'smart-home'],
    queryFn: async () => {
      const config = await api.get<SmartHomeConfig>('/pos/tablet/smart-home');
      smartHomeCache = config;
      await SecureStore.setItemAsync(SMART_HOME_KEY, JSON.stringify(config)).catch(() => {});
      return config;
    },
    enabled: signedIn,
    initialData: () => smartHomeCache,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: false,
  });
}

export function invalidate(...key: unknown[]) {
  const host = useSession.getState().club?.host ?? '';
  return queryClient.invalidateQueries({ queryKey: [host, ...key] });
}
