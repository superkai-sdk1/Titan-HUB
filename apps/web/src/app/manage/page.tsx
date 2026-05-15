'use client'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth.store'

const ALL_SECTIONS = [
  { href: '/manage/menu', label: 'Меню', icon: 'restaurant_menu', roles: ['owner', 'staff'], color: '#8B5CF6' },
  { href: '/manage/inventory', label: 'Остатки', icon: 'inventory', roles: ['owner', 'staff'], color: '#10B981' },
  { href: '/manage/clients', label: 'Клиенты', icon: 'group', roles: ['owner', 'staff'], color: '#4cd7f6' },
  { href: '/manage/debtors', label: 'Должники', icon: 'money_off', roles: ['owner', 'staff'], color: '#F43F5E' },
  { href: '/manage/events', label: 'События', icon: 'event', roles: ['owner', 'staff'], color: '#10B981' },
  { href: '/manage/spaces', label: 'Зоны', icon: 'table_bar', roles: ['owner', 'staff'], color: '#F59E0B' },
  { href: '/manage/supplies', label: 'Закупки', icon: 'inventory_2', roles: ['owner', 'staff'], color: '#3B82F6' },
  { href: '/manage/expenses', label: 'Расходы', icon: 'receipt_long', roles: ['owner', 'staff'], color: '#F43F5E' },
  { href: '/manage/cashops', label: 'Инкассация', icon: 'account_balance', roles: ['owner', 'staff'], color: '#F59E0B' },
  { href: '/manage/certificates', label: 'Сертификаты', icon: 'card_giftcard', roles: ['owner', 'staff'], color: '#10B981' },
  { href: '/manage/discounts', label: 'Скидки', icon: 'discount', roles: ['owner'], color: '#A78BFA' },
  { href: '/manage/salary', label: 'Зарплата', icon: 'payments', roles: ['owner'], color: '#F59E0B' },
  { href: '/manage/refunds', label: 'Возвраты', icon: 'undo', roles: ['owner', 'staff'], color: '#F87171' },
  { href: '/shifts', label: 'Смены', icon: 'schedule', roles: ['owner', 'staff'], color: '#8B5CF6' },
  { href: '/manage/notifications', label: 'Уведомления', icon: 'notifications', roles: ['owner', 'staff'], color: '#4cd7f6' },
  { href: '/manage/staff', label: 'Персонал', icon: 'badge', roles: ['owner'], color: '#A78BFA' },
  { href: '/manage/ai', label: 'AI Помощник', icon: 'psychology', roles: ['owner', 'staff'], color: '#4cd7f6' },
  { href: '/manage/settings', label: 'Настройки', icon: 'settings', roles: ['owner'], color: '#94A3B8' },
  { href: '/manage/about', label: 'О системе', icon: 'info', roles: ['owner'], color: '#94A3B8' },
]

export default function ManagePage() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const role = user?.role ?? 'staff'

  const sections = ALL_SECTIONS.filter(s => s.roles.includes(role))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Управление</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
              {user?.nickname} · {role === 'owner' ? 'Владелец' : 'Персонал'}
            </p>
          </div>
          <button onClick={logout} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {sections.map(({ href, label, icon, color }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div className="glass-l2" style={{ borderRadius: 18, padding: '20px 12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'border-color 0.2s, transform 0.15s', userSelect: 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${color}55`; (e.currentTarget as HTMLDivElement).style.transform = 'scale(0.97)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color }}>{icon}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
