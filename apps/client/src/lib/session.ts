// Сессия клиента: токен в защищённом хранилище (Keychain / Keystore) + статус входа.
// Скользящая сессия: раз в несколько дней токен меняется на свежий (30 дней),
// поэтому постоянным клиентам не приходится входить заново.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const TOKEN_KEY = 'titan_resident_token';
const REFRESHED_KEY = 'titan_resident_refreshed_at';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn' | 'demo';

interface SessionState {
  status: SessionStatus;
  token: string | null;
  signIn: (token: string) => Promise<void>;
  enterDemo: () => void;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
  replaceToken: (token: string) => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  token: null,
  restore: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      set(token ? { status: 'signedIn', token } : { status: 'signedOut', token: null });
    } catch {
      set({ status: 'signedOut', token: null });
    }
  },
  signIn: async (token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REFRESHED_KEY, String(Date.now()));
    set({ status: 'signedIn', token });
  },
  replaceToken: async (token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REFRESHED_KEY, String(Date.now()));
    set({ token });
  },
  enterDemo: () => set({ status: 'demo', token: null }),
  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(REFRESHED_KEY).catch(() => {});
    set({ status: 'signedOut', token: null });
  },
}));

/** Пора ли обновить токен (раз в 3 дня). */
export async function tokenRefreshDue(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(REFRESHED_KEY).catch(() => null);
  const at = raw ? Number(raw) : 0;
  return !at || Date.now() - at > 3 * 24 * 3600 * 1000;
}

export const isDemo = () => useSession.getState().status === 'demo';
