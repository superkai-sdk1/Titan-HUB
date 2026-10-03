import { create } from 'zustand';

import { api } from './api';
import { useSession } from './session';

/**
 * Панель сотрудника открывается PIN-ом и закрывается сама через 3 минуты без
 * действий (или при уходе на экран гостя). PIN проверяет сервер тем же
 * /auth/tablet-session — заодно планшет получает свежий токен.
 */
const UNLOCK_MS = 3 * 60_000;

export const useStaff = create<{ until: number; nickname: string | null; touch: () => void; lock: () => void; set: (nickname: string | null) => void }>()(
  (set) => ({
    until: 0,
    nickname: null,
    set: (nickname) => set({ until: Date.now() + UNLOCK_MS, nickname }),
    touch: () => set((s) => (s.until > Date.now() ? { until: Date.now() + UNLOCK_MS } : s)),
    lock: () => set({ until: 0, nickname: null }),
  }),
);

export const staffUnlocked = () => useStaff.getState().until > Date.now();

type TabletSession = { token: string; space: { id: string; name: string }; staff?: { nickname: string } };

/** Проверить PIN сотрудника для зоны; null — успех, иначе текст ошибки. */
export async function verifyStaffPin(spaceId: string, pin: string, host?: string): Promise<string | null> {
  try {
    const res = await api.post<TabletSession>('/auth/tablet-session', { spaceId, pin }, { auth: false, host });
    await useSession.getState().signIn(res.token, res.space, res.staff?.nickname ?? null);
    useStaff.getState().set(res.staff?.nickname ?? null);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Неверный PIN';
  }
}
