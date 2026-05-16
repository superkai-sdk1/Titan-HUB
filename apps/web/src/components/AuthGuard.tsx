'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

const PUBLIC = ['/login', '/privacy', '/terms', '/tablet/pair']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { token, user, _hasHydrated } = useAuthStore()

  useEffect(() => {
    if (!_hasHydrated) return

    // Публичные страницы — никаких редиректов
    if (PUBLIC.includes(pathname)) return

    if (!token) {
      // Планшетный режим без токена → экран pairing
      if (pathname.startsWith('/tablet')) {
        router.replace('/tablet/pair')
      } else {
        router.replace('/login')
      }
      return
    }
    // Роль tablet → всегда перенаправляем на /tablet если не там
    if (user?.role === 'tablet' && !pathname.startsWith('/tablet')) {
      router.replace('/tablet')
      return
    }
    // Обычные пользователи не должны попадать на /tablet
    if (user?.role !== 'tablet' && pathname.startsWith('/tablet')) {
      router.replace('/pos')
    }
  }, [token, user, pathname, router, _hasHydrated])

  if (!_hasHydrated) return null
  if (!token && !PUBLIC.includes(pathname)) return null
  return <>{children}</>
}
