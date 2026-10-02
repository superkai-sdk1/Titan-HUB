'use client'
import { Icon } from '@/components/Icon'

/**
 * Кнопка «на экране ТВ»: добавляет позицию/тариф/зону на экран меню (/menu, AbleSign)
 * или убирает с него. Включено — фиолетовый телевизор; выключено — перечёркнутый серый.
 */
export function ScreenToggle({ on, onToggle, disabled, size = 28 }: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
  size?: number
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle() }}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      aria-pressed={on}
      aria-label={on ? 'Убрать с экрана ТВ' : 'Показать на экране ТВ'}
      title={on ? 'На экране ТВ — нажмите, чтобы убрать' : 'Нет на экране ТВ — нажмите, чтобы показать'}
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.29), flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${on ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.1)'}`,
        background: on ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
        color: on ? '#a78bfa' : 'rgba(204,195,216,0.45)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'background .15s, border-color .15s, color .15s',
      }}
    >
      <Icon name={on ? 'tv' : 'tv_off'} size={Math.round(size * 0.52)} />
    </button>
  )
}
