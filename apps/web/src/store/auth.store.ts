'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// После 30 минут бездействия — запрашиваем PIN/Passkey
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000

interface AuthUser {
  id: string
  nickname: string
  role: string
  photoUrl: string | null
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  rememberedUserId: string | null
  rememberedNickname: string | null
  needsPinSetup: boolean
  isLocked: boolean
  lastActiveAt: number
  /** true после того как Zustand загрузил данные из localStorage */
  _hasHydrated: boolean
  setAuth: (token: string, user: AuthUser, needsPinSetup?: boolean) => void
  logout: () => void
  setRemembered: (userId: string, nickname: string) => void
  lock: () => void
  unlock: () => void
  updateActivity: () => void
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      rememberedUserId: null,
      rememberedNickname: null,
      needsPinSetup: false,
      isLocked: false,
      lastActiveAt: Date.now(),
      _hasHydrated: false,
      setAuth: (token, user, needsPinSetup = false) =>
        set({ token, user, needsPinSetup, isLocked: false, lastActiveAt: Date.now() }),
      logout: () => {
        if (typeof window !== 'undefined' && window.__clearPOSState) {
          window.__clearPOSState()
        }
        set({ token: null, user: null, needsPinSetup: false, isLocked: false })
      },
      setRemembered: (userId, nickname) =>
        set({ rememberedUserId: userId, rememberedNickname: nickname }),
      lock: () => set({ isLocked: true }),
      unlock: () => set({ isLocked: false, lastActiveAt: Date.now() }),
      updateActivity: () => set({ lastActiveAt: Date.now() }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'titan-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        rememberedUserId: state.rememberedUserId,
        rememberedNickname: state.rememberedNickname,
        lastActiveAt: state.lastActiveAt,
        // _hasHydrated не сохраняем — всегда начинает с false
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Помечаем что гидрация завершена
        state.setHasHydrated(true)
        // Если прошло больше INACTIVITY_TIMEOUT_MS с последней активности — блокируем
        const idle = Date.now() - (state.lastActiveAt ?? 0)
        if (state.token && idle > INACTIVITY_TIMEOUT_MS) {
          state.isLocked = true
        }
      },
    }
  )
)

declare global {
  interface Window {
    __clearPOSState?: () => void
  }
}
