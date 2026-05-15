'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useCurrentShift, useCloseShift } from '@/hooks/useShift'

interface NavItem {
  href: string
  icon: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/pos',       icon: 'point_of_sale',   label: 'Касса' },
  { href: '/events',    icon: 'event',            label: 'События' },
  { href: '/dashboard', icon: 'dashboard',        label: 'Дашборд' },
  { href: '/reports',   icon: 'bar_chart',        label: 'Отчёты' },
  { href: '/manage',    icon: 'settings',         label: 'Управление' },
]

const BOTTOM_NAV: NavItem[] = [
  { href: '/shifts',    icon: 'schedule',         label: 'Смены' },
]

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('tpos-sidebar-collapsed') === 'true'
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: shift } = useCurrentShift()
  const closeShift = useCloseShift()
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  if (pathname === '/login') return null
  if (pathname.startsWith('/tablet')) return null

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('tpos-sidebar-collapsed', String(next))
  }

  const w = collapsed ? 72 : 260

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
          width: w,
          flexDirection: 'column',
          background: 'rgba(29, 26, 36, 0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '0 32px 32px 0',
          zIndex: 50,
          display: 'none',
          transition: 'width 0.25s ease',
          overflow: 'hidden',
        }}
      >
        {/* Brand + collapse button */}
        <div style={{ padding: collapsed ? '24px 0 16px' : '28px 24px 20px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', minWidth: 0 }}>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
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
                  whiteSpace: 'nowrap',
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
                  whiteSpace: 'nowrap',
                }}
              >
                {shift ? 'В СМЕНЕ' : 'НЕТ СМЕНЫ'}
              </p>
            </div>
          )}

          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
            style={{
              width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--on-surface-variant)', flexShrink: 0,
              transition: 'all 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: collapsed ? '0 12px 8px' : '0 16px 8px' }} />

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '8px 10px' : '8px 12px' }}>
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const active = pathname === href || (href !== '/pos' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: collapsed ? 0 : 12,
                  padding: collapsed ? '10px 0' : '10px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 12,
                  marginBottom: 2,
                  textDecoration: 'none',
                  background: active ? 'rgba(139,92,246,0.1)' : 'transparent',
                  borderRight: !collapsed && active ? '2px solid #8B5CF6' : '2px solid transparent',
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
                {!collapsed && (
                  <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: collapsed ? '12px 10px 24px' : '12px 12px 24px' }}>
          {BOTTOM_NAV.map(({ href, icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: collapsed ? 0 : 12,
                  padding: collapsed ? '10px 0' : '10px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
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
                {!collapsed && <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>}
              </Link>
            )
          })}

          {collapsed ? (
            <button
              onClick={() => closeShift.mutate({ cashEnd: 0 })}
              disabled={closeShift.isPending || !shift}
              title="Завершить смену"
              style={{
                width: '100%', padding: '10px 0', borderRadius: 14, border: 'none',
                cursor: shift ? 'pointer' : 'not-allowed',
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                opacity: shift ? 1 : 0.4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff', fontVariationSettings: "'FILL' 1" }}>
                stop_circle
              </span>
            </button>
          ) : (
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
                whiteSpace: 'nowrap',
              }}
            >
              ЗАВЕРШИТЬ СМЕНУ
            </button>
          )}
        </div>
      </aside>

      {/* Responsive show on desktop + adjust main layout margin */}
      <style>{`
        @media (min-width: 1024px) {
          .sidebar-root { display: flex !important; }
          .layout-main { margin-left: ${w}px; transition: margin-left 0.25s ease; }
        }
      `}</style>
    </>
  )
}
