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

// API — ОТНОСИТЕЛЬНЫЙ (same-origin): пусто → запросы идут на `/api/...` текущего
// хоста. Это и есть мультитенантность: kbr.titanpos.ru/residents → kbr.titanpos.ru/api,
// и tenantContext на API резолвит нужный клуб по Host. (env может переопределить.)
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
// Токен входа из браузера/PWA храним локально — чтобы не вводить код при каждом
// открытии (Telegram Mini App авторизуется заново сам, поэтому там не нужен).
const STORAGE_KEY = 'titan_wallet_token'
const FEED_PAGE = 20

interface UserProfile {
  id: string
  nickname: string
  balance: number
  bonusPoints: number
  tier: string
  fullName: string
  phone: string
  birthday: string
  photoUrl: string | null
  tgPhotoUrl: string | null
  gomafiaPhotoUrl: string | null
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
interface PayInfo { sbpReady: boolean; provider: string; fund: { available: boolean; name?: string; suggested?: number } }

type AppState = 'loading' | 'error' | 'main' | 'code'
type Tab = 'feed' | 'pay' | 'profile'
type Purpose = 'debt' | 'deposit' | 'fund'

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
  const [bonusHidden, setBonusHidden] = useState(false) // владелец скрыл бонусы у клиентов
  const [payInfo, setPayInfo] = useState<PayInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [token, setToken] = useState<string | null>(null)
  const [openCheck, setOpenCheck] = useState<CheckDetail | null>(null)
  const [checkLoading, setCheckLoading] = useState(false)
  // Навигация и лента
  const [tab, setTab] = useState<Tab>('feed')
  const [feedShown, setFeedShown] = useState(FEED_PAGE)
  // Вход из браузера/PWA по 4-значному коду.
  const [loginCode, setLoginCode] = useState<string>('')
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const ticketRef = useRef<string | null>(null)
  const codeExpiresRef = useRef<number>(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Оплата
  const [payPurpose, setPayPurpose] = useState<Purpose>('deposit')
  const [payAmount, setPayAmount] = useState('')
  const [paying, setPaying] = useState(false)
  const [payMsg, setPayMsg] = useState('')
  const payPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Профиль
  const [pNick, setPNick] = useState('')
  const [pFull, setPFull] = useState('')
  const [pPhone, setPPhone] = useState('')
  const [pBirthday, setPBirthday] = useState('')
  const [pPhoto, setPPhoto] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)

  const authHeaders = (t = token) => ({ Authorization: `Bearer ${t}` })

  // Применить ответ /auth/me к профилю.
  function applyMe(me: Record<string, any>) {
    setProfile({
      id: me.id, nickname: (me.nickname ?? '').trim(),
      balance: parseFloat(me.balance ?? '0') || 0,
      bonusPoints: parseFloat(me.bonusPoints ?? '0') || 0,
      tier: me.clientTier ?? 'guest',
      fullName: me.fullName ?? '', phone: me.phone ?? '', birthday: me.birthday ?? '',
      photoUrl: me.photoUrl ?? null, tgPhotoUrl: me.tgPhotoUrl ?? null, gomafiaPhotoUrl: me.gomafiaPhotoUrl ?? null,
    })
    setBonusHidden(!!me.bonusDisplayHidden)
  }

