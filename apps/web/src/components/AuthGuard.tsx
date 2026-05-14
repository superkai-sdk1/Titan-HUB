'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

const PUBLIC = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore(s => s.token)

  useEffect(() => {
    if (!token && !PUBLIC.includes(pathname)) {
      router.replace('/login')
    }
  }, [token, pathname, router])

  if (!token && !PUBLIC.includes(pathname)) return null
  return <>{children}</>
}
