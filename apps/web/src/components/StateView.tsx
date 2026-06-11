'use client'
/**
 * Унифицированный компонент для loading/empty/error состояний.
 * Заменяет разрозненные `<div>Загрузка...</div>` и `<div>Нет данных</div>` по проекту.
 */
import React from 'react'
import { Icon } from '@/components/Icon'

interface StateViewProps {
  state: 'loading' | 'empty' | 'error'
  icon?: string
  title?: string
  description?: string
  action?: { label: string; onClick: () => void; icon?: string }
}

const DEFAULTS: Record<StateViewProps['state'], { icon: string; title: string; color: string }> = {
  loading: { icon: 'progress_activity', title: 'Загрузка…', color: '#a78bfa' },
  empty:   { icon: 'inbox',             title: 'Нет данных', color: 'rgba(204,195,216,0.4)' },
  error:   { icon: 'error',             title: 'Ошибка',     color: '#F87171' },
}

export function StateView({ state, icon, title, description, action }: StateViewProps) {
  const def = DEFAULTS[state]
  const finalIcon = icon ?? def.icon
  const finalTitle = title ?? def.title

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px', textAlign: 'center', minHeight: 240,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: state === 'loading' ? 'linear-gradient(160deg, rgba(139,92,246,0.18), rgba(76,215,246,0.06))'
          : state === 'error' ? 'linear-gradient(160deg, rgba(244,63,94,0.16), rgba(244,63,94,0.05))'
          : 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
        border: `1px solid ${state === 'loading' ? 'rgba(139,92,246,0.28)'
          : state === 'error' ? 'rgba(244,63,94,0.24)'
          : 'rgba(255,255,255,0.1)'}`,
        boxShadow: state === 'loading' ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
        animation: state === 'loading' ? 'sv-pulse 1.8s ease-in-out infinite' : 'none',
      }}>
        <Icon
          name={finalIcon}
          size={40}
          color={def.color}
          style={{ animation: state === 'loading' ? 'sv-spin 1.2s linear infinite' : 'none' }}
        />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--on-surface)' }}>
        {finalTitle}
      </h3>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)' }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            marginTop: 20, padding: '12px 24px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #9D6CFF 0%, #8B5CF6 42%, #4cd7f6 130%)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
            boxShadow: '0 6px 22px rgba(139,92,246,0.38), inset 0 1px 0 rgba(255,255,255,0.28)',
            transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}
        >
          {action.icon && <Icon name={action.icon} size={18} />}
          {action.label}
        </button>
      )}
      <style>{`@keyframes sv-spin { to { transform: rotate(360deg); } } @keyframes sv-pulse { 0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 0 rgba(139,92,246,0.0); } 50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 22px 2px rgba(139,92,246,0.35); } }`}</style>
    </div>
  )
}
