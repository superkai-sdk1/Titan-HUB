import { styles } from './styles'

export type Tab = 'feed' | 'pay' | 'profile'

// ─── Иконки нижней навигации (inline SVG, stroke=currentColor) ─────────────────
const ICON_FEED = (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></>)
const ICON_PAY = (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>)
const ICON_PROFILE = (<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></>)

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'feed', label: 'Лента', icon: ICON_FEED },
  { id: 'pay', label: 'Оплата', icon: ICON_PAY },
  { id: 'profile', label: 'Профиль', icon: ICON_PROFILE },
]

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav style={styles.bottomNav} aria-label="Основная навигация">
      {TABS.map(t => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={t.label}
            style={{ ...styles.navBtn, color: active ? '#a78bfa' : '#94A3B8' }}
          >
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{t.icon}</svg>
            <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
