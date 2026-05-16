'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

const PUBLIC = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { token, user, _hasHydrated } = useAuthStore()

  useEffect(() => {
    // Не делаем ничего пока Zustand не загрузил данные из localStorage.
    // Без этой проверки на первом рендере token === null (начальное состояние),
    // и роутер отправляет пользователя на /login, хотя токен есть в storage.
    if (!_hasHydrated) return

    if (!token && !PUBLIC.includes(pathname)) {
      router.replace('/login')
      return
    }
    // Роль tablet → всегда перенаправляем на /tablet если не там
    if (token && user?.role === 'tablet' && !pathname.startsWith('/tablet')) {
      router.replace('/tablet')
      return
    }
    // Обычные пользователи не должны попадать на /tablet
    if (token && user?.role !== 'tablet' && pathname.startsWith('/tablet')) {
      router.replace('/pos')
    }
  }, [token, user, pathname, router, _hasHydrated])

  // Пока store не гидрирован — не рендерим ничего (избегаем flash на /login)
  if (!_hasHydrated) return null

  if (!token && !PUBLIC.includes(pathname)) return null
  return <>{children}</>
}
