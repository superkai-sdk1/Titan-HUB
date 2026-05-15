'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, user } = useAuthStore()

  useEffect(() => {
    if (!token) {
      router.replace('/login')
      return
    }
    if (user?.role !== 'tablet') {
      // Не планшет — перенаправляем на POS
      router.replace('/pos')
    }
  }, [token, user, router])

  if (!token || user?.role !== 'tablet') return null

  return (
    <>
      {/* Сбрасываем отступы layout-main и layout-content для планшета */}
      <style>{`
        .layout-main { margin-left: 0 !important; }
        .layout-content { padding-bottom: 0 !important; }
      `}</style>
      <div style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--background)',
        color: 'var(--on-surface)',
      }}>
        {children}
      </div>
    </>
  )
}
