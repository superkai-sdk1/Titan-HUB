'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'

interface Section {
  href: string
  label: string
  icon: string
  color: string
  bg: string
  roles: string[]
}

const SECTIONS: Section[] = [
  // Продукт
  { href: '/manage/menu',        label: 'Меню',         icon: 'restaurant_menu',    color: '#F97316', bg: 'rgba(249,115,22,0.15)',  roles: ['owner', 'staff'] },
  { href: '/manage/inventory',   label: 'Склад',        icon: 'inventory_2',        color: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  roles: ['owner', 'staff'] },
  { href: '/manage/supplies',    label: 'Поставки',     icon: 'local_shipping',     color: '#10B981', bg: 'rgba(16,185,129,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/revision',    label: 'Ревизия',      icon: 'fact_check',         color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', roles: ['owner', 'staff'] },
  // Клиенты
  { href: '/manage/clients',     label: 'Клиенты',      icon: 'person',             color: '#4cd7f6', bg: 'rgba(76,215,246,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/modifiers',   label: 'Модификаторы', icon: 'tune',               color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/discounts',   label: 'Скидки',       icon: 'percent',            color: '#F43F5E', bg: 'rgba(244,63,94,0.15)',  roles: ['owner'] },
  { href: '/manage/bonuses',     label: 'Бонусы',       icon: 'star',               color: '#EAB308', bg: 'rgba(234,179,8,0.15)',  roles: ['owner'] },
  // Финансы
  { href: '/manage/certificates',label: 'Сертификаты',  icon: 'card_giftcard',      color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/cashops',     label: 'Инкассация',   icon: 'account_balance_wallet', color: '#14B8A6', bg: 'rgba(20,184,166,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/expenses',    label: 'Расходы',      icon: 'receipt_long',       color: '#F43F5E', bg: 'rgba(244,63,94,0.15)',  roles: ['owner', 'staff'] },
  { href: '/manage/debtors',     label: 'Должники',     icon: 'money_off',          color: '#F97316', bg: 'rgba(249,115,22,0.15)', roles: ['owner', 'staff'] },
  // Персонал
  { href: '/manage/staff',       label: 'Персонал',     icon: 'group',              color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', roles: ['owner'] },
  { href: '/manage/salary',      label: 'Зарплата',     icon: 'payments',           color: '#10B981', bg: 'rgba(16,185,129,0.15)', roles: ['owner'] },
  // Прочее
  { href: '/manage/spaces',      label: 'Зоны',         icon: 'table_bar',          color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/events',      label: 'Мероприятия',  icon: 'event',              color: '#10B981', bg: 'rgba(16,185,129,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/refunds',     label: 'Возвраты',     icon: 'undo',               color: '#F87171', bg: 'rgba(248,113,113,0.15)', roles: ['owner', 'staff'] },
  { href: '/shifts',             label: 'Смены',        icon: 'schedule',           color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/ai',          label: 'AI Помощник',  icon: 'psychology',         color: '#4cd7f6', bg: 'rgba(76,215,246,0.15)', roles: ['owner', 'staff'] },
  { href: '/manage/settings',    label: 'Настройки',    icon: 'settings',           color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', roles: ['owner'] },
  { href: '/manage/about',       label: 'О системе',    icon: 'info',               color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', roles: ['owner'] },
]

export default function ManagePage() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const router = useRouter()
  const role = user?.role ?? 'staff'

  const sections = SECTIONS.filter(s => s.roles.includes(role))

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(21,18,27,0.95)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Меню</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {user?.nickname} · {role === 'owner' ? 'Владелец' : 'Персонал'}
            </p>
          </div>
          <button
            onClick={logout}
            style={{
              width: 38, height: 38, borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--on-surface-variant)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        padding: '16px 16px 100px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        flex: 1,
      }}>
        {sections.map(({ href, label, icon, color, bg }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div
              className="glass-l2"
              style={{
                borderRadius: 18,
                padding: '18px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
                transition: 'transform 0.15s, border-color 0.2s',
                minHeight: 72,
              }}
              onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(0.97)' }}
              onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = `${color}44`
                ;(e.currentTarget as HTMLDivElement).style.transform = 'scale(0.97)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'
                ;(e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'
              }}
            >
              {/* Icon */}
              <div style={{
                width: 46, height: 46, borderRadius: 14,
                background: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color, fontVariationSettings: "'FILL' 1" }}>
                  {icon}
                </span>
              </div>

              {/* Label */}
              <span style={{
                fontSize: 14, fontWeight: 600,
                color: 'var(--on-surface)',
                lineHeight: 1.25,
              }}>
                {label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
