// Единый источник правды для навигации (Sidebar + BottomNav).
// Раньше списки/подписи/логика active дублировались и расходились.

export interface NavItem {
  href: string
  icon: string
  label: string
  /** Короткая подпись для нижней панели (узкие слоты). По умолчанию = label. */
  short?: string
}

export const NAV_PRIMARY: NavItem[] = [
  { href: '/pos',       icon: 'point_of_sale', label: 'Касса' },
  { href: '/events',    icon: 'event',         label: 'События' },
  { href: '/dashboard', icon: 'bar_chart',     label: 'Аналитика', short: 'Отчёты' },
  { href: '/manage',    icon: 'settings',      label: 'Управление', short: 'Меню' },
]

export const NAV_SHIFTS: NavItem = { href: '/shifts', icon: 'schedule', label: 'Смены' }

/** Единая логика подсветки активного пункта. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/pos') return pathname === '/pos' || pathname.startsWith('/pos/')
  return pathname === href || pathname.startsWith(href + '/')
}
