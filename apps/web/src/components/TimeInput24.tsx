'use client'
import React from 'react'

// 24-часовой ввод времени через нативные <select> (часы 00–23, минуты 00–59).
// Не используем <input type="time"> / "datetime-local": их формат (12/24ч) на iOS
// задаётся настройкой устройства и не переопределяется из HTML. Селекты дают
// гарантированный 24ч-формат на любом устройстве. Значение — строка "HH:MM".

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const selStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '12px 8px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.9)',
  color: 'var(--on-surface)', fontSize: 15, fontVariantNumeric: 'tabular-nums',
  outline: 'none', cursor: 'pointer', textAlign: 'center', boxSizing: 'border-box',
}

export function TimeInput24({ value, onChange, style }: {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
}) {
  const parts = (value || '').split(':')
  const hh = parts[0] ?? ''
  const mm = parts[1] ?? ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      <select aria-label="Часы" value={hh} onChange={e => onChange(`${e.target.value}:${mm || '00'}`)} style={selStyle}>
        <option value="" disabled>чч</option>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ fontWeight: 800, color: 'var(--on-surface-variant)' }}>:</span>
      <select aria-label="Минуты" value={mm} onChange={e => onChange(`${hh || '00'}:${e.target.value}`)} style={selStyle}>
        <option value="" disabled>мм</option>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}
