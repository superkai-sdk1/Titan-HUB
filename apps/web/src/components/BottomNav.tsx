'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'

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
        justifyContent: 'center',
        gap: 3,
        padding: '10px 0',
        minHeight: 48,
        textDecoration: 'none',
        position: 'relative',
        borderRadius: 9999,
        transition: 'all 0.2s',
      }}
    >
      <Icon
        name={icon}
        size={24}
        color={active ? '#8B5CF6' : 'var(--on-surface-variant)'}
        style={{ transition: 'all 0.2s' }}
      />
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
      <nav
        className="bottom-nav-root"
        style={{
          position: 'fixed',
          // Плавающий «остров»: отступ снизу = home indicator + небольшой зазор.
          // В standalone-PWA значение переопределяется в globals.css (учёт
          // зарезервированной нижней зоны через 100svh - 100lvh).
          bottom: 'calc(env(safe-area-inset-bottom) + 6px)',
          left: 14,
          right: 14,
          zIndex: 40,
          background: 'rgba(24, 20, 32, 0.7)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 28,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 10,
          paddingRight: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
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
          <Icon name="add" size={26} color="#fff" />
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
