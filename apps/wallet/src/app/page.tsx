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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { styles } from '../components/styles'
import { BottomNav, type Tab } from '../components/BottomNav'
import { BalanceCard } from '../components/BalanceCard'
import { FeedRow } from '../components/FeedRow'
import {
  TIER_COLORS, TIER_LABELS, PAY_LABELS,
  formatAmount, formatDate, getTransactionEmoji, isPositive,
  nearestExpiringLot, formatExpiryDate, pluralVisits,
  type UserProfile, type Transaction, type BonusRow, type BonusLot,
  type VisitProgress, type FeedItem, type CheckDetail, type PayInfo,
} from '../hooks/money'

// API — ОТНОСИТЕЛЬНЫЙ (same-origin): пусто → запросы идут на `/api/...` текущего
// хоста. Это и есть мультитенантность: kbr.titanpos.ru/residents → kbr.titanpos.ru/api,
// и tenantContext на API резолвит нужный клуб по Host. (env может переопределить.)
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
// Токен входа из браузера/PWA храним локально — чтобы не вводить код при каждом
// открытии (Telegram Mini App авторизуется заново сам, поэтому там не нужен).
const STORAGE_KEY = 'titan_wallet_token'
const FEED_PAGE = 20
// Единый поллер обновления данных. Активен — когда вкладка видна и есть токен.
// При document.hidden поллинг останавливается (экономия батареи/сети).
const REFRESH_INTERVAL = 20_000
// Поллинг статуса онлайн-платежа: чаще (нужна оперативность), с таймаутом.
const PAY_POLL_INTERVAL = 3_000
const PAY_POLL_TIMEOUT = 8 * 60 * 1000

