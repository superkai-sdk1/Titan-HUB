// Денежные/форматирующие хелперы и общие типы кошелька.
// Вынесено из page.tsx БЕЗ изменения логики — чистые функции, пригодны для тестов.

export interface UserProfile {
  id: string
  nickname: string
  balance: number
  bonusPoints: number
  tier: string
  fullName: string
  phone: string
  birthday: string
  photoUrl: string | null
  tgPhotoUrl: string | null
  gomafiaPhotoUrl: string | null
}

export interface Transaction {
  id: string
  type: string
  description: string
  amount: number
  createdAt: string
  checkId: string | null
}
export interface BonusRow { id: string; amount: number; reason: string | null; createdAt: string }
export interface BonusLot { amount: number; remaining: number; expiresAt: string | null }
export interface VisitProgress { tier: string; visits: number; threshold: number; remaining: number; isResident: boolean }
export interface FeedItem { id: string; date: string; emoji: string; label: string; sign: 1 | -1; amount: number; unit: '₽' | '⭐'; checkId?: string | null }
export interface CheckDetail { check: { id: string; totalAmount: number; tipAmount?: number; createdAt: string; closedAt: string | null }; items: { name: string; quantity: number; priceAtTime: number; lineTotal: number }[]; payments: { method: string; amount: number }[]; discounts: { name: string | null; amount: number }[] }
export interface PayInfo { sbpReady: boolean; provider: string; fund: { available: boolean; name?: string; suggested?: number } }

export const TIER_COLORS: Record<string, string> = {
  guest: '#94A3B8', resident: '#8B5CF6', student: '#F59E0B',
  bronze: '#cd7f32', silver: '#94A3B8', gold: '#F59E0B', platinum: '#E2E8F0',
}
export const TIER_LABELS: Record<string, string> = {
  guest: 'Гость', resident: 'Резидент', student: 'Студент',
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина',
}
export const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'СБП', bonus: 'Бонусы',
  deposit: 'Депозит', debt: 'Долг', certificate: 'Сертификат', split: 'Раздельная',
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr))
}
export function getTransactionEmoji(type: string): string {
  switch (type) {
    case 'deposit': return '💳'
    case 'payment': return '🛒'
    case 'refund': return '↩️'
    case 'withdrawal': return '💸'
    case 'bonus_accrual': return '⭐'
    case 'bonus_spend': return '🔄'
    default: return '💰'
  }
}
export function isPositive(type: string): boolean {
  return type === 'deposit' || type === 'refund' || type === 'bonus_accrual'
}
export function nearestExpiringLot(lots: BonusLot[]): { remaining: number; expiresAt: Date } | null {
  const now = Date.now()
  let best: { remaining: number; expiresAt: Date } | null = null
  for (const lot of lots) {
    if (!lot || !(Number(lot.remaining) > 0) || !lot.expiresAt) continue
    const ts = new Date(lot.expiresAt).getTime()
    if (!Number.isFinite(ts) || ts <= now) continue
    if (!best || ts < best.expiresAt.getTime()) best = { remaining: Number(lot.remaining), expiresAt: new Date(ts) }
  }
  return best
}
export function formatExpiryDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date)
}
export function pluralVisits(n: number): string {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return 'посещений'
  if (b > 1 && b < 5) return 'посещения'
  if (b === 1) return 'посещение'
  return 'посещений'
}
