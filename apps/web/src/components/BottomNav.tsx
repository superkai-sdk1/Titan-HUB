'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const NAV_ITEMS = [
  { href: '/pos', icon: 'point_of_sale', label: 'Касса' },
  { href: '/dashboard', icon: 'dashboard', label: 'Аналитика' },
  { href: '/manage/clients', icon: 'group', label: 'Клиенты' },
  { href: '/manage/menu', icon: 'restaurant_menu', label: 'Меню' },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const qc = useQueryClient()

  const createCheck = useMutation({
    mutationFn: () => api.post<{ check: { id: string } }>('/pos/checks', {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['checks'] })
      router.push(`/pos/${res.check.id}`)
    },
  })

  if (pathname === '/login') return null

  return (
    <>
      <nav
        className="bottom-nav-root"
        style={{
          position: 'fixed',
          bottom: 12,
          left: 16,
          right: 16,
          zIndex: 40,
          background: 'rgba(29, 26, 36, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 9999,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 20px 50px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px',
        }}
      >
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== '/pos' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '8px 0',
                textDecoration: 'none',
                position: 'relative',
                borderRadius: 9999,
                transition: 'all 0.2s',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 22,
                  color: active ? '#8B5CF6' : 'var(--on-surface-variant)',
                  fontVariationSettings: active
                    ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
                    : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                  transition: 'all 0.2s',
                }}
              >
                {icon}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: active ? '#8B5CF6' : 'rgba(204,195,216,0.5)',
                }}
              >
                {label}
              </span>
              {active && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#8B5CF6',
                    boxShadow: '0 0 6px rgba(139,92,246,0.8)',
                  }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Hide on desktop */}
      <style>{`
        @media (min-width: 1024px) {
          .bottom-nav-root { display: none !important; }
        }
      `}</style>
    </>
  )
}
