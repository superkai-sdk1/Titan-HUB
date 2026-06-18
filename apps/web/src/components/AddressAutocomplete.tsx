'use client'
/**
 * Поле ввода адреса с подсказками Яндекс Геосаджеста.
 *
 * Дёргает публичный прокси /api/geo/suggest (ключ — на сервере). Если интеграция
 * не настроена ({ enabled:false }) — ведёт себя как обычный <input> (без выпадашки).
 * Используется везде, где вводят адрес: /book (выезд), /events (выезд) и т.п.
 */
import React, { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface Sug { title: string; subtitle: string; value: string }

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  maxLength?: number
}

export function AddressAutocomplete({ value, onChange, placeholder, style, maxLength }: Props) {
  const [sugs, setSugs] = useState<Sug[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipRef = useRef(false) // не дёргать подсказки сразу после выбора

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return }
    if (tRef.current) clearTimeout(tRef.current)
    const q = value.trim()
    if (q.length < 3) { setSugs([]); setOpen(false); return }
    tRef.current = setTimeout(async () => {
      try {
        const r = await api.get<{ enabled: boolean; suggestions: Sug[] }>(`/geo/suggest?text=${encodeURIComponent(q)}`)
        if (!r.enabled) { setSugs([]); setOpen(false); return }
        const list = r.suggestions ?? []
        setSugs(list); setActive(-1); setOpen(list.length > 0)
      } catch { /* подсказки необязательны */ }
    }, 250)
    return () => { if (tRef.current) clearTimeout(tRef.current) }
  }, [value])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = (s: Sug) => { skipRef.current = true; onChange(s.value); setOpen(false); setSugs([]) }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (sugs.length) setOpen(true) }}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        style={style}
        onKeyDown={e => {
          if (!open || !sugs.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, sugs.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && active >= 0 && sugs[active]) { e.preventDefault(); pick(sugs[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && sugs.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#1d1a24', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', maxHeight: 280, overflowY: 'auto' }}>
          {sugs.map((s, i) => (
            <button key={i} type="button" onMouseDown={e => { e.preventDefault(); pick(s) }} onMouseEnter={() => setActive(i)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: i === active ? 'rgba(139,92,246,0.18)' : 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', color: 'var(--on-surface)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || s.value}</div>
              {s.subtitle && <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
