export const PERMISSIONS = [
  'can_give_discount',
  'can_view_finance',
  'can_manage_menu',
  'can_manage_clients',
  'can_manage_staff',
  'can_manage_supplies',
  'can_manage_expenses',
  'can_view_analytics',
  'can_process_refunds',
  'can_manage_events',
  'can_manage_certificates',
  'can_manage_salary',
  'can_cash_operations',
  'can_view_reports',
  'can_manage_spaces',
] as const

export type Permission = (typeof PERMISSIONS)[number]
export type UserPermissions = Partial<Record<Permission, boolean>>
