'use client'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth.store'
import {
  UtensilsCrossed, Users, Calendar, MapPin, Package,
  Receipt, Gift, DollarSign, RotateCcw, Bell, UserCog,
  Bot, Settings, LogOut, Clock
} from 'lucide-react'

const ALL_SECTIONS = [
  { href: '/manage/menu', label: 'Меню', Icon: UtensilsCrossed, roles: ['owner', 'staff'] },
  { href: '/manage/clients', label: 'Клиенты', Icon: Users, roles: ['owner', 'staff'] },
  { href: '/manage/events', label: 'События', Icon: Calendar, roles: ['owner', 'staff'] },
  { href: '/manage/spaces', label: 'Зоны', Icon: MapPin, roles: ['owner', 'staff'] },
  { href: '/manage/supplies', label: 'Поставки', Icon: Package, roles: ['owner', 'staff'] },
  { href: '/manage/expenses', label: 'Расходы', Icon: Receipt, roles: ['owner', 'staff'] },
  { href: '/manage/certificates', label: 'Сертификаты', Icon: Gift, roles: ['owner', 'staff'] },
  { href: '/manage/salary', label: 'Зарплата', Icon: DollarSign, roles: ['owner'] },
  { href: '/manage/refunds', label: 'Возвраты', Icon: RotateCcw, roles: ['owner', 'staff'] },
  { href: '/shifts', label: 'Смены', Icon: Clock, roles: ['owner', 'staff'] },
  { href: '/manage/notifications', label: 'Уведомления', Icon: Bell, roles: ['owner', 'staff'] },
  { href: '/manage/staff', label: 'Персонал', Icon: UserCog, roles: ['owner'] },
  { href: '/manage/ai', label: 'AI Помощник', Icon: Bot, roles: ['owner', 'staff'] },
  { href: '/manage/settings', label: 'Настройки', Icon: Settings, roles: ['owner'] },
]

export default function ManagePage() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const role = user?.role ?? 'staff'

  const sections = ALL_SECTIONS.filter(s => s.roles.includes(role))

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30 px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Управление</h1>
            <p className="text-xs text-muted-foreground">{user?.nickname} · {role}</p>
          </div>
          <button onClick={logout} className="p-2 text-muted-foreground">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 grid grid-cols-3 gap-3">
        {sections.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-surface border border-border active:scale-95 transition-transform">
            <Icon size={24} className="text-primary" strokeWidth={1.5} />
            <span className="text-xs text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
