/**
 * Сессия планшета: выбранное пространство хранится локально на устройстве.
 * Авторизация сотрудника (PIN) живёт в auth-store (staff-токен).
 * Сессия активна, когда есть И токен, И выбранное пространство.
 */
const KEY = 'titan_tablet_space'

export interface TabletSpace {
  id: string
  name: string
}

export function getTabletSpace(): TabletSpace | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TabletSpace) : null
  } catch {
    return null
  }
}

export function setTabletSpace(sp: TabletSpace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sp))
  } catch {
    /* ignore */
  }
}

export function clearTabletSpace(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
