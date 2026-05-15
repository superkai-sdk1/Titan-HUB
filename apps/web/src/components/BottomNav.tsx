'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, BarChart2, Grid3X3, User, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const NAV_LEFT = [
  { href: '/pos', label: 'Касса', Icon: ShoppingCart },
  { href: '/dashboard', label: 'Аналитика', Icon: BarChart2 },
]

const NAV_RIGHT = [
  { href: '/manage', label: 'Управление', Icon: Grid3X3 },
  { href: '/profile', label: 'Профиль', Icon: User },
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
    <nav style={{
      position: 'fixed', bottom: 12, left: 16, right: 16, zIndex: 40,
      background: 'var(--l1-bg)',
      backdropFilter: 'blur(24px) saturate(1.3)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
      border: '1px solid var(--l1-border)',
      borderRadius: 28,
      boxShadow: 'var(--sh-nav)',
      display: 'flex', alignItems: 'center',
    }}>
      {/* Left items */}
      {NAV_LEFT.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 0', textDecoration: 'none', position: 'relative',
              borderRadius: 20,
              background: active ? 'var(--l3-bg)' : 'transparent',
              transition: 'background 0.2s',
            }}
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.5 : 1.5}
              color={active ? 'var(--accent-light)' : 'var(--text-secondary)'}
              style={{ transform: active ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.2s' }}
            />
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: active ? 'var(--accent-light)' : 'var(--text-muted)',
            }}>
              {label}
            </span>
            {active && (
              <div className="accent-line" style={{ position: 'absolute', bottom: 6, left: '20%', right: '20%', height: 2 }} />
            )}
          </Link>
        )
      })}

      {/* Center FAB */}
      <div style={{ flex: '0 0 auto', padding: '0 6px' }}>
        <button
          onClick={() => pathname.startsWith('/pos') ? createCheck.mutate() : router.push('/pos')}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--bg-mid)', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: 'translateY(-12px)',
            boxShadow: 'var(--sh-button)',
            transition: 'transform 0.2s',
          }}
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Right items */}
      {NAV_RIGHT.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 0', textDecoration: 'none', position: 'relative',
              borderRadius: 20,
              background: active ? 'var(--l3-bg)' : 'transparent',
              transition: 'background 0.2s',
            }}
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.5 : 1.5}
              color={active ? 'var(--accent-light)' : 'var(--text-secondary)'}
              style={{ transform: active ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.2s' }}
            />
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: active ? 'var(--accent-light)' : 'var(--text-muted)',
            }}>
              {label}
            </span>
            {active && (
              <div className="accent-line" style={{ position: 'absolute', bottom: 6, left: '20%', right: '20%', height: 2 }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
