'use client'
/**
 * Унифицированный компонент для loading/empty/error состояний.
 * Заменяет разрозненные `<div>Загрузка...</div>` и `<div>Нет данных</div>` по проекту.
 */
import React from 'react'

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
        background: state === 'loading' ? 'rgba(139,92,246,0.08)'
          : state === 'error' ? 'rgba(244,63,94,0.08)'
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${state === 'loading' ? 'rgba(139,92,246,0.2)'
          : state === 'error' ? 'rgba(244,63,94,0.2)'
          : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
      }}>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 40,
            color: def.color,
            animation: state === 'loading' ? 'sv-spin 1.2s linear infinite' : 'none',
          }}
        >
          {finalIcon}
        </span>
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
          style={{
            marginTop: 20, padding: '12px 24px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
          }}
        >
          {action.icon && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{action.icon}</span>}
          {action.label}
        </button>
      )}
      <style>{`@keyframes sv-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
