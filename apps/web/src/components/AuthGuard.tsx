'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

const PUBLIC = ['/login', '/privacy', '/terms']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { token, user, _hasHydrated } = useAuthStore()

  // Планшетный киоск самоуправляем: /tablet/* сам показывает выбор пространства
  // и ввод PIN сотрудника (без токена), затем работает под staff-токеном. Гвард
  // не вмешивается — иначе свежий планшет без токена улетал бы на /tablet/pair,
  // а после входа staff-токеном — на /pos.
  const isTablet = pathname.startsWith('/tablet')

  useEffect(() => {
    if (!_hasHydrated) return

    // Публичные страницы и планшетный киоск — никаких редиректов
    if (PUBLIC.includes(pathname) || isTablet) return

    if (!token) {
      router.replace('/login')
      return
    }
    // Старые привязанные устройства (роль tablet) — всегда на /tablet
    if (user?.role === 'tablet') {
      router.replace('/tablet')
    }
  }, [token, user, pathname, router, _hasHydrated, isTablet])

  if (!_hasHydrated) return null
  if (!token && !PUBLIC.includes(pathname) && !isTablet) return null
  return <>{children}</>
}
