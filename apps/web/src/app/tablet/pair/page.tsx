'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { Icon } from '@/components/Icon'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api'

export default function TabletPairPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [pairing, setPairing] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const code = digits.join('')

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  function setDigit(idx: number, value: string) {
    const clean = value.replace(/\D/g, '').slice(0, 1)
    const next = [...digits]
    next[idx] = clean
    setDigits(next)
    if (clean && idx < 5) refs.current[idx + 1]?.focus()
  }

  function onPaste(e: React.ClipboardEvent) {
    const data = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (data.length === 6) {
      setDigits(data.split(''))
      refs.current[5]?.focus()
      e.preventDefault()
    }
  }

  function onKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus()
    }
  }

  async function submit() {
    if (code.length !== 6) {
      setError('Введите 6-значный код')
      return
    }
    setError(null)
    setPairing(true)
    try {
      const deviceName = (typeof navigator !== 'undefined' ? navigator.userAgent.split('(')[0]?.trim() : null) || 'iPad'
      const res = await fetch(`${API_BASE}/auth/tablet-pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, deviceName: deviceName.slice(0, 64) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось привязать планшет')
        setPairing(false)
        return
      }
      setAuth(data.token, data.user)
      router.replace('/tablet')
    } catch (e: any) {
      setError(e?.message || 'Сетевая ошибка')
      setPairing(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: 40, minHeight: '100dvh' }}>
      <div style={{
        width: 100, height: 100, borderRadius: 32,
        background: 'rgba(139,92,246,0.1)',
        border: '1px solid rgba(139,92,246,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="tablet_mac" size={52} color="#A78BFA" />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, textTransform: 'uppercase', margin: '0 0 12px' }}>
          Привязка планшета
        </h1>
        <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
          Попросите администратора сгенерировать код привязки на странице «Зоны» в разделе Управление
        </p>
      </div>

      <div onPaste={onPaste} style={{ display: 'flex', gap: 12 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            value={d}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            style={{
              width: 56, height: 64,
              fontSize: 28, fontWeight: 800,
              textAlign: 'center',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(29,26,36,0.6)',
              color: 'var(--on-surface)',
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 18px', borderRadius: 12, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#F87171', fontSize: 14 }}>
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={pairing || code.length !== 6}
        style={{
          padding: '14px 32px', borderRadius: 16, border: 'none', cursor: 'pointer',
          background: code.length === 6 ? 'linear-gradient(135deg, #8B5CF6, #4cd7f6)' : 'rgba(255,255,255,0.08)',
          color: code.length === 6 ? '#fff' : 'var(--on-surface-variant)',
          fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
          boxShadow: code.length === 6 ? '0 4px 20px rgba(139,92,246,0.35)' : 'none',
          opacity: pairing ? 0.6 : 1,
        }}
      >
        {pairing ? 'Привязка…' : 'Привязать'}
      </button>
    </div>
  )
}
