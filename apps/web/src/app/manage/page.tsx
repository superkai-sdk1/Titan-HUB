'use client'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth.store'

interface NavItem {
  href: string
  label: string
  icon: string
  color: string
  bg: string
  roles: string[]
}

interface NavGroup {
  title: string
  icon: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: 'Продукт',
    icon: 'restaurant_menu',
    items: [
      { href: '/manage/menu',      label: 'Меню',      icon: 'restaurant_menu', color: '#F97316', bg: 'rgba(249,115,22,0.15)',  roles: ['owner','staff'] },
      { href: '/manage/inventory', label: 'Склад',     icon: 'inventory_2',     color: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  roles: ['owner','staff'] },
      { href: '/manage/supplies',  label: 'Поставки',  icon: 'local_shipping',  color: '#10B981', bg: 'rgba(16,185,129,0.15)', roles: ['owner','staff'] },
      { href: '/manage/revision',  label: 'Ревизия',   icon: 'fact_check',      color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', roles: ['owner','staff'] },
    ],
  },
  {
    title: 'Клиенты и продажи',
    icon: 'person',
    items: [
      { href: '/manage/clients',   label: 'Клиенты',   icon: 'person',          color: '#4cd7f6', bg: 'rgba(76,215,246,0.15)', roles: ['owner','staff'] },
      { href: '/manage/discounts', label: 'Скидки',    icon: 'percent',         color: '#F43F5E', bg: 'rgba(244,63,94,0.15)',  roles: ['owner'] },
      { href: '/manage/bonuses',   label: 'Бонусы',    icon: 'star',            color: '#EAB308', bg: 'rgba(234,179,8,0.15)',  roles: ['owner'] },
      { href: '/manage/refunds',   label: 'Возвраты',  icon: 'undo',            color: '#F87171', bg: 'rgba(248,113,113,0.15)',roles: ['owner','staff'] },
    ],
  },
  {
    title: 'Финансы',
    icon: 'account_balance_wallet',
    items: [
      { href: '/manage/certificates', label: 'Сертификаты', icon: 'card_giftcard',          color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  roles: ['owner','staff'] },
      { href: '/manage/cashops',      label: 'Инкассация',  icon: 'account_balance_wallet', color: '#14B8A6', bg: 'rgba(20,184,166,0.15)',  roles: ['owner','staff'] },
      { href: '/manage/expenses',     label: 'Расходы',     icon: 'receipt_long',           color: '#F43F5E', bg: 'rgba(244,63,94,0.15)',   roles: ['owner','staff'] },
      { href: '/manage/debtors',      label: 'Должники',    icon: 'money_off',              color: '#F97316', bg: 'rgba(249,115,22,0.15)',  roles: ['owner','staff'] },
    ],
  },
  {
    title: 'Персонал',
    icon: 'group',
    items: [
      { href: '/manage/staff',  label: 'Сотрудники', icon: 'group',    color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', roles: ['owner'] },
      { href: '/manage/salary', label: 'Зарплата',   icon: 'payments', color: '#10B981', bg: 'rgba(16,185,129,0.15)', roles: ['owner'] },
    ],
  },
  {
    title: 'Заведение',
    icon: 'store',
    items: [
      { href: '/manage/spaces', label: 'Зоны',       icon: 'table_bar', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', roles: ['owner','staff'] },
      { href: '/manage/events', label: 'Мероприятия',icon: 'event',     color: '#10B981', bg: 'rgba(16,185,129,0.15)', roles: ['owner','staff'] },
      { href: '/shifts',        label: 'Смены',      icon: 'schedule',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', roles: ['owner','staff'] },
    ],
  },
  {
    title: 'Система',
    icon: 'settings',
    items: [
      { href: '/manage/ai',       label: 'AI Помощник', icon: 'psychology', color: '#4cd7f6', bg: 'rgba(76,215,246,0.15)',   roles: ['owner','staff'] },
      { href: '/manage/settings', label: 'Настройки',   icon: 'settings',   color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', roles: ['owner'] },
      { href: '/manage/about',    label: 'О системе',   icon: 'info',       color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', roles: ['owner'] },
    ],
  },
]

function NavCard({ href, label, icon, color, bg }: { href: string; label: string; icon: string; color: string; bg: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        className="glass-l2"
        style={{
          borderRadius: 16, padding: '16px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', minHeight: 64,
          transition: 'transform 0.15s, border-color 0.2s, box-shadow 0.2s',
        }}
        onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(0.96)' }}
        onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = `${color}55`
          el.style.transform = 'translateY(-2px)'
          el.style.boxShadow = `0 8px 24px ${color}22`
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'rgba(255,255,255,0.08)'
          el.style.transform = 'translateY(0)'
          el.style.boxShadow = 'none'
        }}
      >
        <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', lineHeight: 1.25 }}>{label}</span>
      </div>
    </Link>
  )
}

export default function ManagePage() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const role = user?.role ?? 'staff'

  const roleLabel = role === 'owner' ? 'Владелец' : 'Персонал'
  const roleColor = role === 'owner' ? '#F59E0B' : '#8B5CF6'

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 680, margin: '0 auto' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Управление</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              Titan HUB
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* User chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 12, background: `${roleColor}15`, border: `1px solid ${roleColor}33` }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${roleColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: roleColor }}>
                {user?.nickname?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>{user?.nickname}</p>
                <p style={{ fontSize: 10, margin: 0, color: roleColor, fontFamily: "'JetBrains Mono',monospace" }}>{roleLabel}</p>
              </div>
            </div>
            <button onClick={logout} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {NAV.map(group => {
          const visibleItems = group.items.filter(i => i.roles.includes(role))
          if (visibleItems.length === 0) return null
          return (
            <div key={group.title}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{group.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)' }}>{group.title}</span>
                </div>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>
              {/* Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {visibleItems.map(item => (
                  <NavCard key={item.href} {...item} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
