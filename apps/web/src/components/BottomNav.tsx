'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const LEFT_ITEMS = [
  { href: '/pos',    icon: 'point_of_sale', label: 'Касса' },
  { href: '/events', icon: 'event',         label: 'События' },
]
const RIGHT_ITEMS = [
  { href: '/dashboard', icon: 'bar_chart', label: 'Отчёты' },
  { href: '/manage',    icon: 'settings',  label: 'Меню' },
]

function NavItem({ href, icon, label, pathname }: { href: string; icon: string; label: string; pathname: string }) {
  const active =
    href === '/pos'
      ? pathname === '/pos' || pathname.startsWith('/pos/')
      : href === '/manage'
      ? pathname.startsWith('/manage')
      : pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
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
}

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname === '/login') return null
  if (pathname.startsWith('/tablet')) return null

  function handleFAB() {
    const onPOS = pathname === '/pos' || pathname.startsWith('/pos/')
    if (onPOS) {
      window.dispatchEvent(new CustomEvent('titan:new-check'))
    } else {
      router.push('/pos')
    }
  }

  return (
    <>
      {/* Safe-area fill — закрывает тёмную полосу под плавающим навбаром */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'env(safe-area-inset-bottom)',
        background: 'rgba(15, 12, 20, 0.96)',
        zIndex: 39,
        pointerEvents: 'none',
      }} />

      <nav
        className="bottom-nav-root"
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom) + 8px)',
          left: 12,
          right: 12,
          zIndex: 40,
          background: 'rgba(29, 24, 40, 0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 9999,
          boxShadow: '0 4px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px',
          gap: 0,
        }}
      >
        {/* LEFT tabs */}
        {LEFT_ITEMS.map(item => (
          <NavItem key={item.href} {...item} pathname={pathname} />
        ))}

        {/* CENTER FAB */}
        <button
          onClick={handleFAB}
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
            boxShadow: '0 4px 20px rgba(139,92,246,0.5), 0 0 0 3px rgba(29,26,36,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            top: -14,
            zIndex: 1,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08)'
            e.currentTarget.style.boxShadow = '0 6px 28px rgba(139,92,246,0.7), 0 0 0 3px rgba(29,26,36,0.8)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(139,92,246,0.5), 0 0 0 3px rgba(29,26,36,0.8)'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#fff', fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24" }}>add</span>
        </button>

        {/* RIGHT tabs */}
        {RIGHT_ITEMS.map(item => (
          <NavItem key={item.href} {...item} pathname={pathname} />
        ))}
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