type AppState = 'loading' | 'error' | 'main' | 'code'
type Purpose = 'debt' | 'deposit' | 'fund'

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
  const [payUrl, setPayUrl] = useState<string | null>(null) // ссылка-фолбэк при блокировке popup
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
  const [loggingOut, setLoggingOut] = useState(false)

  // Модалка чека — для focus-trap/возврата фокуса.
  const checkModalRef = useRef<HTMLDivElement>(null)
  const checkTriggerRef = useRef<HTMLElement | null>(null)

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

  // Перезагрузка данных (после оплаты / сохранения профиля / по таймеру). Использует текущий токен.
  const refreshData = useCallback(async (t = token) => {
    if (!t) return
    try {
      const meRes = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } })
      if (meRes.ok) applyMe(await meRes.json())
    } catch { /* ignore */ }
    try {
      const txRes = await fetch(`${API_URL}/api/auth/me/transactions?limit=200`, { headers: { Authorization: `Bearer ${t}` } })
      if (txRes.ok) {
        const d = (await txRes.json()) as { transactions: any[] }
        setTransactions((d.transactions ?? []).map((x) => ({ id: x.id, type: x.type, description: x.description ?? x.type, amount: Number(x.amount) || 0, createdAt: x.createdAt, checkId: x.checkId ?? null })))
      }
    } catch { /* ignore */ }
    try {
      const bhRes = await fetch(`${API_URL}/api/auth/me/bonus-history?limit=200`, { headers: { Authorization: `Bearer ${t}` } })
      if (bhRes.ok) {
        const bh = (await bhRes.json()) as { history?: any[] }
        setBonusHist((bh.history ?? []).map((b) => ({ id: b.id, amount: Number(b.amount) || 0, reason: b.reason ?? null, createdAt: b.createdAt })))
      }
    } catch { /* ignore */ }
    try {
      const lotsRes = await fetch(`${API_URL}/api/auth/me/bonus-lots`, { headers: { Authorization: `Bearer ${t}` } })
      if (lotsRes.ok) {
        const lotsData = (await lotsRes.json()) as { lots?: any[] }
        setBonusLots((lotsData.lots ?? []).map((l) => ({ amount: Number(l.amount) || 0, remaining: Number(l.remaining) || 0, expiresAt: l.expiresAt ?? null })))
      }
    } catch { /* ignore */ }
  }, [token])

  async function openCheckDetail(checkId: string) {
    if (!token) return
    // Запоминаем элемент-триггер, чтобы вернуть фокус при закрытии модалки.
    checkTriggerRef.current = (document.activeElement as HTMLElement) ?? null
    setCheckLoading(true)
    try {
      const r = await fetch(`${API_URL}/api/auth/me/checks/${checkId}`, { headers: authHeaders() })
      if (r.ok) setOpenCheck(await r.json() as CheckDetail)
    } catch { /* ignore */ }
    setCheckLoading(false)
  }

  function closeCheck() {
    setOpenCheck(null)
    setCheckLoading(false)
    // Возврат фокуса на элемент, открывший модалку.
    try { checkTriggerRef.current?.focus() } catch { /* noop */ }
  }

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

  // ── Единый фоновый поллер данных (заменил агрессивный двойной поллинг). ──
  // Resident-доступного SSE на бэке нет (оба SSE-потока требуют роль staff/owner),
  // поэтому остаёмся на HTTP-поллинге, но: один интервал, редкий (20с) и СТОП при
  // скрытой вкладке. Сразу подтягиваем свежие данные при возврате на вкладку.
  useEffect(() => {
    if (appState !== 'main' || !token) return
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = () => { if (!document.hidden) refreshData() }
    const start = () => { if (timer) return; timer = setInterval(tick, REFRESH_INTERVAL) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVisibility = () => {
      if (document.hidden) { stop() } else { refreshData(); start() }
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) start()
    return () => { document.removeEventListener('visibilitychange', onVisibility); stop() }
  }, [appState, token, refreshData])

  // Сидируем форму профиля при первой загрузке профиля.
  useEffect(() => {
    if (!profile) return
    setPNick(profile.nickname); setPFull(profile.fullName); setPPhone(profile.phone)
    setPBirthday(profile.birthday); setPPhoto(profile.photoUrl)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Модалка чека: Esc для закрытия + фокус-trap внутри диалога. ──
  useEffect(() => {
    if (!openCheck && !checkLoading) return
    // Перенесём фокус на контейнер модалки при открытии.
    const el = checkModalRef.current
    if (el) { try { el.focus() } catch { /* noop */ } }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closeCheck(); return }
      if (e.key !== 'Tab') return
      const root = checkModalRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) return
      const first = focusables[0], last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openCheck, checkLoading]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <div style={styles.spinner} role="status" aria-label="Загрузка" />
          <p style={{ color: '#94A3B8', marginTop: 16, fontSize: 14 }}>Загрузка…</p>
        </div>
      </div>
    )
  }
  if (appState === 'error') {
    return (
      <div style={styles.root}>{keyframes}
        <div style={styles.centered}>
          <span style={{ fontSize: 64 }} aria-hidden="true">⚠️</span>
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
            <div style={styles.spinnerSmall} role="status" aria-label="Ожидание подтверждения" />
            <span style={{ color: '#94A3B8', fontSize: 13 }}>Ждём подтверждения…</span>
          </div>
          <p style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', margin: '24px 0 0', lineHeight: 1.5, maxWidth: 300 }}>
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

  // Остановить ожидание оплаты (кнопка «Отменить ожидание» / новый платёж).
  function stopPayWaiting(msg = '') {
    if (payPollRef.current) { clearInterval(payPollRef.current); payPollRef.current = null }
    setPaying(false)
    setPayUrl(null)
    if (msg !== undefined) setPayMsg(msg)
  }

  // Создание онлайн-платежа.
  // ВАЖНО про popup-блокер iOS: окно нельзя открывать ПОСЛЕ await fetch (теряется
  // «жест пользователя» → Safari блокирует window.open молча). Поэтому открываем
  // вкладку-плейсхолдер СИНХРОННО по клику, а после получения URL — навигируем её.
  // Если окно всё же заблокировано — показываем явную кнопку-ссылку «Перейти к оплате».
  async function startPayment() {
    if (!token || paying) return
    const amt = Math.round((parseFloat(payAmount.replace(',', '.')) || 0) * 100) / 100
    if (!(amt >= 1)) { setPayMsg('Введите сумму'); return }

    // Открываем пустую вкладку синхронно (в обработчике клика) — это сохраняет жест.
    const payWindow = window.open('', '_blank')
    setPaying(true); setPayMsg(''); setPayUrl(null)
    try {
      const r = await fetch(`${API_URL}/api/auth/me/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ purpose: payPurpose, amount: amt }),
      })
      const d = await r.json() as { paymentId?: string; paymentUrl?: string; error?: string }
      if (!r.ok || !d.paymentUrl || !d.paymentId) {
        try { payWindow?.close() } catch { /* noop */ }
        setPayMsg(d.error || 'Не удалось создать платёж'); setPaying(false); return
      }
      // Направляем заранее открытую вкладку на страницу банка.
      if (payWindow && !payWindow.closed) {
        try { payWindow.location.href = d.paymentUrl } catch { /* перейдём по ссылке-фолбэку */ }
        setPayMsg('Открыли страницу оплаты. После оплаты вернитесь — баланс обновится автоматически.')
      } else {
        // Popup заблокирован — даём явную ссылку-кнопку.
        setPayUrl(d.paymentUrl)
        setPayMsg('Окно банка не открылось. Нажмите «Перейти к оплате» ниже.')
      }
      const paymentId = d.paymentId
      const startedAt = Date.now()
      if (payPollRef.current) clearInterval(payPollRef.current)
      payPollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > PAY_POLL_TIMEOUT) {
          stopPayWaiting('Время ожидания истекло. Если вы оплатили — баланс обновится сам; иначе попробуйте снова.')
          return
        }
        try {
          const sr = await fetch(`${API_URL}/api/auth/me/payments/${paymentId}`, { headers: authHeaders() })
          if (!sr.ok) return
          const sd = await sr.json() as { status: string }
          if (sd.status === 'confirmed') {
            stopPayWaiting('Оплата прошла ✓')
            await refreshData()
            setTab('feed')
          } else if (sd.status === 'failed') {
            stopPayWaiting('Платёж не прошёл. Попробуйте ещё раз.')
          }
        } catch { /* повторим на след. тике */ }
      }, PAY_POLL_INTERVAL)
    } catch {
      try { payWindow?.close() } catch { /* noop */ }
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

  // ── Выход / смена аккаунта. Серверно отзывает токен (POST /auth/logout),
  // чистит localStorage и перезагружает приложение → экран кода входа. ──
  async function logout() {
    if (loggingOut) return
    if (!window.confirm('Выйти из аккаунта? На этом устройстве потребуется снова войти по коду.')) return
    setLoggingOut(true)
    // Останавливаем висящий поллинг оплаты (если был).
    if (payPollRef.current) { clearInterval(payPollRef.current); payPollRef.current = null }
    try {
      if (token) await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', headers: authHeaders() })
    } catch { /* выходим локально даже если сервер недоступен */ }
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
    // Жёсткая перезагрузка — гарантированно сбрасывает весь in-memory стейт и
    // заново проходит boot() → экран входа по коду. Telegram Mini App логинится сам.
    try { window.location.reload() } catch { setToken(null); setAppState('loading') }
  }

  return (
    <div style={styles.app}>{keyframes}
      <div style={styles.scroll}>

        {/* ─────────── ЛЕНТА ─────────── */}
        {tab === 'feed' && (
          <>
            <BalanceCard
              tierColor={tierColor}
              tierLabel={tierLabel}
              bonus={bonus}
              bonusHidden={bonusHidden}
              nickname={profile?.nickname ?? ''}
            />

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
                <FeedRow key={it.id} item={it} onOpenCheck={openCheckDetail} />
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
                      <button key={opt.key} type="button" onClick={() => pickPurpose(opt.key)} aria-pressed={active} style={{ ...styles.payOpt, border: active ? '1.5px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)', background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: 24 }} aria-hidden="true">{opt.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: active ? '#c4b5fd' : '#fff' }}>{opt.title}</div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{opt.sub}</div>
                        </div>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: active ? '5px solid #8B5CF6' : '2px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
                      </button>
                    )
                  })}
                </div>

                <label htmlFor="pay-amount" style={styles.fieldLabel}>Сумма, ₽</label>
                <input id="pay-amount" type="number" inputMode="decimal" min="1" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" style={styles.input} />
                {(() => {
                  const base = Math.round((parseFloat(payAmount.replace(',', '.')) || 0) * 100) / 100
                  if (!(base >= 1)) return null
                  const charged = Math.round(base * 1.08 * 100) / 100
                  return (
                    <p style={{ fontSize: 13, color: '#a78bfa', margin: '10px 2px 0', lineHeight: 1.5 }}>
                      К оплате с учётом эквайринга 8%: <b style={{ color: '#fff' }}>{formatAmount(charged)} ₽</b>
                    </p>
                  )
                })()}

                <button onClick={startPayment} disabled={paying || !payAmount} style={{ ...styles.primaryBtn, opacity: paying || !payAmount ? 0.6 : 1, marginTop: 16 }}>
                  {paying ? 'Ожидаем оплату…' : 'Оплатить'}
                </button>

                {/* Явная ссылка-кнопка — фолбэк, если popup банка заблокирован iOS. */}
                {payUrl && (
                  <a href={payUrl} target="_blank" rel="noreferrer" style={styles.payLinkBtn}>Перейти к оплате →</a>
                )}

                {/* Кнопка отмены ожидания — чтобы не висеть в заблокированном состоянии. */}
                {paying && (
                  <button type="button" onClick={() => stopPayWaiting('Ожидание отменено. Если вы оплатили — баланс обновится сам.')} style={{ ...styles.secondaryBtn, marginTop: 12 }}>
                    Отменить ожидание
                  </button>
                )}

                {payMsg && <p role="status" style={{ fontSize: 13, color: payMsg.includes('✓') ? '#4ade80' : '#94A3B8', margin: '14px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>{payMsg}</p>}
                <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '16px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>
                  Оплата через СБП эквайера клуба. Откроется страница банка — подтвердите перевод и вернитесь в приложение. +8% берёт банк-эквайер, не клуб.
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
              <span style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>Нажмите на фото, чтобы изменить</span>
            </div>

            <label htmlFor="p-nick" style={styles.fieldLabel}>Никнейм</label>
            <input id="p-nick" value={pNick} onChange={e => setPNick(e.target.value)} maxLength={40} style={styles.input} />

            <label htmlFor="p-full" style={styles.fieldLabel}>Имя</label>
            <input id="p-full" value={pFull} onChange={e => setPFull(e.target.value)} maxLength={120} placeholder="Как к вам обращаться" style={styles.input} />

            <label htmlFor="p-phone" style={styles.fieldLabel}>Телефон</label>
            <input id="p-phone" className="selectable" value={pPhone} onChange={e => setPPhone(e.target.value)} inputMode="tel" maxLength={40} placeholder="+7…" style={styles.input} />

            <label htmlFor="p-birthday" style={styles.fieldLabel}>Дата рождения</label>
            <input id="p-birthday" type="date" value={pBirthday} onChange={e => setPBirthday(e.target.value)} style={styles.input} />

            <button onClick={saveProfile} disabled={savingProfile} style={{ ...styles.primaryBtn, opacity: savingProfile ? 0.6 : 1, marginTop: 20 }}>
              {savingProfile ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {profileMsg && <p role="status" style={{ fontSize: 13, color: profileMsg.includes('✓') ? '#4ade80' : '#f87171', margin: '14px 2px 0', textAlign: 'center' }}>{profileMsg}</p>}

            {/* Выход / смена аккаунта — приватность на общем устройстве. */}
            <button onClick={logout} disabled={loggingOut} style={{ ...styles.logoutBtn, opacity: loggingOut ? 0.6 : 1 }}>
              {loggingOut ? 'Выходим…' : 'Выйти'}
            </button>
            <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '10px 2px 0', textAlign: 'center', lineHeight: 1.5 }}>
              Выход завершит сеанс на этом устройстве — войти снова можно по коду.
            </p>
          </>
        )}
      </div>

      {/* ─────────── Нижняя навигация ─────────── */}
      <BottomNav tab={tab} onChange={setTab} />

      {/* ─────────── Деталь чека ─────────── */}
      {(openCheck || checkLoading) && (
        <div onClick={e => { if (e.target === e.currentTarget) closeCheck() }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div
            ref={checkModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Детали чека"
            tabIndex={-1}
            style={{ width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, padding: 20, background: '#1d1a24', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}>
            {!openCheck ? (
              <p style={{ textAlign: 'center', color: '#94A3B8', padding: '30px 0' }}>Загрузка…</p>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#fff' }}>Чек</h3>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>{formatDate(openCheck.check.closedAt || openCheck.check.createdAt)}</p>
                  </div>
                  <button onClick={closeCheck} aria-label="Закрыть" style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
                <div className="selectable" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
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
                  <span className="selectable" style={{ fontSize: 20, fontWeight: 800, fontStyle: 'italic', color: '#fff' }}>{formatAmount(openCheck.check.totalAmount)} ₽</span>
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
