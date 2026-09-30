import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Сессия приложения: выбранный клуб и вход в него.
 *
 * API определяет клуб только по заголовку Host, поэтому клуб — это его хост
 * (`kbr.titanpos.ru`), а токен привязан к клубу: токен одного клуба на другом
 * поддомене получает 401. Всё лежит в Keychain через expo-secure-store.
 */

export type Club = {
  /** Хост API клуба, например `kbr.titanpos.ru`. */
  host: string;
  /** Slug клуба; `null` на основном домене titanpos.ru. */
  slug: string | null;
  name: string;
};

export type SessionUser = {
  id: string;
  nickname: string;
  role: string;
  photoUrl: string | null;
};

type StoredAuth = { token: string; user: SessionUser };

type SessionState = {
  hydrated: boolean;
  club: Club | null;
  token: string | null;
  user: SessionUser | null;
  /** Экран закрыт до Face ID или PIN: холодный старт или долгий уход в фон. */
  locked: boolean;
  hydrate: () => Promise<void>;
  setClub: (club: Club) => Promise<void>;
  signIn: (token: string, user: SessionUser) => Promise<void>;
  /** Выход из клуба; клуб остаётся выбранным. */
  signOut: () => Promise<void>;
  /** Сменить клуб: забыть клуб и вход в него. */
  forgetClub: () => Promise<void>;
  lock: () => void;
  unlock: () => void;
};

const CLUB_KEY = 'titan.club';
/** Ключ SecureStore допускает только буквы, цифры, «.», «-», «_» — двоеточие порта заменяем. */
const authKey = (host: string) => `titan.auth.${host.replace(/[^A-Za-z0-9._-]/g, '_')}`;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>()((set, get) => ({
  hydrated: false,
  club: null,
  token: null,
  user: null,
  locked: false,

  hydrate: async () => {
    const club = await readJson<Club>(CLUB_KEY);
    const auth = club ? await readJson<StoredAuth>(authKey(club.host)) : null;
    set({
      hydrated: true,
      club,
      token: auth?.token ?? null,
      user: auth?.user ?? null,
      // Как в вебе: при холодном старте с действующим входом — сначала разблокировка.
      locked: !!auth?.token,
    });
  },

  setClub: async (club) => {
    await SecureStore.setItemAsync(CLUB_KEY, JSON.stringify(club));
    const auth = await readJson<StoredAuth>(authKey(club.host));
    set({ club, token: auth?.token ?? null, user: auth?.user ?? null, locked: false });
  },

  signIn: async (token, user) => {
    const { club } = get();
    if (!club) return;
    await SecureStore.setItemAsync(authKey(club.host), JSON.stringify({ token, user } satisfies StoredAuth));
    set({ token, user, locked: false });
  },

  signOut: async () => {
    const { club } = get();
    if (club) await SecureStore.deleteItemAsync(authKey(club.host)).catch(() => {});
    set({ token: null, user: null, locked: false });
  },

  forgetClub: async () => {
    const { club } = get();
    if (club) await SecureStore.deleteItemAsync(authKey(club.host)).catch(() => {});
    await SecureStore.deleteItemAsync(CLUB_KEY).catch(() => {});
    set({ club: null, token: null, user: null, locked: false });
  },

  lock: () => {
    if (get().token) set({ locked: true });
  },
  unlock: () => set({ locked: false }),
}));

/**
 * Локальный стенд разработчика (`localhost:3901`, http): только в dev-сборке или в сборке
 * с `EXPO_PUBLIC_LOCAL_STACK=1` для симулятора. Обычный релиз ходит лишь по https.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOCAL_STACK = __DEV__ || process.env.EXPO_PUBLIC_LOCAL_STACK === '1';

/** Схема запросов к хосту клуба: в релизе всегда https. */
export function hostOrigin(host: string): string {
  return `${LOCAL_STACK && LOCAL_HOST.test(host) ? 'http' : 'https'}://${host}`;
}

/** Хост клуба из того, что ввёл человек: `kbr` → `kbr.titanpos.ru`. */
export function normalizeClubHost(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw) return null;
  if (LOCAL_STACK && LOCAL_HOST.test(raw)) return raw;
  if (raw.includes('.')) return /^[a-z0-9.-]+$/.test(raw) ? raw : null;
  return /^[a-z][a-z0-9-]{1,30}$/.test(raw) ? `${raw}.titanpos.ru` : null;
}

/**
 * Локальный стенд без ввода: токен и хост задаются при сборке (`EXPO_PUBLIC_LOCAL_TOKEN`,
 * `EXPO_PUBLIC_LOCAL_HOST`). В симуляторе, где нечем нажимать, сборка входит сама.
 */
export async function localAutoLogin() {
  if (!LOCAL_STACK) return;
  const token = process.env.EXPO_PUBLIC_LOCAL_TOKEN;
  const host = process.env.EXPO_PUBLIC_LOCAL_HOST ?? 'localhost:3901';
  if (!token || !LOCAL_HOST.test(host)) return;
  const role = process.env.EXPO_PUBLIC_LOCAL_ROLE === 'staff' ? 'staff' : 'owner';
  await useSession.getState().setClub({ host, slug: null, name: 'Локальный стенд' });
  await useSession.getState().signIn(token, { id: '', nickname: 'local', role, photoUrl: null });
}

/**
 * Вход на локальный стенд по ссылке `titanhub://dev-login?host=localhost:3901&token=…&role=owner`:
 * сборку в симуляторе можно проверять без ввода адреса и PIN. Работает только при LOCAL_STACK —
 * в обычном релизе условие известно при сборке, ветка вырезается, и ссылка ничего не делает.
 */
export async function devLogin(url: string | null) {
  if (!LOCAL_STACK || !url || !url.includes('dev-login')) return;
  const { queryParams } = Linking.parse(url);
  const host = typeof queryParams?.host === 'string' ? queryParams.host : '';
  const token = typeof queryParams?.token === 'string' ? queryParams.token : '';
  if (!LOCAL_HOST.test(host) || !token) return;
  const role = queryParams?.role === 'staff' ? 'staff' : 'owner';
  await useSession.getState().setClub({ host, slug: null, name: 'Локальный стенд' });
  await useSession.getState().signIn(token, { id: '', nickname: 'local', role, photoUrl: null });
}
