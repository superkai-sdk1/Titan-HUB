'use client'
// ─── Локальные UI-примитивы экрана суперадмина ────────────────────────────────
// Инлайн-стили в духе login/page.tsx и DesignSystem — без внешних UI-библиотек,
// чтобы вид совпадал с остальным проектом (тёмная тема, один violet-акцент).
import React from 'react'
import { Icon } from '@/components/Icon'

export const ACCENT = '#8B5CF6'

// ── Поля ввода (зеркало fieldInputStyle/INP) ───────────────────────────────────

export const saInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

export const saSelectStyle: React.CSSProperties = {
  ...saInputStyle,
  background: 'rgba(29,26,36,0.9)',
  cursor: 'pointer',
}

export function SaField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(167,139,250,0.8)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '6px 2px 0', lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  )
}

// ── Текстовый инпут с фокус-стилем ─────────────────────────────────────────────

export const SaInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function SaInput(props, ref) {
    const { style, onFocus, onBlur, ...rest } = props
    return (
      <input
        ref={ref}
        {...rest}
        style={{ ...saInputStyle, ...style }}
        onFocus={(e) => {
          e.target.style.borderColor = 'rgba(139,92,246,0.6)'
          onFocus?.(e)
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(255,255,255,0.1)'
          onBlur?.(e)
        }}
      />
    )
  },
)

// ── Основная кнопка (градиентная, как «Войти») ─────────────────────────────────

export function SaPrimaryButton({
  children,
  loading,
  disabled,
  icon,
  onClick,
  type = 'button',
  style,
}: {
  children: React.ReactNode
  loading?: boolean
  disabled?: boolean
  icon?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  style?: React.CSSProperties
}) {
  const off = loading || disabled
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      style={{
        width: '100%',
        padding: '14px',
        borderRadius: 14,
        border: 'none',
        cursor: off ? 'not-allowed' : 'pointer',
        background: off ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
        color: off ? 'rgba(255,255,255,0.3)' : '#fff',
        fontWeight: 700,
        fontSize: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        transition: 'all 0.2s',
        boxShadow: off ? 'none' : '0 4px 20px rgba(139,92,246,0.35)',
        ...style,
      }}
    >
      {icon && !loading && <Icon name={icon} size={20} />}
      {children}
    </button>
  )
}

// ── Вторичная / опасная кнопка ─────────────────────────────────────────────────

export function SaButton({
  children,
  onClick,
  variant = 'secondary',
  icon,
  disabled,
  type = 'button',
  style,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'secondary' | 'danger' | 'ghost'
  icon?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  style?: React.CSSProperties
}) {
  const base: React.CSSProperties =
    variant === 'danger'
      ? { background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }
      : variant === 'ghost'
        ? { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid transparent' }
        : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.12)' }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '11px 16px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        fontSize: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.55 : 1,
        transition: 'all 0.2s',
        ...base,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

// ── Баннер ошибки (как в login) ────────────────────────────────────────────────

export function SaErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.25)',
        color: '#FCA5A5',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Icon name="error" size={16} />
      {message}
    </div>
  )
}

// ── Бейдж статуса ──────────────────────────────────────────────────────────────

export function SaBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const c =
    tone === 'ok'
      ? { bg: 'rgba(52,211,153,0.12)', fg: '#34D399', bd: 'rgba(52,211,153,0.28)' }
      : tone === 'warn'
        ? { bg: 'rgba(251,191,36,0.12)', fg: '#FBBF24', bd: 'rgba(251,191,36,0.28)' }
        : tone === 'danger'
          ? { bg: 'rgba(244,63,94,0.12)', fg: '#FB7185', bd: 'rgba(244,63,94,0.28)' }
          : { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.6)', bd: 'rgba(255,255,255,0.12)' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ── Centered spinner ───────────────────────────────────────────────────────────

export function SaSpinner({ label }: { label?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '64px 24px',
        minHeight: 200,
      }}
    >
      <Icon name="progress_activity" size={40} color="#a78bfa" style={{ animation: 'sa-spin 1.1s linear infinite' }} />
      {label && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{label}</p>}
      <style>{`@keyframes sa-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Статус подписки → tone бейджа + русская подпись ─────────────────────────────

export function subStatusView(status: string | null | undefined): { tone: 'ok' | 'warn' | 'danger' | 'neutral'; label: string } {
  switch (status) {
    case 'active':
      return { tone: 'ok', label: 'Активна' }
    case 'trial':
      return { tone: 'warn', label: 'Триал' }
    case 'expired':
      return { tone: 'danger', label: 'Истекла' }
    case 'suspended':
      return { tone: 'danger', label: 'Приостановлена' }
    case 'canceled':
    case 'cancelled':
      return { tone: 'neutral', label: 'Отменена' }
    default:
      return { tone: 'neutral', label: status ? status : 'Нет подписки' }
  }
}

export function clubStatusView(status: string | null | undefined): { tone: 'ok' | 'warn' | 'danger' | 'neutral'; label: string } {
  switch (status) {
    case 'active':
      return { tone: 'ok', label: 'Активен' }
    case 'suspended':
      return { tone: 'danger', label: 'Приостановлен' }
    case 'deleted':
      return { tone: 'danger', label: 'Удалён' }
    case 'pending':
      return { tone: 'warn', label: 'Ожидание' }
    default:
      return { tone: 'neutral', label: status ?? '—' }
  }
}

// ── Относительный срок подписки (для ручного биллинга) ──────────────────────────
// Сколько осталось / грейс / просрочка. Логика синхронна бэкенду (lib/subscription:
// грейс 3 дня, «скоро» ≤ 5 дней). Бессрочную владельческую (+100 лет) показываем
// как «Бессрочно», а не «Осталось 36500 дн.».
export function subscriptionExpiryView(
  paidUntil: string | null | undefined,
  subStatus?: string | null,
): { tone: 'ok' | 'warn' | 'danger' | 'neutral'; label: string } {
  if (subStatus === 'suspended') return { tone: 'danger', label: 'Приостановлена' }
  if (!paidUntil) return { tone: 'neutral', label: 'Срок не задан' }
  const paid = new Date(paidUntil).getTime()
  if (Number.isNaN(paid)) return { tone: 'neutral', label: 'Срок не задан' }
  const DAY = 86_400_000
  const now = Date.now()
  const left = Math.floor((paid - now) / DAY)
  if (now <= paid) {
    if (left > 3000) return { tone: 'ok', label: 'Бессрочно' }
    if (left <= 5) return { tone: 'warn', label: left <= 0 ? 'Истекает сегодня' : `Истекает через ${left} дн.` }
    return { tone: 'ok', label: `Осталось ${left} дн.` }
  }
  const over = Math.floor((now - paid) / DAY)
  if (now <= paid + 3 * DAY) return { tone: 'warn', label: `Грейс · истекла ${over} дн. назад` }
  return { tone: 'danger', label: `Просрочена ${over} дн. назад` }
}

// ── Формат даты ────────────────────────────────────────────────────────────────

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}
