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
// Токен входа из браузера/PWA храним локально — чтобы не вводить код при каждом
// открытии (Telegram Mini App авторизуется заново сам, поэтому там не нужен).
const STORAGE_KEY = 'titan_wallet_token'

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
  checkId: string | null
}
interface BonusRow { id: string; amount: number; reason: string | null; createdAt: string }
interface BonusLot { amount: number; remaining: number; expiresAt: string | null }
interface VisitProgress { tier: string; visits: number; threshold: number; remaining: number; isResident: boolean }
interface FeedItem { id: string; date: string; emoji: string; label: string; sign: 1 | -1; amount: number; unit: '₽' | '⭐'; checkId?: string | null }
interface CheckDetail { check: { id: string; totalAmount: number; tipAmount?: number; createdAt: string; closedAt: string | null }; items: { name: string; quantity: number; priceAtTime: number; lineTotal: number }[]; payments: { method: string; amount: number }[]; discounts: { name: string | null; amount: number }[] }

type AppState = 'loading' | 'error' | 'main' | 'code'

const TIER_COLORS: Record<string, string> = {
  guest: '#94A3B8', resident: '#8B5CF6', student: '#F59E0B',
  bronze: '#cd7f32', silver: '#94A3B8', gold: '#F59E0B', platinum: '#E2E8F0',
}
const TIER_LABELS: Record<string, string> = {
  guest: 'Гость', resident: 'Резидент', student: 'Студент',
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина',
}
const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'СБП', bonus: 'Бонусы',
  deposit: 'Депозит', debt: 'Долг', certificate: 'Сертификат', split: 'Раздельная',
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
function pluralVisits(n: number): string {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return 'посещений'
  if (b > 1 && b < 5) return 'посещения'
  if (b === 1) return 'посещение'
  return 'посещений'
}

