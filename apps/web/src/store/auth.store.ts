import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  setAuth: (token: string, user: AuthUser, needsPinSetup?: boolean) => void
  logout: () => void
  setRemembered: (userId: string, nickname: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      rememberedUserId: null,
      rememberedNickname: null,
      needsPinSetup: false,
      setAuth: (token, user, needsPinSetup = false) =>
        set({ token, user, needsPinSetup }),
      logout: () => {
        if (typeof window !== 'undefined' && window.__clearPOSState) {
          window.__clearPOSState()
        }
        set({ token: null, user: null, needsPinSetup: false })
      },
      setRemembered: (userId, nickname) =>
        set({ rememberedUserId: userId, rememberedNickname: nickname }),
    }),
    {
      name: 'titan-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        rememberedUserId: state.rememberedUserId,
        rememberedNickname: state.rememberedNickname,
      }),
    }
  )
)

declare global {
  interface Window {
    __clearPOSState?: () => void
  }
}
