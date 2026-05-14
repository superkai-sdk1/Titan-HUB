'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/auth.store'
import { api, ApiError } from '@/lib/api'

type Tab = 'pin' | 'password'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [tab, setTab] = useState<Tab>('pin')
  const [pin, setPin] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [needsPinSetup, setNeedsPinSetup] = useState(false)
  const [pendingAuth, setPendingAuth] = useState<{ token: string; user: any } | null>(null)

  async function handlePinLogin(fullPin: string) {
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login/pin', { pin: fullPin })
      setAuth(res.token, res.user)
      router.replace('/pos')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  function appendPin(digit: string) {
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) handlePinLogin(next)
  }

  function deletePin() {
    setPin(p => p.slice(0, -1))
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ token: string; user: any; needsPinSetup?: boolean }>('/auth/login/password', { nickname, password })
      if (res.needsPinSetup) {
        setPendingAuth({ token: res.token, user: res.user })
        setNeedsPinSetup(true)
      } else {
        setAuth(res.token, res.user)
        router.replace('/pos')
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetPin() {
    if (newPin.length !== 4 || !pendingAuth) return
    setLoading(true)
    try {
      // Temporarily set token to make the request
      useAuthStore.setState({ token: pendingAuth.token })
      await api.post('/auth/pin/set', { pin: newPin })
      setAuth(pendingAuth.token, pendingAuth.user)
      router.replace('/pos')
    } catch {
      setError('Ошибка установки PIN')
    } finally {
      setLoading(false)
    }
  }

  if (needsPinSetup) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-center mb-2">Установите PIN</h2>
          <p className="text-muted text-center mb-8 text-sm">Придумайте 4-значный PIN-код для быстрого входа</p>
          <PinDots value={newPin} />
          <PinPad onPress={d => {
            if (newPin.length < 4) {
              const next = newPin + d
              setNewPin(next)
              if (next.length === 4) setTimeout(() => handleSetPin(), 200)
            }
          }} onDelete={() => setNewPin(p => p.slice(0, -1))} />
          {error && <p className="text-red-500 text-center mt-4 text-sm">{error}</p>}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-1">Titan HUB</h1>
        <p className="text-muted text-center mb-8 text-sm">Войдите в систему</p>

        {/* Tabs */}
        <div className="flex rounded-xl bg-surface mb-8 p-1">
          {(['pin', 'password'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'text-muted hover:text-white'}`}
            >
              {t === 'pin' ? 'PIN' : 'Пароль'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'pin' ? (
            <motion.div key="pin" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <PinDots value={pin} />
              <PinPad onPress={appendPin} onDelete={deletePin} disabled={loading} />
            </motion.div>
          ) : (
            <motion.div key="password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <input
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-white placeholder-muted focus:outline-none focus:border-primary"
                  placeholder="Никнейм"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  autoComplete="username"
                />
                <input
                  type="password"
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-white placeholder-muted focus:outline-none focus:border-primary"
                  placeholder="Пароль"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="submit"
                  disabled={loading || !nickname || !password}
                  className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
                >
                  {loading ? 'Вход...' : 'Войти'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-center mt-4 text-sm">
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}

function PinDots({ value }: { value: string }) {
  return (
    <div className="flex justify-center gap-3 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ scale: value.length > i ? [1, 1.3, 1] : 1 }}
          transition={{ duration: 0.15 }}
          className={`w-4 h-4 rounded-full border-2 transition-colors ${value.length > i ? 'bg-primary border-primary' : 'border-border'}`}
        />
      ))}
    </div>
  )
}

function PinPad({ onPress, onDelete, disabled }: { onPress: (d: string) => void; onDelete: () => void; disabled?: boolean }) {
  const keys = ['1','2','3','4','5','4','7','8','9','','0','⌫']
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((k, i) => k === '' ? <div key={i} /> : (
        <button
          key={i}
          disabled={disabled}
          onClick={() => k === '⌫' ? onDelete() : onPress(k)}
          className="h-14 rounded-2xl bg-surface text-white text-2xl font-medium active:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {k}
        </button>
      ))}
    </div>
  )
}
