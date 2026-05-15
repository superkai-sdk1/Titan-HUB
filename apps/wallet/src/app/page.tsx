'use client'

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string
        ready(): void
        expand(): void
        close(): void
      }
    }
  }
}

import { useState, useEffect } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://titanpos.ru'

interface UserProfile {
  id: string
  name: string
  nickname?: string
  balance: number
  bonusPoints: number
  tier: 'guest' | 'resident' | 'student'
}

interface Transaction {
  id: string
  type: 'deposit' | 'payment' | 'bonus' | 'spend'
  description: string
  amount: number
  createdAt: string
}

type AppState = 'loading' | 'error' | 'main'

const TIER_COLORS: Record<string, string> = {
  guest: '#94A3B8',
  resident: '#8B5CF6',
  student: '#F59E0B',
}

const TIER_LABELS: Record<string, string> = {
  guest: 'Гость',
  resident: 'Резидент',
  student: 'Студент',
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getTransactionEmoji(type: string): string {
  switch (type) {
    case 'deposit': return '💳'
    case 'payment': return '🛒'
    case 'bonus': return '⭐'
    case 'spend': return '🔄'
    default: return '💰'
  }
}

function isPositive(type: string): boolean {
  return type === 'deposit' || type === 'bonus'
}

export default function WalletPage() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showTransactions, setShowTransactions] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) {
      setErrorMsg('Откройте через Telegram')
      setAppState('error')
      return
    }

    tg.ready()
    tg.expand()

    const initData = tg.initData
    if (!initData) {
      setErrorMsg('Нет данных авторизации Telegram')
      setAppState('error')
      return
    }

    ;(async () => {
      try {
        // Step 1: authenticate
        const authRes = await fetch(`${API_URL}/api/auth/login/telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        })
        if (!authRes.ok) {
          throw new Error(`Auth failed: ${authRes.status}`)
        }
        const authData = await authRes.json() as { token: string; user: { id: string } }
        const authToken = authData.token
        setToken(authToken)

        // Step 2: fetch client profile + transactions
        const clientRes = await fetch(`${API_URL}/api/clients/${authData.user.id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (!clientRes.ok) {
          throw new Error(`Profile fetch failed: ${clientRes.status}`)
        }
        const clientData = await clientRes.json() as { profile: UserProfile; transactions: Transaction[] }
        setProfile(clientData.profile)
        setTransactions(clientData.transactions ?? [])
        setAppState('main')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка авторизации')
        setAppState('error')
      }
    })()
  }, [])

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (appState === 'loading') {
    return (
      <div style={styles.root}>
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={{ color: '#94A3B8', marginTop: 16, fontSize: 14 }}>Загрузка кошелька…</p>
        </div>
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (appState === 'error') {
    return (
      <div style={styles.root}>
        <div style={styles.centered}>
          <span style={{ fontSize: 64 }}>✈️</span>
          <h2 style={{ color: '#fff', marginTop: 16, fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
            Откройте через Telegram
          </h2>
          <p style={{ color: '#94A3B8', marginTop: 8, fontSize: 14, textAlign: 'center', maxWidth: 260 }}>
            {errorMsg}
          </p>
        </div>
      </div>
    )
  }

  // ─── Main ────────────────────────────────────────────────────────────────────
  const tierColor = TIER_COLORS[profile?.tier ?? 'guest']
  const tierLabel = TIER_LABELS[profile?.tier ?? 'guest']

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Titan Wallet</h1>
        <p style={styles.subtitle}>
          {profile?.nickname ? `@${profile.nickname}` : profile?.name ?? ''}
        </p>
      </header>

      {/* Balance Card */}
      <div style={styles.balanceCard}>
        <div style={styles.tierBadge(tierColor)}>
          {tierLabel}
        </div>
        <p style={styles.balanceLabel}>Баланс</p>
        <p style={styles.balanceAmount}>
          {formatAmount(profile?.balance ?? 0)} ₽
        </p>
        <div style={styles.bonusRow}>
          <span style={{ fontSize: 14 }}>⭐</span>
          <span style={styles.bonusText}>
            {profile?.bonusPoints ?? 0} бонусных баллов
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={styles.actionsRow}>
        <button
          style={styles.actionBtn('primary')}
          onClick={() => alert('Обратитесь к администратору')}
        >
          <span style={{ fontSize: 18 }}>＋</span>
          <span>Пополнить</span>
        </button>
        <button
          style={styles.actionBtn(showTransactions ? 'active' : 'secondary')}
          onClick={() => setShowTransactions(v => !v)}
        >
          <span style={{ fontSize: 18 }}>🕐</span>
          <span>История</span>
        </button>
      </div>

      {/* Transactions */}
      {showTransactions && (
        <div style={styles.txSection}>
          <p style={styles.txTitle}>История операций</p>
          {transactions.length === 0 ? (
            <p style={{ color: '#94A3B8', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>
              Операций пока нет
            </p>
          ) : (
            transactions.map(tx => (
              <div key={tx.id} style={styles.txRow}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{getTransactionEmoji(tx.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.txDesc}>{tx.description}</p>
                  <p style={styles.txDate}>{formatDate(tx.createdAt)}</p>
                </div>
                <span style={styles.txAmount(isPositive(tx.type))}>
                  {isPositive(tx.type) ? '+' : '−'}{formatAmount(Math.abs(tx.amount))} ₽
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: '100vh',
    backgroundColor: '#15121b',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '24px 16px 40px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: '100vh',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '3px solid rgba(139,92,246,0.2)',
    borderTopColor: '#8B5CF6',
    animation: 'spin 0.8s linear infinite',
  } as React.CSSProperties,
  header: {
    textAlign: 'center' as const,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #8B5CF6 0%, #4cd7f6 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    margin: 0,
    letterSpacing: '-0.5px',
  } as React.CSSProperties,
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
    margin: '4px 0 0',
  },
  balanceCard: {
    background: 'rgba(29,26,36,0.8)',
    borderRadius: 24,
    border: '1px solid rgba(139,92,246,0.25)',
    backdropFilter: 'blur(16px)',
    padding: '28px 24px 24px',
    marginBottom: 20,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  tierBadge: (color: string) => ({
    display: 'inline-block',
    padding: '3px 12px',
    borderRadius: 20,
    border: `1px solid ${color}`,
    color: color,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 16,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  }),
  balanceLabel: {
    color: '#94A3B8',
    fontSize: 13,
    margin: '0 0 6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  balanceAmount: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 800,
    fontStyle: 'italic',
    margin: '0 0 16px',
    letterSpacing: '-1px',
  },
  bonusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  bonusText: {
    color: '#4cd7f6',
    fontSize: 13,
    fontWeight: 500,
  },
  actionsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: (variant: 'primary' | 'secondary' | 'active') => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 16px',
    borderRadius: 16,
    border: 'none',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 600,
    transition: 'opacity 0.15s',
    ...(variant === 'primary'
      ? {
          background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
          color: '#fff',
        }
      : variant === 'active'
      ? {
          background: 'rgba(76,215,246,0.15)',
          color: '#4cd7f6',
          border: '1px solid rgba(76,215,246,0.4)',
        }
      : {
          background: 'rgba(29,26,36,0.8)',
          color: '#94A3B8',
          border: '1px solid rgba(148,163,184,0.2)',
        }),
  }),
  txSection: {
    background: 'rgba(29,26,36,0.8)',
    borderRadius: 20,
    border: '1px solid rgba(139,92,246,0.15)',
    overflow: 'hidden',
  },
  txTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    padding: '16px 16px 8px',
    margin: 0,
  },
  txRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  txDesc: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  txDate: {
    color: '#64748B',
    fontSize: 12,
    margin: '2px 0 0',
  },
  txAmount: (positive: boolean) => ({
    color: positive ? '#4ade80' : '#f87171',
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  }),
}
