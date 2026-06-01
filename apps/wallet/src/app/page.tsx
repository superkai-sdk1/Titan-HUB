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

import { useState, useEffect, useRef, useMemo } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://titanpos.ru'

interface UserProfile {
  id: string
  nickname: string
  balance: number
  bonusPoints: number
  tier: string
}

interface Transaction {
  id: string
  type: string
  description: string
  amount: number
  createdAt: string
}
interface BonusRow { id: string; amount: number; reason: string | null; createdAt: string }
interface BonusLot { amount: number; remaining: number; expiresAt: string | null }
interface FeedItem { id: string; date: string; emoji: string; label: string; sign: 1 | -1; amount: number; unit: '₽' | '⭐' }

type AppState = 'loading' | 'error' | 'main'

const TIER_COLORS: Record<string, string> = {
  guest: '#94A3B8', resident: '#8B5CF6', student: '#F59E0B',
  bronze: '#cd7f32', silver: '#94A3B8', gold: '#F59E0B', platinum: '#E2E8F0',
}
const TIER_LABELS: Record<string, string> = {
  guest: 'Гость', resident: 'Резидент', student: 'Студент',
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина',
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}
function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr))
}
function getTransactionEmoji(type: string): string {
  switch (type) {
    case 'deposit': return '💳'
    case 'payment': return '🛒'
    case 'refund': return '↩️'
    case 'withdrawal': return '💸'
    case 'bonus_accrual': return '⭐'
    case 'bonus_spend': return '🔄'
    default: return '💰'
  }
}
function isPositive(type: string): boolean {
  return type === 'deposit' || type === 'refund' || type === 'bonus_accrual'
}
function nearestExpiringLot(lots: BonusLot[]): { remaining: number; expiresAt: Date } | null {
  const now = Date.now()
  let best: { remaining: number; expiresAt: Date } | null = null
  for (const lot of lots) {
    if (!lot || !(Number(lot.remaining) > 0) || !lot.expiresAt) continue
    const ts = new Date(lot.expiresAt).getTime()
    if (!Number.isFinite(ts) || ts <= now) continue
    if (!best || ts < best.expiresAt.getTime()) best = { remaining: Number(lot.remaining), expiresAt: new Date(ts) }
  }
  return best
}
function formatExpiryDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date)
}

