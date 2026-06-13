// ─── Типы ответов API суперадмина ─────────────────────────────────────────────
// База /api/superadmin (через saApi уже с префиксом).

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface BootstrapStatus {
  needsBootstrap: boolean
}

export interface BootstrapResult {
  token: string
  needsPasskey: true
}

export interface PasskeyRegisterVerifyResult {
  ok: true
}

// POST /auth/login/password → один из двух вариантов:
//   • { token, needsPasskey:true } — пароль верный, пасскеев ещё нет → регистрация;
//   • { needsPasskey:true, challengeId, options } — есть пасскеи → 2-й фактор.
export interface LoginPasswordTokenResult {
  token: string
  needsPasskey: true
  challengeId?: undefined
  options?: undefined
}
export interface LoginPasswordChallengeResult {
  token?: undefined
  needsPasskey: true
  challengeId: string
  options: PublicKeyCredentialRequestOptionsJSON
}
export type LoginPasswordResult = LoginPasswordTokenResult | LoginPasswordChallengeResult

export interface LoginPasskeyVerifyResult {
  token: string
  superadmin?: unknown
}

export type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON }

// ── Clubs ───────────────────────────────────────────────────────────────────

export interface ClubListItem {
  id: string
  slug: string
  name: string
  dbName: string
  subdomain: string | null
  status: string
  createdAt: string | null
  subStatus: string | null
  subPeriod: string | null
  subPaidUntil: string | null
}

export interface ClubsResponse {
  clubs: ClubListItem[]
}

export interface ClubModule {
  moduleKey: string
  enabled: boolean
}

export interface ClubSubscription {
  status: string | null
  period: string | null
  paidUntil: string | null
  amount?: number | string | null
  [k: string]: unknown
}

export interface ClubDetailResponse {
  club: ClubListItem
  modules: ClubModule[]
  subscription: ClubSubscription | null
}

export interface CreateClubResult {
  club: ClubListItem
}

export interface ModulePatchResult {
  module: ClubModule
}

export interface SubscriptionResult {
  subscription: ClubSubscription
  payment: unknown
}

export interface DeleteClubResult {
  club: ClubListItem
}

// ── Сводки (дашборд) ──────────────────────────────────────────────────────────

export interface RecentPayment {
  clubId: string
  amount: string | null
  period: string | null
  method: string
  paidAt: string | null
  clubName: string | null
  clubSlug: string | null
}

export interface PlatformOverview {
  clubs: { total: number; active: number; suspended: number; deleted: number; trial: number }
  subscriptions: { expiringSoon: number; overdue: number }
  revenueMonth: number
  recentPayments: RecentPayment[]
}

export interface ClubOverview {
  today: { checks: number; revenue: number }
  month: { checks: number; revenue: number }
  openChecks: number
  clients: number
  staff: number
  shiftOpen: boolean
  lastActivity: string | null
}

export interface ClubProfileResponse {
  profile: { venue_name: string; venue_address: string; business_day_start_hour: string }
  owners: { id: string; nickname: string }[]
}

// Периоды подписки (контракт POST /clubs/:id/subscription).
export type SubPeriod = '1m' | '3m' | '6m' | '12m' | 'trial_7d'

export const SUB_PERIODS: { value: SubPeriod; label: string }[] = [
  { value: 'trial_7d', label: 'Триал · 7 дней' },
  { value: '1m', label: '1 месяц' },
  { value: '3m', label: '3 месяца' },
  { value: '6m', label: '6 месяцев' },
  { value: '12m', label: '12 месяцев' },
]
