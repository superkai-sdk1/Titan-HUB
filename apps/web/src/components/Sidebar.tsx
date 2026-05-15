'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCurrentShift, useCloseShift } from '@/hooks/useShift'

interface NavItem {
  href: string
  icon: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/pos', icon: 'point_of_sale', label: 'POS Система' },
  { href: '/dashboard', icon: 'dashboard', label: 'Дашборд' },
  { href: '/manage/clients', icon: 'group', label: 'Клиенты' },
  { href: '/manage/menu', icon: 'restaurant_menu', label: 'Меню' },
  { href: '/manage/events', icon: 'event', label: 'События' },
  { href: '/manage/staff', icon: 'manage_accounts', label: 'Персонал' },
]

const BOTTOM_NAV: NavItem[] = [
  { href: '/manage/settings', icon: 'settings', label: 'Настройки' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: shift } = useCurrentShift()
  const closeShift = useCloseShift()

  if (pathname === '/login') return null

  return (
    <>
      {/* Sidebar — hidden on mobile, shown on desktop via CSS class lg:flex */}
      <aside
        className="sidebar-root"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 260,
          flexDirection: 'column',
          background: 'rgba(29, 26, 36, 0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '0 32px 32px 0',
          zIndex: 50,
          display: 'none',
        }}
      >
        {/* Brand */}
        <div style={{ padding: '28px 24px 20px' }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 900,
              fontStyle: 'italic',
              letterSpacing: '-0.01em',
              margin: 0,
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 12px rgba(139,92,246,0.4))',
            }}
          >
            TITAN HUB
          </h1>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: shift ? 'var(--on-surface-variant)' : 'rgba(204,195,216,0.4)',
              margin: '6px 0 0',
            }}
          >
            {shift ? 'В СМЕНЕ' : 'НЕТ СМЕНЫ'}
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px 8px' }} />

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const active = pathname === href || (href !== '/pos' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  marginBottom: 2,
                  textDecoration: 'none',
                  background: active ? 'rgba(139,92,246,0.1)' : 'transparent',
                  borderRight: active ? '2px solid #8B5CF6' : '2px solid transparent',
                  color: active ? '#8B5CF6' : 'var(--on-surface-variant)',
                  transition: 'all 0.2s',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 20,
                    fontVariationSettings: active
                      ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20"
                      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </span>
                <span style={{ fontSize: 14, fontWeight: active ? 600 : 400 }}>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 12px 24px' }}>
          {BOTTOM_NAV.map(({ href, icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  marginBottom: 12,
                  textDecoration: 'none',
                  background: active ? 'rgba(139,92,246,0.1)' : 'transparent',
                  color: active ? '#8B5CF6' : 'var(--on-surface-variant)',
                  transition: 'all 0.2s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>
                  {icon}
                </span>
                <span style={{ fontSize: 14 }}>{label}</span>
              </Link>
            )
          })}

          <button
            onClick={() => closeShift.mutate({ cashEnd: 0 })}
            disabled={closeShift.isPending || !shift}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 14,
              border: 'none',
              cursor: shift ? 'pointer' : 'not-allowed',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
              opacity: shift ? 1 : 0.4,
            }}
          >
            ЗАВЕРШИТЬ СМЕНУ
          </button>
        </div>
      </aside>

      {/* Responsive show on desktop */}
      <style>{`
        @media (min-width: 1024px) {
          .sidebar-root { display: flex !important; }
        }
      `}</style>
    </>
  )
}
