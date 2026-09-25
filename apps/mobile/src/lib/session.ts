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
const authKey = (host: string) => `titan.auth.${host}`;

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

/** Хост клуба из того, что ввёл человек: `kbr` → `kbr.titanpos.ru`. */
export function normalizeClubHost(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw) return null;
  if (raw.includes('.')) return /^[a-z0-9.-]+$/.test(raw) ? raw : null;
  return /^[a-z][a-z0-9-]{1,30}$/.test(raw) ? `${raw}.titanpos.ru` : null;
}
