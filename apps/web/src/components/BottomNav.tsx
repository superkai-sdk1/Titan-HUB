'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/pos',     icon: 'point_of_sale', label: 'Касса' },
  { href: '/events',  icon: 'event',         label: 'События' },
  { href: '/dashboard', icon: 'bar_chart',     label: 'Отчёты' },
  { href: '/manage',  icon: 'settings',       label: 'Меню' },
]

export function BottomNav() {
  const pathname = usePathname()

  if (pathname === '/login') return null
  if (pathname.startsWith('/tablet')) return null

  return (
    <>
      <nav
        className="bottom-nav-root"
        style={{
          position: 'fixed',
          bottom: 'calc(12px + env(safe-area-inset-bottom))',
          left: 16,
          right: 16,
          zIndex: 40,
          background: 'rgba(29, 26, 36, 0.72)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 9999,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          gap: 4,
        }}
      >
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const active =
            href === '/pos'
              ? pathname === '/pos' || pathname.startsWith('/pos/')
              : href === '/manage'
              ? pathname.startsWith('/manage')
              : pathname === href || pathname.startsWith(href + '/')

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
                  fontSize: 24,
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
                    width: 20,
                    height: 2,
                    borderRadius: 1,
                    background: '#8B5CF6',
                    boxShadow: '0 0 8px rgba(139,92,246,0.8)',
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