export default function WalletPage() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bonusHist, setBonusHist] = useState<BonusRow[]>([])
  const [bonusLots, setBonusLots] = useState<BonusLot[]>([])
  const [errorMsg, setErrorMsg] = useState<string>('')

  // 3D-наклон карты за пальцем.
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false })
  function onMove(e: React.PointerEvent) {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setTilt({ rx: -(py - 0.5) * 26, ry: (px - 0.5) * 26, gx: px * 100, gy: py * 100, active: true })
  }
  function onEnd() { setTilt(t => ({ ...t, rx: 0, ry: 0, gx: 50, gy: 50, active: false })) }

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) { setErrorMsg('Откройте через Telegram'); setAppState('error'); return }
    tg.ready(); tg.expand()
    const initData = tg.initData
    if (!initData) { setErrorMsg('Нет данных авторизации Telegram'); setAppState('error'); return }

    ;(async () => {
      try {
        const authRes = await fetch(`${API_URL}/api/auth/login/telegram`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }),
        })
        if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`)
        const authData = await authRes.json() as { token: string }
        const authToken = authData.token
        const authHeaders = { Authorization: `Bearer ${authToken}` }

        const meRes = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders })
        if (!meRes.ok) throw new Error(`Profile fetch failed: ${meRes.status}`)
        const me = await meRes.json() as Record<string, any>
        setProfile({
          id: me.id, nickname: (me.nickname ?? '').trim(),
          balance: parseFloat(me.balance ?? '0') || 0,
          bonusPoints: parseFloat(me.bonusPoints ?? '0') || 0,
          tier: me.clientTier ?? 'guest',
        })

        const [txRes, bhRes] = await Promise.all([
          fetch(`${API_URL}/api/auth/me/transactions`, { headers: authHeaders }),
          fetch(`${API_URL}/api/auth/me/bonus-history`, { headers: authHeaders }).catch(() => null),
        ])
        const txData = txRes.ok ? (await txRes.json()) as { transactions: any[] } : { transactions: [] }
        setTransactions((txData.transactions ?? []).map((t) => ({
          id: t.id, type: t.type, description: t.description ?? t.type, amount: Number(t.amount) || 0, createdAt: t.createdAt,
        })))
        if (bhRes && bhRes.ok) {
          const bh = (await bhRes.json()) as { history?: any[] }
          setBonusHist((bh.history ?? []).map((b) => ({ id: b.id, amount: Number(b.amount) || 0, reason: b.reason ?? null, createdAt: b.createdAt })))
        }

        try {
          const lotsRes = await fetch(`${API_URL}/api/auth/me/bonus-lots`, { headers: authHeaders })
          if (lotsRes.ok) {
            const lotsData = (await lotsRes.json()) as { lots?: any[] }
            setBonusLots((lotsData.lots ?? []).map((l) => ({ amount: Number(l.amount) || 0, remaining: Number(l.remaining) || 0, expiresAt: l.expiresAt ?? null })))
          }
        } catch { /* подсказка о сгорании необязательна */ }

        setAppState('main')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка авторизации')
        setAppState('error')
      }
    })()
  }, [])

  // Единый фид: деньги (transactions) + бонусы (bonusHistory), по дате.
  const feed = useMemo<FeedItem[]>(() => {
    const money: FeedItem[] = transactions.map(t => ({
      id: 'm' + t.id, date: t.createdAt, emoji: getTransactionEmoji(t.type),
      label: t.description || t.type, sign: isPositive(t.type) ? 1 : -1, amount: Math.abs(t.amount), unit: '₽',
    }))
    const bonus: FeedItem[] = bonusHist.map(b => ({
      id: 'b' + b.id, date: b.createdAt, emoji: b.amount >= 0 ? '⭐' : '🔄',
      label: b.reason || (b.amount >= 0 ? 'Начисление бонусов' : 'Списание бонусов'),
      sign: b.amount >= 0 ? 1 : -1, amount: Math.abs(b.amount), unit: '⭐',
    }))
    return [...money, ...bonus].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, bonusHist])

  const keyframes = (
    <style>{`
      @keyframes spin { to { transform: rotate(360deg) } }
      @keyframes holo { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    `}</style>
  )

  if (appState === 'loading') {
    return (
      <div style={styles.root}>{keyframes}
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={{ color: '#94A3B8', marginTop: 16, fontSize: 14 }}>Загрузка кошелька…</p>
        </div>
      </div>
    )
  }
  if (appState === 'error') {
    return (
      <div style={styles.root}>{keyframes}
        <div style={styles.centered}>
          <span style={{ fontSize: 64 }}>✈️</span>
          <h2 style={{ color: '#fff', marginTop: 16, fontSize: 20, fontWeight: 700, textAlign: 'center' }}>Откройте через Telegram</h2>
          <p style={{ color: '#94A3B8', marginTop: 8, fontSize: 14, textAlign: 'center', maxWidth: 260 }}>{errorMsg}</p>
        </div>
      </div>
    )
  }

  const tierColor = TIER_COLORS[profile?.tier ?? 'guest'] ?? '#94A3B8'
  const tierLabel = TIER_LABELS[profile?.tier ?? 'guest'] ?? 'Гость'
  const expiringBonus = nearestExpiringLot(bonusLots)
  const bal = profile?.balance ?? 0
  const deposit = Math.max(0, bal)
  const debt = Math.max(0, -bal)
  const bonus = Math.round(profile?.bonusPoints ?? 0)

  return (
    <div style={styles.root}>{keyframes}
      {/* ─── 3D переливающаяся карта ─── */}
      <div style={{ perspective: '1000px', marginBottom: 16 }}>
        <div
          ref={cardRef}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerUp={onEnd}
          onPointerLeave={onEnd}
          onPointerCancel={onEnd}
          style={{
            ...styles.card,
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.active ? 1.02 : 1})`,
            transition: tilt.active ? 'transform 0.06s linear' : 'transform 0.7s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* переливающийся фон */}
          <div style={styles.holo} />
          {/* блик за пальцем */}
          <div style={{ ...styles.glare, background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.5), rgba(255,255,255,0) 45%)` }} />
          {/* затемнение снизу для контраста текста */}
          <div style={styles.cardShade} />
          {/* контент */}
          <div style={styles.cardContent}>
            <div style={styles.cardTop}>
              <span style={styles.brand}>TITAN</span>
              <span style={styles.tierBadge(tierColor)}>{tierLabel}</span>
            </div>
            <div>
              <p style={styles.cardBonusLabel}>Бонусный баланс</p>
              <p style={styles.cardBonus}>{bonus.toLocaleString('ru')} <span style={{ fontSize: 24 }}>⭐</span></p>
              <p style={styles.cardNick}>@{profile?.nickname || 'гость'}</p>
            </div>
          </div>
        </div>
      </div>

      {expiringBonus && (
        <p style={styles.bonusExpiry}>🔥 {Math.round(expiringBonus.remaining)} бонусов сгорают {formatExpiryDate(expiringBonus.expiresAt)}</p>
      )}

      {/* ─── Плашки Депозит / Долг ─── */}
      {(deposit > 0 || debt > 0) && (
        <div style={styles.platesRow}>
          {deposit > 0 && (
            <div style={styles.plate('#34D399')}>
              <p style={styles.plateLabel}>Депозит</p>
              <p style={styles.plateValue('#34D399')}>{formatAmount(deposit)} ₽</p>
            </div>
          )}
          {debt > 0 && (
            <div style={styles.plate('#F87171')}>
              <p style={styles.plateLabel}>Долг</p>
              <p style={styles.plateValue('#F87171')}>{formatAmount(debt)} ₽</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Единый фид истории ─── */}
      <p style={styles.feedTitle}>История</p>
      <div style={styles.feed}>
        {feed.length === 0 ? (
          <p style={{ color: '#94A3B8', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>Операций пока нет</p>
        ) : feed.map(it => (
          <div key={it.id} style={styles.txRow}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{it.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.txDesc}>{it.label}</p>
              <p style={styles.txDate}>{formatDate(it.date)}</p>
            </div>
            <span style={styles.txAmount(it.sign > 0)}>
              {it.sign > 0 ? '+' : '−'}{it.unit === '⭐' ? Math.round(it.amount).toLocaleString('ru') : formatAmount(it.amount)} {it.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  root: { minHeight: '100vh', backgroundColor: '#15121b', display: 'flex', flexDirection: 'column' as const, padding: '16px 16px 40px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '100vh' },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,

  card: {
    position: 'relative' as const, height: 200, borderRadius: 22, overflow: 'hidden',
    transformStyle: 'preserve-3d' as const, willChange: 'transform', touchAction: 'none' as const, cursor: 'grab',
    boxShadow: '0 18px 50px rgba(109,40,217,0.35)', userSelect: 'none' as const, WebkitUserSelect: 'none' as const,
  },
  holo: {
    position: 'absolute' as const, inset: 0,
    background: 'linear-gradient(115deg, #6d28d9 0%, #4cd7f6 25%, #ec4899 50%, #f59e0b 70%, #8B5CF6 100%)',
    backgroundSize: '300% 300%', animation: 'holo 8s ease infinite',
  },
  glare: { position: 'absolute' as const, inset: 0, mixBlendMode: 'screen' as const, pointerEvents: 'none' as const },
  cardShade: { position: 'absolute' as const, inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none' as const },
  cardContent: { position: 'relative' as const, zIndex: 2, height: '100%', padding: 22, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between', color: '#fff' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 16, fontWeight: 900, letterSpacing: '3px', textShadow: '0 1px 6px rgba(0,0,0,0.4)' },
  tierBadge: (color: string) => ({ display: 'inline-block', padding: '3px 11px', borderRadius: 20, background: 'rgba(0,0,0,0.25)', border: `1px solid ${color}`, color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' as const }),
  cardBonusLabel: { fontSize: 11, margin: 0, opacity: 0.85, textTransform: 'uppercase' as const, letterSpacing: '1px', textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  cardBonus: { fontSize: 40, fontWeight: 900, fontStyle: 'italic' as const, margin: '2px 0 0', letterSpacing: '-1px', textShadow: '0 2px 10px rgba(0,0,0,0.4)' },
  cardNick: { fontSize: 15, fontWeight: 700, margin: '6px 0 0', opacity: 0.95, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },

  bonusExpiry: { color: '#fbbf24', fontSize: 12, fontWeight: 600, margin: '0 0 14px', textAlign: 'center' as const },

  platesRow: { display: 'flex', gap: 12, marginBottom: 22 },
  plate: (color: string) => ({ flex: 1, background: `${color}14`, border: `1px solid ${color}40`, borderRadius: 16, padding: '14px 16px' }),
  plateLabel: { color: '#94A3B8', fontSize: 12, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  plateValue: (color: string) => ({ color, fontSize: 22, fontWeight: 800, fontStyle: 'italic' as const, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' as const }),

  feedTitle: { color: '#94A3B8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px 4px' },
  feed: { background: 'rgba(29,26,36,0.8)', borderRadius: 18, border: '1px solid rgba(139,92,246,0.15)', overflow: 'hidden' },
  txRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' },
  txDesc: { color: '#e2e8f0', fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  txDate: { color: '#64748B', fontSize: 12, margin: '2px 0 0' },
  txAmount: (positive: boolean) => ({ color: positive ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }),
}
