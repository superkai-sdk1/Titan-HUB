export const Role = {
  OWNER: 'owner',
  STAFF: 'staff',
  TABLET: 'tablet',
  CLIENT: 'client',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export const ClientTier = {
  GUEST: 'guest',
  RESIDENT: 'resident',
  STUDENT: 'student',
} as const
export type ClientTier = (typeof ClientTier)[keyof typeof ClientTier]

export const ShiftStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus]

export const EveningType = {
  SPORT_MAFIA: 'sport_mafia',
  CITY_MAFIA: 'city_mafia',
  KIDS_MAFIA: 'kids_mafia',
  BOARD_GAMES: 'board_games',
  NONE: 'none',
} as const
export type EveningType = (typeof EveningType)[keyof typeof EveningType]

export const CheckStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const
export type CheckStatus = (typeof CheckStatus)[keyof typeof CheckStatus]

export const PaymentMethod = {
  CASH: 'cash',
  CARD: 'card',
  BONUS: 'bonus',
  DEPOSIT: 'deposit',
  DEBT: 'debt',
  SPLIT: 'split',
  CERTIFICATE: 'certificate',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const DiscountType = {
  PERCENT: 'percent',
  FIXED: 'fixed',
} as const
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType]

export const DiscountTarget = {
  CHECK: 'check',
  ITEM: 'item',
} as const
export type DiscountTarget = (typeof DiscountTarget)[keyof typeof DiscountTarget]

export const EventType = {
  TITAN: 'titan',
  EXIT: 'exit',
} as const
export type EventType = (typeof EventType)[keyof typeof EventType]

export const EventStatus = {
  PLANNED: 'planned',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus]

export const EventPaymentType = {
  FIXED: 'fixed',
  HOURLY: 'hourly',
} as const
export type EventPaymentType = (typeof EventPaymentType)[keyof typeof EventPaymentType]

export const SpaceType = {
  SMALL_BOOTH: 'small_booth',
  LARGE_BOOTH: 'large_booth',
  HALL: 'hall',
} as const
export type SpaceType = (typeof SpaceType)[keyof typeof SpaceType]

export const CashOperationType = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  SALARY: 'salary',
} as const
export type CashOperationType = (typeof CashOperationType)[keyof typeof CashOperationType]

export const RefundType = {
  FULL: 'full',
  PARTIAL: 'partial',
} as const
export type RefundType = (typeof RefundType)[keyof typeof RefundType]

export const RefundReason = {
  RETURN: 'return',
  EXCHANGE: 'exchange',
  DISCOUNT: 'discount',
  DAMAGE: 'damage',
} as const
export type RefundReason = (typeof RefundReason)[keyof typeof RefundReason]

export const TransactionType = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  PAYMENT: 'payment',
  REFUND: 'refund',
  BONUS_ACCRUAL: 'bonus_accrual',
  BONUS_SPEND: 'bonus_spend',
} as const
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType]

export const TgLinkStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const
export type TgLinkStatus = (typeof TgLinkStatus)[keyof typeof TgLinkStatus]

export const NotificationChannel = {
  TELEGRAM: 'telegram',
  PWA: 'pwa',
  BOTH: 'both',
} as const
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel]

export const AdminNotificationType = {
  SHIFT_OPENED: 'shift_opened',
  SHIFT_CLOSED: 'shift_closed',
  PAYMENT_CARD: 'payment_card',
  PAYMENT_CASH: 'payment_cash',
  LOW_STOCK: 'low_stock',
  NEW_CLIENT: 'new_client',
  TABLET_ORDER: 'tablet_order',
  EVENT_REMINDER: 'event_reminder',
  BIRTHDAY: 'birthday',
  DEBT_PAYMENT: 'debt_payment',
} as const
export type AdminNotificationType = (typeof AdminNotificationType)[keyof typeof AdminNotificationType]

export const PlayerSegment = {
  NEW: 'new',
  ACTIVE: 'active',
  SLEEPING: 'sleeping',
} as const
export type PlayerSegment = (typeof PlayerSegment)[keyof typeof PlayerSegment]

export const PlayerTariff = {
  REGULAR: 'regular',
  RESIDENT: 'resident',
  STUDENT: 'student',
  ONE_GAME: 'one_game',
} as const
export type PlayerTariff = (typeof PlayerTariff)[keyof typeof PlayerTariff]