export default function WalletPage() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bonusHist, setBonusHist] = useState<BonusRow[]>([])
  const [bonusLots, setBonusLots] = useState<BonusLot[]>([])
  const [vp, setVp] = useState<VisitProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [token, setToken] = useState<string | null>(null)
  const [openCheck, setOpenCheck] = useState<CheckDetail | null>(null)
  const [checkLoading, setCheckLoading] = useState(false)
  // Вход из браузера/PWA по 4-значному коду.
  const [loginCode, setLoginCode] = useState<string>('')
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const ticketRef = useRef<string | null>(null)
  const codeExpiresRef = useRef<number>(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function openCheckDetail(checkId: string) {
    if (!token) return
    setCheckLoading(true)
    try {
      const r = await fetch(`${API_URL}/api/auth/me/checks/${checkId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) setOpenCheck(await r.json() as CheckDetail)
    } catch { /* ignore */ }
    setCheckLoading(false)
  }

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
    let cancelled = false
    const persist = (t: string) => { try { localStorage.setItem(STORAGE_KEY, t) } catch { /* приватный режим */ } }
    const forget = () => { try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ } }

    // Загрузка данных кошелька по токену. true — успех, false — токен невалиден.
    async function loadWallet(authToken: string): Promise<boolean> {
      const authHeaders = { Authorization: `Bearer ${authToken}` }
      const meRes = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders })
      if (!meRes.ok) return false
      const me = await meRes.json() as Record<string, any>
      if (cancelled) return true
      setToken(authToken)
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
      if (cancelled) return true
      setTransactions((txData.transactions ?? []).map((t) => ({
        id: t.id, type: t.type, description: t.description ?? t.type, amount: Number(t.amount) || 0, createdAt: t.createdAt, checkId: t.checkId ?? null,
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

      try {
        const vpRes = await fetch(`${API_URL}/api/auth/me/visit-progress`, { headers: authHeaders })
        if (vpRes.ok && !cancelled) setVp(await vpRes.json() as VisitProgress)
      } catch { /* прогресс статуса необязателен */ }

      if (!cancelled) setAppState('main')
      return true
    }

    const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

    // Запрос нового кода входа (показывается на экране, отправляется боту).
    async function requestCode(): Promise<void> {
      try {
        const r = await fetch(`${API_URL}/api/auth/wallet-code/start`, { method: 'POST' })
        if (!r.ok) throw new Error('start failed')
        const d = await r.json() as { code: string; ticket: string | null; botUsername: string | null; expiresAt: string }
        if (cancelled) return
        ticketRef.current = d.ticket
        codeExpiresRef.current = new Date(d.expiresAt).getTime()
        setLoginCode(d.code)
        setBotUsername(d.botUsername)
        setCodeCopied(false)
        setAppState('code')
      } catch {
        if (!cancelled) { setErrorMsg('Не удалось получить код входа. Проверьте соединение.'); setAppState('error') }
      }
    }

    const startPolling = () => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        const ticket = ticketRef.current
        if (!ticket || cancelled) return
        if (Date.now() > codeExpiresRef.current) { await requestCode(); return } // код истёк — обновляем
        try {
          const r = await fetch(`${API_URL}/api/auth/wallet-code/status?ticket=${encodeURIComponent(ticket)}`)
          if (!r.ok) return
          const d = await r.json() as { status: string; token?: string }
          if (d.status === 'ok' && d.token) {
            stopPolling()
            persist(d.token)
            if (!cancelled) await loadWallet(d.token)
          } else if (d.status === 'expired') {
            await requestCode()
          }
        } catch { /* сеть моргнула — повторим на следующем тике */ }
      }, 2500)
    }

    async function boot() {
      const tg = window.Telegram?.WebApp
      // 1) Внутри Telegram Mini App — авторизация по initData (как раньше).
      if (tg && tg.initData) {
        tg.ready(); tg.expand()
        try {
          const authRes = await fetch(`${API_URL}/api/auth/login/telegram`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData }),
          })
          if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`)
          const { token: t } = await authRes.json() as { token: string }
          if (!(await loadWallet(t))) throw new Error('Profile fetch failed')
        } catch (err) {
          if (!cancelled) { setErrorMsg(err instanceof Error ? err.message : 'Ошибка авторизации'); setAppState('error') }
        }
        return
      }
      // 2) Браузер/PWA — пробуем сохранённый токен; если протух — код входа.
      let stored: string | null = null
      try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* noop */ }
      if (stored) {
        const ok = await loadWallet(stored).catch(() => false)
        if (ok) return
        forget()
      }
      if (cancelled) return
      await requestCode()
      startPolling()
    }

    boot()
    return () => { cancelled = true; stopPolling() }
  }, [])

  // Единый фид: деньги (transactions) + бонусы (bonusHistory), по дате.
  const feed = useMemo<FeedItem[]>(() => {
    const money: FeedItem[] = transactions
      // Скрываем дубли «Долг/Оплата депозитом за чек» (withdrawal с checkId) — их
      // представляет строка «Оплата чека».
      .filter(t => !(t.checkId && t.type === 'withdrawal'))
      .map(t => ({
        id: 'm' + t.id, date: t.createdAt, emoji: getTransactionEmoji(t.type),
        label: t.description || t.type, sign: isPositive(t.type) ? 1 : -1, amount: Math.abs(t.amount), unit: '₽', checkId: t.checkId,
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
          <span style={{ fontSize: 64 }}>⚠️</span>
          <h2 style={{ color: '#fff', marginTop: 16, fontSize: 20, fontWeight: 700, textAlign: 'center' }}>Не удалось войти</h2>
          <p style={{ color: '#94A3B8', marginTop: 8, fontSize: 14, textAlign: 'center', maxWidth: 260 }}>{errorMsg}</p>
        </div>
      </div>
    )
  }
  if (appState === 'code') {
    const copyCode = async () => {
      try { await navigator.clipboard.writeText(loginCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1800) } catch { /* clipboard недоступен */ }
    }
    return (
      <div style={styles.root}>{keyframes}
        <div style={{ ...styles.centered, gap: 0, maxWidth: 360, margin: '0 auto', width: '100%' }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '4px', color: '#a78bfa' }}>TITAN</span>
          <h2 style={{ color: '#fff', margin: '14px 0 6px', fontSize: 22, fontWeight: 800, textAlign: 'center' }}>Вход в кошелёк</h2>
          <p style={{ color: '#94A3B8', margin: 0, fontSize: 14, textAlign: 'center', lineHeight: 1.5, maxWidth: 300 }}>
            Откройте бота кошелька в Telegram и отправьте ему этот код:
          </p>

          {/* 4-значный код — крупно, с возможностью выделить/скопировать */}
          <div className="selectable" onClick={copyCode} style={styles.codeBox}>
            {loginCode.split('').map((d, i) => (
              <span key={i} style={styles.codeDigit}>{d}</span>
            ))}
          </div>

          <button onClick={copyCode} style={styles.codeCopyBtn}>{codeCopied ? 'Скопировано ✓' : 'Скопировать код'}</button>

          {botUsername && (
            <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" style={styles.codeTgBtn}>
              💬 Открыть бота в Telegram
            </a>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
            <div style={styles.spinnerSmall} />
            <span style={{ color: '#94A3B8', fontSize: 13 }}>Ждём подтверждения…</span>
          </div>

          <p style={{ color: '#64748B', fontSize: 12, textAlign: 'center', margin: '24px 0 0', lineHeight: 1.5, maxWidth: 300 }}>
            Совет: добавьте кошелёк на экран «Домой» — и открывайте его как приложение. Код нужен только один раз на устройстве.
          </p>
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
              <p style={styles.plateValue('#F87171')}>−{formatAmount(debt)} ₽</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Прогресс к статусу Резидент ─── */}
      {vp && vp.tier === 'guest' && (
        <div style={styles.progressCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>До статуса «Резидент»</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#4cd7f6', fontVariantNumeric: 'tabular-nums' }}>{vp.visits}/{vp.threshold}</span>
          </div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${Math.min(100, (vp.visits / vp.threshold) * 100)}%` }} />
          </div>
          <p style={styles.progressNote}>
            {vp.remaining > 0 ? `Ещё ${vp.remaining} ${pluralVisits(vp.remaining)} — и вы Резидент 🎉` : 'Порог достигнут — статус повысится после следующего визита'}
          </p>
        </div>
      )}

      {/* ─── Единый фид истории ─── */}
      <p style={styles.feedTitle}>История</p>
      <div style={styles.feed}>
        {feed.length === 0 ? (
          <p style={{ color: '#94A3B8', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>Операций пока нет</p>
        ) : feed.map(it => (
          <div key={it.id} onClick={() => it.checkId && openCheckDetail(it.checkId)} style={{ ...styles.txRow, cursor: it.checkId ? 'pointer' : 'default' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{it.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.txDesc}>{it.label}{it.checkId ? ' ›' : ''}</p>
              <p style={styles.txDate}>{formatDate(it.date)}</p>
            </div>
            <span style={styles.txAmount(it.sign > 0)}>
              {it.sign > 0 ? '+' : '−'}{it.unit === '⭐' ? Math.round(it.amount).toLocaleString('ru') : formatAmount(it.amount)} {it.unit}
            </span>
          </div>
        ))}
      </div>

      {/* ─── Деталь чека ─── */}
      {(openCheck || checkLoading) && (
        <div onClick={e => { if (e.target === e.currentTarget) { setOpenCheck(null); setCheckLoading(false) } }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, padding: 20, background: '#1d1a24', border: '1px solid rgba(255,255,255,0.1)' }}>
            {!openCheck ? (
              <p style={{ textAlign: 'center', color: '#94A3B8', padding: '30px 0' }}>Загрузка…</p>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#fff' }}>Чек</h3>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>{formatDate(openCheck.check.closedAt || openCheck.check.createdAt)}</p>
                  </div>
                  <button onClick={() => setOpenCheck(null)} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {openCheck.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                      <span>{it.name} <span style={{ color: '#94A3B8' }}>×{it.quantity}</span></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatAmount(it.lineTotal)} ₽</span>
                    </div>
                  ))}
                </div>
                {openCheck.discounts.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {openCheck.discounts.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#F59E0B' }}>
                        <span>Скидка{d.name ? `: ${d.name}` : ''}</span><span>−{formatAmount(d.amount)} ₽</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginBottom: (openCheck.check.tipAmount ?? 0) > 0 ? 6 : 12 }}>
                  <span style={{ fontSize: 14, color: '#94A3B8' }}>Итого</span>
                  <span style={{ fontSize: 20, fontWeight: 800, fontStyle: 'italic', color: '#fff' }}>{formatAmount(openCheck.check.totalAmount)} ₽</span>
                </div>
                {(openCheck.check.tipAmount ?? 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: '#34D399' }}>💚 Чаевые</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#34D399' }}>+{formatAmount(openCheck.check.tipAmount ?? 0)} ₽</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {openCheck.payments.map((p, i) => (
                    <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{PAY_LABELS[p.method] ?? p.method}: {formatAmount(p.amount)} ₽</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  // Safe-area: в полноэкранном PWA контент не должен уходить под «остров»/чёлку iPhone
  // (сверху) и под home-indicator (снизу). env(safe-area-inset-*) даёт ненулевые
  // значения благодаря viewport-fit=cover (см. layout.tsx).
  root: {
    minHeight: '100dvh', backgroundColor: '#15121b', display: 'flex', flexDirection: 'column' as const,
    padding: 'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  centered: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '70dvh' },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,
  spinnerSmall: { width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,

  // Экран входа по коду
  codeBox: { display: 'flex', gap: 10, margin: '22px 0 14px', cursor: 'pointer' },
  codeDigit: {
    width: 56, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 36, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' as const,
    background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 16,
  } as React.CSSProperties,
  codeCopyBtn: {
    background: 'transparent', border: 'none', color: '#a78bfa', fontSize: 14, fontWeight: 600,
    padding: '6px 10px', cursor: 'pointer',
  } as React.CSSProperties,
  codeTgBtn: {
    marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', color: '#fff', fontSize: 15, fontWeight: 700,
    padding: '13px 22px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 10px 28px rgba(109,40,217,0.4)',
  } as React.CSSProperties,

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

  progressCard: { background: 'rgba(76,215,246,0.08)', border: '1px solid rgba(76,215,246,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 22 },
  progressTrack: { height: 9, borderRadius: 5, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' as const },
  progressFill: { height: '100%', borderRadius: 5, background: 'linear-gradient(90deg,#8B5CF6,#4cd7f6)', transition: 'width 0.5s ease' } as React.CSSProperties,
  progressNote: { color: '#94A3B8', fontSize: 12, margin: '8px 0 0' },

  feedTitle: { color: '#94A3B8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px 4px' },
  feed: { background: 'rgba(29,26,36,0.8)', borderRadius: 18, border: '1px solid rgba(139,92,246,0.15)', overflow: 'hidden' },
  txRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' },
  txDesc: { color: '#e2e8f0', fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  txDate: { color: '#64748B', fontSize: 12, margin: '2px 0 0' },
  txAmount: (positive: boolean) => ({ color: positive ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }),
}
