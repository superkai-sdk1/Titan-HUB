'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, BarChart2, Grid3X3 } from 'lucide-react'

const NAV = [
  { href: '/pos', label: 'Касса', Icon: ShoppingCart },
  { href: '/dashboard', label: 'Аналитика', Icon: BarChart2 },
  { href: '/manage', label: 'Управление', Icon: Grid3X3 },
]

export function BottomNav() {
  const pathname = usePathname()
  if (pathname === '/login') return null
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-border safe-bottom z-40">
      <div className="flex">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${active ? 'text-primary' : 'text-muted'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
