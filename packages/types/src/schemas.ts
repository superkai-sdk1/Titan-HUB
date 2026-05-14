import { z } from 'zod'

export const LoginPinSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/),
  userId: z.string().uuid().optional(),
})

export const LoginPasswordSchema = z.object({
  nickname: z.string().min(1),
  password: z.string().min(1),
})

export const LoginTelegramSchema = z.object({
  initData: z.string().min(1),
})

export const SetPinSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/),
})

export const CreateCheckSchema = z.object({
  playerId: z.string().uuid().nullable(),
  staffId: z.string().uuid(),
  shiftId: z.string().uuid(),
  tariff: z.string().optional(),
  spaceId: z.string().uuid().optional(),
  guestNames: z.array(z.string()).optional(),
  note: z.string().optional(),
})

export const AddCartItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  modifierIds: z.array(z.string().uuid()).optional(),
})

export const PaymentSchema = z.object({
  checkId: z.string().uuid(),
  method: z.string(),
  bonusAmount: z.number().optional(),
  depositAmount: z.number().optional(),
  certificateCode: z.string().optional(),
  splitPayments: z
    .array(
      z.object({
        method: z.string(),
        amount: z.number().positive(),
      })
    )
    .optional(),
  remainderMethod: z.string().optional(),
})

export const CreateEventSchema = z.object({
  type: z.enum(['titan', 'exit']),
  location: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  paymentType: z.enum(['fixed', 'hourly']),
  fixedAmount: z.number().optional(),
  comment: z.string().optional(),
})

export const CreateClientSchema = z.object({
  nickname: z.string().min(1).max(50),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  clientTier: z.enum(['guest', 'resident', 'student']).default('guest'),
  searchTags: z.array(z.string()).optional(),
})

export const CreateInventoryItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().uuid().optional(),
  price: z.number().nonnegative(),
  costPrice: z.number().nonnegative().optional(),
  stockQuantity: z.number().int().nonnegative().default(0),
  minThreshold: z.number().int().nonnegative().optional(),
  trackStock: z.boolean().default(false),
  isService: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isTop: z.boolean().default(false),
  isTabletVisible: z.boolean().default(false),
  searchTags: z.array(z.string()).optional(),
  sortOrder: z.number().int().default(0),
  linkedSpaceId: z.string().uuid().optional(),
})

export const OpenShiftSchema = z.object({
  cashStart: z.number().nonnegative(),
  eveningType: z
    .enum(['sport_mafia', 'city_mafia', 'kids_mafia', 'board_games', 'none'])
    .default('none'),
})

export const CloseShiftSchema = z.object({
  cashEnd: z.number().nonnegative(),
  note: z.string().optional(),
})

export const AiActionSchema = z.object({
  action: z.enum([
    'create_check',
    'add_items',
    'close_check',
    'create_event',
    'list_events',
    'update_event',
    'client_report',
    'list_menu',
    'list_players',
    'report_today',
    'list_debtors',
    'open_checks',
    'stock_alert',
    'salary_estimate',
    'supply_summary',
    'expense_summary',
  ]),
  payload: z.record(z.unknown()).optional(),
})

export type LoginPinInput = z.infer<typeof LoginPinSchema>
export type LoginPasswordInput = z.infer<typeof LoginPasswordSchema>
export type CreateCheckInput = z.infer<typeof CreateCheckSchema>
export type AddCartItemInput = z.infer<typeof AddCartItemSchema>
export type PaymentInput = z.infer<typeof PaymentSchema>
export type CreateEventInput = z.infer<typeof CreateEventSchema>
export type CreateClientInput = z.infer<typeof CreateClientSchema>
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>
export type OpenShiftInput = z.infer<typeof OpenShiftSchema>
export type CloseShiftInput = z.infer<typeof CloseShiftSchema>
export type AiActionInput = z.infer<typeof AiActionSchema>