  // Перезагрузка данных (после оплаты / сохранения профиля). Использует текущий токен.
  async function refreshData(t = token) {
    if (!t) return
    try {
      const meRes = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders(t) })
      if (meRes.ok) applyMe(await meRes.json())
    } catch { /* ignore */ }
    try {
      const txRes = await fetch(`${API_URL}/api/auth/me/transactions?limit=200`, { headers: authHeaders(t) })
      if (txRes.ok) {
        const d = (await txRes.json()) as { transactions: any[] }
        setTransactions((d.transactions ?? []).map((x) => ({ id: x.id, type: x.type, description: x.description ?? x.type, amount: Number(x.amount) || 0, createdAt: x.createdAt, checkId: x.checkId ?? null })))
      }
    } catch { /* ignore */ }
    try {
      const bhRes = await fetch(`${API_URL}/api/auth/me/bonus-history?limit=200`, { headers: authHeaders(t) })
      if (bhRes.ok) {
        const bh = (await bhRes.json()) as { history?: any[] }
        setBonusHist((bh.history ?? []).map((b) => ({ id: b.id, amount: Number(b.amount) || 0, reason: b.reason ?? null, createdAt: b.createdAt })))
      }
    } catch { /* ignore */ }
    try {
      const lotsRes = await fetch(`${API_URL}/api/auth/me/bonus-lots`, { headers: authHeaders(t) })
      if (lotsRes.ok) {
        const lotsData = (await lotsRes.json()) as { lots?: any[] }
        setBonusLots((lotsData.lots ?? []).map((l) => ({ amount: Number(l.amount) || 0, remaining: Number(l.remaining) || 0, expiresAt: l.expiresAt ?? null })))
      }
    } catch { /* ignore */ }
  }

  async function openCheckDetail(checkId: string) {
    if (!token) return
    setCheckLoading(true)
    try {
      const r = await fetch(`${API_URL}/api/auth/me/checks/${checkId}`, { headers: authHeaders() })
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
      const h = { Authorization: `Bearer ${authToken}` }
      const meRes = await fetch(`${API_URL}/api/auth/me`, { headers: h })
      if (!meRes.ok) return false
      const me = await meRes.json() as Record<string, any>
      if (cancelled) return true
      setToken(authToken)
      applyMe(me)

      const [txRes, bhRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/me/transactions?limit=200`, { headers: h }),
        fetch(`${API_URL}/api/auth/me/bonus-history?limit=200`, { headers: h }).catch(() => null),
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
        const lotsRes = await fetch(`${API_URL}/api/auth/me/bonus-lots`, { headers: h })
        if (lotsRes.ok) {
          const lotsData = (await lotsRes.json()) as { lots?: any[] }
          setBonusLots((lotsData.lots ?? []).map((l) => ({ amount: Number(l.amount) || 0, remaining: Number(l.remaining) || 0, expiresAt: l.expiresAt ?? null })))
        }
      } catch { /* подсказка о сгорании необязательна */ }

      try {
        const vpRes = await fetch(`${API_URL}/api/auth/me/visit-progress`, { headers: h })
        if (vpRes.ok && !cancelled) setVp(await vpRes.json() as VisitProgress)
      } catch { /* прогресс статуса необязателен */ }

      try {
        const piRes = await fetch(`${API_URL}/api/auth/me/pay-info`, { headers: h })
        if (piRes.ok && !cancelled) setPayInfo(await piRes.json() as PayInfo)
      } catch { /* оплата необязательна */ }

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
    return () => { cancelled = true; stopPolling(); if (payPollRef.current) clearInterval(payPollRef.current) }
  }, [])

  // Сидируем форму профиля при первой загрузке профиля.
  useEffect(() => {
    if (!profile) return
    setPNick(profile.nickname); setPFull(profile.fullName); setPPhone(profile.phone)
    setPBirthday(profile.birthday); setPPhoto(profile.photoUrl)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Если бонусы скрыты владельцем — не показываем и бонусные строки в истории.
    const bonus: FeedItem[] = bonusHidden ? [] : bonusHist.map(b => ({
      id: 'b' + b.id, date: b.createdAt, emoji: b.amount >= 0 ? '⭐' : '🔄',
      label: b.reason || (b.amount >= 0 ? 'Начисление бонусов' : 'Списание бонусов'),
      sign: b.amount >= 0 ? 1 : -1, amount: Math.abs(b.amount), unit: '⭐',
    }))
    return [...money, ...bonus].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, bonusHist, bonusHidden])

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
          <p style={{ color: '#94A3B8', marginTop: 16, fontSize: 14 }}>Загрузка…</p>
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
            Совет: добавьте приложение на экран «Домой» — и открывайте его как приложение. Код нужен только один раз на устройстве.
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
  const effectivePhoto = pPhoto || profile?.tgPhotoUrl || profile?.gomafiaPhotoUrl || null

  // Выбор назначения оплаты с префиллом суммы.
  function pickPurpose(p: Purpose) {
    setPayPurpose(p)
    setPayMsg('')
    if (p === 'debt') setPayAmount(debt > 0 ? String(Math.round(debt)) : '')
    else if (p === 'fund') setPayAmount(payInfo?.fund.suggested ? String(Math.round(payInfo.fund.suggested)) : '')
    else setPayAmount('')
  }

  // Создание онлайн-платежа: открываем ссылку эквайера и опрашиваем статус.
  async function startPayment() {
    if (!token || paying) return
    const amt = Math.round((parseFloat(payAmount.replace(',', '.')) || 0) * 100) / 100
    if (!(amt >= 1)) { setPayMsg('Введите сумму'); return }
    setPaying(true); setPayMsg('')
    try {
      const r = await fetch(`${API_URL}/api/auth/me/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ purpose: payPurpose, amount: amt }),
      })
      const d = await r.json() as { paymentId?: string; paymentUrl?: string; error?: string }
      if (!r.ok || !d.paymentUrl || !d.paymentId) { setPayMsg(d.error || 'Не удалось создать платёж'); setPaying(false); return }
      // Открываем страницу оплаты эквайера (СБП), не QR.
      window.open(d.paymentUrl, '_blank')
      setPayMsg('Открыли страницу оплаты. После оплаты вернитесь сюда — баланс обновится автоматически.')
      const paymentId = d.paymentId
      const startedAt = Date.now()
      if (payPollRef.current) clearInterval(payPollRef.current)
      payPollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > 8 * 60 * 1000) { if (payPollRef.current) clearInterval(payPollRef.current); setPaying(false); return }
        try {
          const sr = await fetch(`${API_URL}/api/auth/me/payments/${paymentId}`, { headers: authHeaders() })
          if (!sr.ok) return
          const sd = await sr.json() as { status: string }
          if (sd.status === 'confirmed') {
            if (payPollRef.current) clearInterval(payPollRef.current)
            setPaying(false); setPayMsg('Оплата прошла ✓')
            await refreshData()
            setTab('feed')
          } else if (sd.status === 'failed') {
            if (payPollRef.current) clearInterval(payPollRef.current)
            setPaying(false); setPayMsg('Платёж не прошёл. Попробуйте ещё раз.')
          }
        } catch { /* повторим на след. тике */ }
      }, 3000)
    } catch {
      setPayMsg('Ошибка сети. Попробуйте ещё раз.'); setPaying(false)
    }
  }

  // Загрузка аватара → URL из MinIO (применится при сохранении профиля).
  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !token) return
    setAvatarUploading(true); setProfileMsg('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`${API_URL}/api/upload/image`, { method: 'POST', headers: authHeaders(), body: fd })
      const d = await r.json() as { url?: string; error?: string }
      if (r.ok && d.url) setPPhoto(d.url)
      else setProfileMsg(d.error || 'Не удалось загрузить фото')
    } catch { setProfileMsg('Ошибка загрузки фото') }
    setAvatarUploading(false)
  }

  async function saveProfile() {
    if (!token || savingProfile) return
    if (!pNick.trim()) { setProfileMsg('Укажите никнейм'); return }
    setSavingProfile(true); setProfileMsg('')
    try {
      const r = await fetch(`${API_URL}/api/auth/me`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ nickname: pNick.trim(), fullName: pFull.trim(), phone: pPhone.trim(), birthday: pBirthday || null, photoUrl: pPhoto }),
      })
      const d = await r.json() as { error?: string }
      if (!r.ok) { setProfileMsg(d.error || 'Не удалось сохранить'); setSavingProfile(false); return }
      setProfileMsg('Сохранено ✓')
      await refreshData()
    } catch { setProfileMsg('Ошибка сохранения') }
    setSavingProfile(false)
  }

  return (
    <div style={styles.app}>{keyframes}
      <div style={styles.scroll}>

        {/* ─────────── ЛЕНТА ─────────── */}
        {tab === 'feed' && (
          <>
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
                <div style={styles.holo} />
                <div style={{ ...styles.glare, background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.5), rgba(255,255,255,0) 45%)` }} />
                <div style={styles.cardShade} />
                <div style={styles.cardContent}>
                  <div style={styles.cardTop}>
                    <span style={styles.brand}>TITAN</span>
                    <span style={styles.tierBadge(tierColor)}>{tierLabel}</span>
                  </div>
                  <div>
                    {bonusHidden ? (
                      <p style={styles.cardSoon}>Скоро тут появятся бонусы ⭐</p>
                    ) : (
                      <>
                        <p style={styles.cardBonusLabel}>Бонусный баланс</p>
                        <p style={styles.cardBonus}>{bonus.toLocaleString('ru')} <span style={{ fontSize: 24 }}>⭐</span></p>
                      </>
                    )}
                    <p style={styles.cardNick}>@{profile?.nickname || 'гость'}</p>
                  </div>
                </div>
              </div>
            </div>

            {expiringBonus && !bonusHidden && (
              <p style={styles.bonusExpiry}>🔥 {Math.round(expiringBonus.remaining)} бонусов сгорают {formatExpiryDate(expiringBonus.expiresAt)}</p>
            )}

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

            <p style={styles.feedTitle}>История</p>
            <div style={styles.feed}>
              {feed.length === 0 ? (
                <p style={{ color: '#94A3B8', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>Операций пока нет</p>
              ) : feed.slice(0, feedShown).map(it => (
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
            {feed.length > feedShown && (
              <button onClick={() => setFeedShown(n => n + FEED_PAGE)} style={styles.showMore}>
                Показать ещё {Math.min(FEED_PAGE, feed.length - feedShown)}
              </button>
            )}
          </>
        )}

        {/* ─────────── ОПЛАТА ─────────── */}
        {tab === 'pay' && (
          <>
            <p style={styles.screenTitle}>Оплата</p>
            {payInfo && !payInfo.sbpReady ? (
              <div style={styles.notice}>Онлайн-оплата сейчас недоступна. Обратитесь к администратору клуба.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  {([
                    { key: 'debt' as Purpose, title: 'Погасить долг', sub: debt > 0 ? `Текущий долг ${formatAmount(debt)} ₽` : 'Долга сейчас нет', emoji: '💳' },
                    { key: 'deposit' as Purpose, title: 'Внести депозит', sub: 'Пополнить личный счёт', emoji: '🟢' },
                    ...(payInfo?.fund.available ? [{ key: 'fund' as Purpose, title: 'Внести фонд клуба', sub: payInfo.fund.name || 'Взнос резидента', emoji: '🏛️' }] : []),
                  ]).map(opt => {
                    const active = payPurpose === opt.key
                    return (
                      <button key={opt.key} type="button" onClick={() => pickPurpose(opt.key)} style={{ ...styles.payOpt, border: active ? '1.5px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)', background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: active ? '#c4b5fd' : '#fff' }}>{opt.title}</div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{opt.sub}</div>
                        </div>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: active ? '5px solid #8B5CF6' : '2px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
                      </button>
                    )
                  })}
                </div>

                <label style={styles.fieldLabel}>Сумма, ₽</label>
                <input type="number" inputMode="decimal" min="1" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" style={styles.input} />

                <button onClick={startPayment} disabled={paying || !payAmount} style={{ ...styles.primaryBtn, opacity: paying || !payAmount ? 0.6 : 1, marginTop: 16 }}>
                  {paying ? 'Ожидаем оплату…' : 'Оплатить'}
                </button>
                {payMsg && <p style={{ fontSize: 13, color: payMsg.includes('✓') ? '#4ade80' : '#94A3B8', margin: '14px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>{payMsg}</p>}
                <p style={{ fontSize: 11.5, color: '#64748B', margin: '16px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>
                  Оплата через СБП эквайера клуба. Откроется страница банка — подтвердите перевод и вернитесь в приложение.
                </p>
              </>
            )}
          </>
        )}

        {/* ─────────── ПРОФИЛЬ ─────────── */}
        {tab === 'profile' && (
          <>
            <p style={styles.screenTitle}>Профиль</p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}>
              <label style={{ cursor: 'pointer', position: 'relative' }}>
                <input type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
                {effectivePhoto ? (
                  <img src={effectivePhoto} alt="avatar" style={styles.avatar} />
                ) : (
                  <div style={{ ...styles.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.18)', fontSize: 38, fontWeight: 800, color: '#a78bfa' }}>
                    {(pNick || profile?.nickname || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span style={styles.avatarEdit}>{avatarUploading ? '…' : '✎'}</span>
              </label>
              <span style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>Нажмите на фото, чтобы изменить</span>
            </div>

            <label style={styles.fieldLabel}>Никнейм</label>
            <input value={pNick} onChange={e => setPNick(e.target.value)} maxLength={40} style={styles.input} />

            <label style={styles.fieldLabel}>Имя</label>
            <input value={pFull} onChange={e => setPFull(e.target.value)} maxLength={120} placeholder="Как к вам обращаться" style={styles.input} />

            <label style={styles.fieldLabel}>Телефон</label>
            <input value={pPhone} onChange={e => setPPhone(e.target.value)} inputMode="tel" maxLength={40} placeholder="+7…" style={styles.input} />

            <label style={styles.fieldLabel}>Дата рождения</label>
            <input type="date" value={pBirthday} onChange={e => setPBirthday(e.target.value)} style={styles.input} />

            <button onClick={saveProfile} disabled={savingProfile} style={{ ...styles.primaryBtn, opacity: savingProfile ? 0.6 : 1, marginTop: 20 }}>
              {savingProfile ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {profileMsg && <p style={{ fontSize: 13, color: profileMsg.includes('✓') ? '#4ade80' : '#f87171', margin: '14px 2px 0', textAlign: 'center' }}>{profileMsg}</p>}
          </>
        )}
      </div>

      {/* ─────────── Нижняя навигация ─────────── */}
      <nav style={styles.bottomNav}>
        {([
          { id: 'feed' as Tab, label: 'Лента', icon: ICON_FEED },
          { id: 'pay' as Tab, label: 'Оплата', icon: ICON_PAY },
          { id: 'profile' as Tab, label: 'Профиль', icon: ICON_PROFILE },
        ]).map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ ...styles.navBtn, color: active ? '#a78bfa' : '#6b7280' }}>
              <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </button>
          )
        })}
      </nav>

      {/* ─────────── Деталь чека ─────────── */}
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

// ─── Иконки нижней навигации (inline SVG, stroke=currentColor) ─────────────────
const ICON_FEED = (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></>)
const ICON_PAY = (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>)
const ICON_PROFILE = (<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></>)

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  // Экраны loading/error/code (центрируем; собственный скролл при нужде).
  root: {
    height: '100dvh', overflowY: 'auto' as const, backgroundColor: '#15121b', display: 'flex', flexDirection: 'column' as const,
    padding: 'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  // Главный экран: фикс-shell — фон не скролится, скролит ТОЛЬКО .scroll.
  app: {
    position: 'fixed' as const, inset: 0, backgroundColor: '#15121b',
    display: 'flex', flexDirection: 'column' as const, overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  // Скролл-контейнер контента. overscroll-behavior-x:none + touch-action:pan-y —
  // запрет горизонтального «оттягивания»/свайпа; вертикальная инерция iOS сохранена.
  scroll: {
    flex: 1, overflowY: 'auto' as const, overflowX: 'hidden' as const,
    WebkitOverflowScrolling: 'touch' as const, overscrollBehaviorY: 'contain' as const, overscrollBehaviorX: 'none' as const,
    touchAction: 'pan-y' as const,
    padding: 'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 20px calc(16px + env(safe-area-inset-left))',
  },
  bottomNav: {
    flexShrink: 0, display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(21,18,27,0.96)', backdropFilter: 'blur(12px)',
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  navBtn: {
    flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 0 9px',
  } as React.CSSProperties,

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
  codeCopyBtn: { background: 'transparent', border: 'none', color: '#a78bfa', fontSize: 14, fontWeight: 600, padding: '6px 10px', cursor: 'pointer' } as React.CSSProperties,
  codeTgBtn: {
    marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', color: '#fff', fontSize: 15, fontWeight: 700,
    padding: '13px 22px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 10px 28px rgba(109,40,217,0.4)',
  } as React.CSSProperties,

  screenTitle: { color: '#fff', fontSize: 22, fontWeight: 800, margin: '4px 0 16px 2px' },
  fieldLabel: { display: 'block', color: '#94A3B8', fontSize: 12, fontWeight: 600, margin: '14px 0 6px 2px' } as React.CSSProperties,
  input: {
    width: '100%', boxSizing: 'border-box' as const, padding: '13px 14px', borderRadius: 12, fontSize: 16,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', outline: 'none',
  } as React.CSSProperties,
  primaryBtn: {
    width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', color: '#fff', fontSize: 16, fontWeight: 800,
    boxShadow: '0 10px 28px rgba(109,40,217,0.35)',
  } as React.CSSProperties,
  notice: { padding: '14px 16px', borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)', color: '#fbbf24', fontSize: 13.5, lineHeight: 1.5 },
  payOpt: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14, cursor: 'pointer' } as React.CSSProperties,
  showMore: {
    width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12, cursor: 'pointer',
    background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: 14, fontWeight: 600,
  } as React.CSSProperties,

  avatar: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid rgba(139,92,246,0.5)' } as React.CSSProperties,
  avatarEdit: {
    position: 'absolute' as const, right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%',
    background: '#8B5CF6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, border: '2px solid #15121b',
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
  cardSoon: { fontSize: 22, fontWeight: 800, fontStyle: 'italic' as const, margin: 0, lineHeight: 1.25, maxWidth: 240, textShadow: '0 2px 10px rgba(0,0,0,0.4)' } as React.CSSProperties,
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
