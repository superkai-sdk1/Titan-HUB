'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { openSse } from '@/lib/sse'
import { differenceInMinutes } from 'date-fns'
import { Icon } from '@/components/Icon'
import { getTabletSpace, setTabletSpace, clearTabletSpace, type TabletSpace } from '@/lib/tabletSession'

interface CheckItem {
  checkItem: { id: string; quantity: number; priceAtTime: string }
  item: { id: string; name: string; price: string } | null
}

interface CheckData {
  id: string
  totalAmount: string
  status: string
  items: CheckItem[]
  guestName?: string
  spaceId?: string | null
  spaceStartAt?: string | null
  spaceHourlyRate?: string | null
}

// ════════════════════════════════════════════════════════════════════════════
// Корень: гейт сессии. Сессия активна, когда есть И staff-токен, И выбранное
// пространство. Иначе — экран входа (выбор пространства → PIN сотрудника).
// ════════════════════════════════════════════════════════════════════════════
export default function TabletPage() {
  const { token } = useAuthStore()
  const [space, setSpace] = useState<TabletSpace | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setSpace(getTabletSpace())
    setReady(true)
  }, [])

  const logout = useCallback(() => {
    useAuthStore.getState().logout()
    clearTabletSpace()
    setSpace(null)
  }, [])

  if (!ready) return null

  if (!token || !space) {
    return <TabletGate onReady={(sp) => setSpace(sp)} />
  }

  return <TabletMain space={space} onLogout={logout} />
}

// ════════════════════════════════════════════════════════════════════════════
// Экран входа: 1) выбор пространства  2) PIN сотрудника
// ════════════════════════════════════════════════════════════════════════════
function TabletGate({ onReady }: { onReady: (sp: TabletSpace) => void }) {
  const [step, setStep] = useState<'space' | 'pin'>('space')
  const [selected, setSelected] = useState<TabletSpace | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: spacesData, isLoading } = useQuery({
    queryKey: ['tablet', 'spaces-list'],
    queryFn: () => api.get<{ spaces: TabletSpace[] }>('/auth/tablet-spaces'),
  })
  const spaces = spacesData?.spaces ?? []

  async function submitPin(fullPin: string) {
    if (busy || !selected) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login/pin', { pin: fullPin })
      useAuthStore.getState().setAuth(res.token, res.user)
      setTabletSpace(selected)
      onReady(selected)
    } catch (e: any) {
      setError(e?.message ?? 'Неверный PIN')
      setPin('')
      setBusy(false)
    }
  }

  function pressDigit(d: string) {
    if (busy) return
    setError(null)
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + d
      if (next.length === 4) submitPin(next)
      return next
    })
  }

  // ─── Шаг 1: выбор пространства ──────────────────────────────────────────────
  if (step === 'space') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 40px', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: '0 0 8px', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            TITAN HUB
          </h1>
          <p style={{ fontSize: 16, color: 'var(--on-surface-variant)', margin: 0 }}>Выберите пространство</p>
        </div>

        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="refresh" size={36} color="rgba(204,195,216,0.3)" style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, maxWidth: 900, margin: '0 auto', width: '100%' }}>
            {spaces.map((sp) => (
              <button
                key={sp.id}
                onClick={() => { setSelected(sp); setPin(''); setError(null); setStep('pin') }}
                className="glass-l1"
                style={{
                  padding: '28px 24px', borderRadius: 24, border: '1px solid rgba(139,92,246,0.2)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--on-surface)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="meeting_room" size={34} color="#A78BFA" />
                </div>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{sp.name}</span>
              </button>
            ))}
            {spaces.length === 0 && (
              <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--on-surface-variant)' }}>Нет доступных пространств</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Шаг 2: PIN сотрудника ──────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <button
        onClick={() => { setStep('space'); setPin(''); setError(null) }}
        style={{ position: 'absolute', top: 28, left: 28, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface-variant)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        <Icon name="arrow_back" size={18} /> Пространство
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, color: '#A78BFA' }}>
        <Icon name="meeting_room" size={20} />
        <span style={{ fontSize: 17, fontWeight: 800 }}>{selected?.name}</span>
      </div>
      <p style={{ fontSize: 15, color: 'var(--on-surface-variant)', margin: '0 0 28px' }}>PIN сотрудника, ответственного за счёт</p>

      {/* Точки-индикаторы */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, height: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: '50%',
            background: i < pin.length ? 'linear-gradient(135deg,#8B5CF6,#4cd7f6)' : 'transparent',
            border: i < pin.length ? 'none' : '2px solid rgba(255,255,255,0.2)',
            transition: 'all 0.1s',
          }} />
        ))}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600, margin: '0 0 20px', minHeight: 18 }}>{error}</p>}

      {/* Цифровая клавиатура */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 88px)', gap: 16 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => pressDigit(d)} disabled={busy} style={padBtnStyle}>{d}</button>
        ))}
        <div />
        <button onClick={() => pressDigit('0')} disabled={busy} style={padBtnStyle}>0</button>
        <button onClick={() => { setError(null); setPin((p) => p.slice(0, -1)) }} disabled={busy} style={{ ...padBtnStyle, fontSize: 24 }}>
          <Icon name="backspace" size={26} />
        </button>
      </div>

      {busy && (
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface-variant)' }}>
          <Icon name="refresh" size={20} style={{ animation: 'spin 1s linear infinite' }} /> Проверка…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  )
}

const padBtnStyle: React.CSSProperties = {
  width: 88, height: 88, borderRadius: 24, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 32, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ════════════════════════════════════════════════════════════════════════════
// Финальный экран: «Оплачено» / «Счёт закрыт» → авто-выход в выбор пространства
// ════════════════════════════════════════════════════════════════════════════
function FinishScreen({ kind, onDone }: { kind: 'paid' | 'closed'; onDone: () => void }) {
  const [count, setCount] = useState(6)
  useEffect(() => {
    const iv = setInterval(() => setCount((c) => Math.max(0, c - 1)), 1000)
    const to = setTimeout(onDone, 6000)
    return () => { clearInterval(iv); clearTimeout(to) }
  }, [onDone])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 }}>
      <div style={{ width: 130, height: 130, borderRadius: '50%', background: 'rgba(16,185,129,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check_circle" size={78} color="#10B981" />
      </div>
      <h2 style={{ fontSize: 36, fontWeight: 900, color: '#10B981', margin: 0, fontStyle: 'italic', textTransform: 'uppercase' }}>
        {kind === 'paid' ? 'Оплачено!' : 'Счёт закрыт'}
      </h2>
      <p style={{ fontSize: 17, color: 'rgba(204,195,216,0.7)', margin: 0 }}>Спасибо! Хорошего дня 🙌</p>
      <button onClick={onDone} style={{ marginTop: 12, padding: '16px 40px', borderRadius: 16, border: 'none', background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
        Готово
      </button>
      <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Возврат к выбору пространства через {count}…</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Основной интерфейс гостя (для выбранного пространства)
// ════════════════════════════════════════════════════════════════════════════
function TabletMain({ space, onLogout }: { space: TabletSpace; onLogout: () => void }) {
  const router = useRouter()
  const { user } = useAuthStore()
  const [spaceRental, setSpaceRental] = useState(0)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [qr, setQr] = useState<{ qrDataUrl: string; chargedAmount: number; tip: number } | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const [finished, setFinished] = useState<null | 'paid' | 'closed'>(null)
  const hadCheckRef = useRef(false)

  // Открытый чек для этого пространства
  const { data: checksData, isLoading, refetch } = useQuery({
    queryKey: ['tablet', 'space-check', space.id],
    queryFn: () => api.get<{ checks: CheckData[] }>(`/pos/checks?spaceId=${space.id}`),
    refetchInterval: 10_000,
  })
  const activeCheck = checksData?.checks?.[0] ?? null

  // Активное событие для пространства
  const { data: eventData } = useQuery({
    queryKey: ['tablet', 'event', space.id],
    queryFn: () => api.get<{ event: any }>(`/events/active-for-space/${space.id}`),
    refetchInterval: 60_000,
  })
  const activeEvent = eventData?.event ?? null

  // Закрытие чека (персоналом из кассы ИЛИ самооплатой) → завершаем сессию.
  useEffect(() => {
    if (activeCheck) {
      hadCheckRef.current = true
    } else if (hadCheckRef.current && !finished) {
      setFinished('closed')
    }
  }, [activeCheck, finished])

  // Вызвать персонал
  const staffCall = useMutation({
    mutationFn: () => api.post('/notifications/staff-call', { spaceId: space.id }),
    onSuccess: () => { setToastMsg('Персонал уведомлён'); setTimeout(() => setToastMsg(null), 3000) },
    onError: (err: any) => { setToastMsg(err?.message ?? 'Не удалось вызвать персонал'); setTimeout(() => setToastMsg(null), 3000) },
  })

  // Запросить счёт
  const requestBill = useMutation({
    mutationFn: () => api.post('/notifications/request-bill', { checkId: activeCheck!.id }),
    onSuccess: () => { setToastMsg('Счёт запрошен'); setTimeout(() => setToastMsg(null), 3000) },
    onError: (err: any) => { setToastMsg(err?.message ?? 'Не удалось запросить счёт'); setTimeout(() => setToastMsg(null), 3000) },
  })

  // Оплата по QR (СБП) — гость платит сам (+опц. чаевые), чек закроется вебхуком.
  const payQr = useMutation({
    mutationFn: (tip: number) => api.post<{ qrDataUrl: string; chargedAmount: number; baseAmount: number; tip: number }>(`/pos/checks/${activeCheck!.id}/qr`, { tip }),
    onSuccess: (r) => { setTipOpen(false); setQr({ qrDataUrl: r.qrDataUrl, chargedAmount: r.chargedAmount ?? r.baseAmount, tip: r.tip ?? 0 }) },
    onError: (err: any) => { setToastMsg(err?.message ?? 'Не удалось создать QR'); setTimeout(() => setToastMsg(null), 3000) },
  })

  // SSE для realtime
  useEffect(() => {
    if (!activeCheck?.id) return
    const token = useAuthStore.getState().token
    if (!token) return
    let cancelled = false
    let es: EventSource | null = null
    openSse(`/pos/checks/${activeCheck.id}/events`).then((stream) => {
      if (cancelled) { stream.close(); return }
      es = stream
      stream.onmessage = (ev) => {
        refetch()
        try {
          const m = JSON.parse(ev.data)
          if (m?.event === 'check:paid') setFinished('paid')
          else if (m?.event === 'check:closed') setFinished((prev) => prev ?? 'closed')
        } catch { /* ignore */ }
      }
    }).catch(() => {})
    return () => { cancelled = true; es?.close() }
  }, [activeCheck?.id, refetch])

  // Счётчик аренды
  useEffect(() => {
    if (!activeCheck?.spaceId || !activeCheck?.spaceStartAt || !activeCheck?.spaceHourlyRate) return
    const calc = () => {
      const mins = differenceInMinutes(new Date(), new Date(activeCheck.spaceStartAt!))
      setSpaceRental(Math.ceil(mins / 60) * parseFloat(activeCheck.spaceHourlyRate ?? '0'))
    }
    calc()
    const t = setInterval(calc, 30_000)
    return () => clearInterval(t)
  }, [activeCheck])

  const baseTotal = parseFloat(activeCheck?.totalAmount ?? '0')
  const total = baseTotal + spaceRental

  // Финальный экран перекрывает всё и сам делает авто-выход.
  if (finished) return <FinishScreen kind={finished} onDone={onLogout} />

  // Верхняя панель: пространство + ответственный сотрудник + выход (всегда).
  const topBar = (
    <div style={{
      padding: '16px 24px', background: 'rgba(29,26,36,0.6)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {space.name}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="badge" size={13} /> {user?.nickname ?? 'Сотрудник'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        {activeCheck && (
          <>
            <button onClick={() => staffCall.mutate()} disabled={staffCall.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(245,158,11,0.4)', cursor: 'pointer', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Icon name="support_agent" size={18} /> Вызвать
            </button>
            <button onClick={() => router.push('/tablet/order')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', boxShadow: '0 4px 20px rgba(139,92,246,0.35)' }}>
              <Icon name="add_shopping_cart" size={20} /> Заказать
            </button>
          </>
        )}
        <button onClick={onLogout} title="Сменить пространство" style={{ width: 46, height: 46, borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="logout" size={20} />
        </button>
      </div>
    </div>
  )

  // QR-оверлей (ожидание оплаты). Финальный экран обрабатывается отдельно выше.
  const qrOverlay = qr ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,8,14,0.93)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: '#fff', margin: '0 0 8px' }}>Оплата по СБП</h2>
        <p style={{ color: 'rgba(204,195,216,0.7)', fontSize: 16, margin: '0 0 24px' }}>Отсканируйте QR камерой или приложением банка</p>
        <div style={{ background: '#fff', borderRadius: 24, padding: 18, display: 'inline-block' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.qrDataUrl} alt="QR для оплаты" style={{ width: 300, height: 300, display: 'block' }} />
        </div>
        <p style={{ fontSize: 44, fontWeight: 900, fontStyle: 'italic', color: '#fff', margin: '24px 0 0', fontVariantNumeric: 'tabular-nums' }}>{qr.chargedAmount.toLocaleString('ru')} ₽</p>
        {qr.tip > 0 && (
          <p style={{ fontSize: 14, color: '#34D399', margin: '6px 0 0', fontWeight: 600 }}>в т.ч. чаевые {qr.tip.toLocaleString('ru')} ₽ 💚</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, color: 'rgba(204,195,216,0.7)', fontSize: 15 }}>
          <Icon name="hourglass_top" size={18} /> Ожидаем оплату…
        </div>
        <button onClick={() => setQr(null)} style={{ marginTop: 24, padding: '12px 28px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(204,195,216,0.7)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
      </div>
    </div>
  ) : null

  // Выбор чаевых перед генерацией QR. Пресеты — % от суммы счёта (округление до ₽).
  const tipPresets = [0, 5, 10, 15]
  const tipOverlay = tipOpen ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,8,14,0.93)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 440, width: '100%' }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: '#fff', margin: '0 0 6px' }}>Добавить чаевые?</h2>
        <p style={{ color: 'rgba(204,195,216,0.7)', fontSize: 15, margin: '0 0 6px' }}>Спасибо команде за вечер 💚</p>
        <p style={{ color: 'rgba(204,195,216,0.5)', fontSize: 14, margin: '0 0 24px' }}>Счёт: {total.toLocaleString('ru')} ₽</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {tipPresets.map((pct) => {
            const tipRub = Math.round(total * pct / 100)
            return (
              <button
                key={pct}
                onClick={() => payQr.mutate(tipRub)}
                disabled={payQr.isPending}
                style={{
                  padding: '20px 0', borderRadius: 18, cursor: 'pointer',
                  border: pct === 0 ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(16,185,129,0.4)',
                  background: pct === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.12)',
                  color: pct === 0 ? 'rgba(204,195,216,0.85)' : '#34D399',
                  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 900 }}>{pct === 0 ? 'Без чаевых' : `${pct}%`}</span>
                {pct > 0 && <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{tipRub.toLocaleString('ru')} ₽</span>}
              </button>
            )
          })}
        </div>
        {payQr.isPending && (
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(204,195,216,0.7)', fontSize: 15 }}>
            <Icon name="hourglass_top" size={18} /> Готовим QR…
          </div>
        )}
        <button onClick={() => setTipOpen(false)} disabled={payQr.isPending} style={{ marginTop: 22, padding: '12px 28px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(204,195,216,0.7)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
      </div>
    </div>
  ) : null

  // ─── Содержимое: загрузка / ожидание открытия / активный чек ────────────────
  let content: React.ReactNode
  if (isLoading) {
    content = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="refresh" size={36} color="rgba(204,195,216,0.3)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  } else if (!activeCheck) {
    content = (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40 }}>
        <div style={{ width: 100, height: 100, borderRadius: 32, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="meeting_room" size={52} color="#A78BFA" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, color: 'var(--on-surface)', margin: '0 0 8px', fontWeight: 700 }}>Ожидание открытия сессии…</p>
          <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.45)', margin: 0 }}>Администратор откроет счёт из кассы — он появится здесь автоматически</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A78BFA', boxShadow: '0 0 8px rgba(139,92,246,0.6)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Ожидание подключения</span>
        </div>
        <style>{`@keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.3;} }`}</style>
      </div>
    )
  } else {
    content = (
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Активное событие */}
        {activeEvent && (
          <div style={{ borderRadius: 20, padding: '20px 24px', marginBottom: 20, background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(76,215,246,0.08))', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="event" size={26} color="#A78BFA" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: '#A78BFA', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Сейчас идёт</p>
              <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: 'var(--on-surface)' }}>{activeEvent.title || 'Мероприятие'}</p>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>
                {activeEvent.startTime}{activeEvent.endTime ? ` — ${activeEvent.endTime}` : ''}
                {activeEvent.paymentType === 'fixed' && activeEvent.fixedAmount ? ` · ${parseFloat(activeEvent.fixedAmount).toLocaleString('ru')} ₽` : ''}
                {activeEvent.paymentType === 'per_head' && activeEvent.perHeadAmount ? ` · ${parseFloat(activeEvent.perHeadAmount).toLocaleString('ru')} ₽/чел` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Total + rental */}
        <div className="glass-l1" style={{ borderRadius: 24, padding: '24px 28px', marginBottom: 24 }}>
          {spaceRental > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="meeting_room" size={16} /> Аренда (текущая)
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#A78BFA' }}>+{spaceRental.toLocaleString('ru')} ₽</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Ваш счёт</p>
              <p style={{ fontSize: 48, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: 0, color: 'var(--on-surface)', lineHeight: 1 }}>
                {total.toLocaleString('ru')} <span style={{ fontSize: 24 }}>₽</span>
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>Позиций</p>
              <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--on-surface)', margin: 0 }}>{activeCheck.items.length}</p>
            </div>
          </div>
        </div>

        {/* Items list */}
        {activeCheck.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--on-surface-variant)' }}>
            <Icon name="shopping_cart" size={48} style={{ display: 'block', marginBottom: 16, opacity: 0.3 }} />
            <p style={{ fontSize: 16, margin: 0 }}>Нет позиций в счёте</p>
            <p style={{ fontSize: 14, margin: '8px 0 0', opacity: 0.6 }}>Нажмите «Заказать», чтобы добавить</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeCheck.items.map((ci) => (
              <div key={ci.checkItem.id} className="glass-l2" style={{ borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="restaurant_menu" size={22} color="#A78BFA" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ci.item?.name ?? '—'}</p>
                  <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{parseFloat(ci.checkItem.priceAtTime).toLocaleString('ru')} ₽ × {ci.checkItem.quantity}</p>
                </div>
                <p style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>{(parseFloat(ci.checkItem.priceAtTime) * ci.checkItem.quantity).toLocaleString('ru')} ₽</p>
              </div>
            ))}
          </div>
        )}

        {/* Запросить счёт + Оплатить */}
        {total > 0 && (
          <div style={{ marginTop: 24, paddingBottom: 24, display: 'flex', gap: 12 }}>
            <button onClick={() => requestBill.mutate()} disabled={requestBill.isPending} style={{ flex: 1, padding: '18px 0', borderRadius: 18, border: '1px solid rgba(245,158,11,0.35)', cursor: 'pointer', background: 'rgba(245,158,11,0.08)', color: '#F59E0B', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="support_agent" size={20} />
              {requestBill.isPending ? 'Отправляем…' : 'Запросить счёт'}
            </button>
            <button onClick={() => setTipOpen(true)} disabled={payQr.isPending} style={{ flex: 1, padding: '18px 0', borderRadius: 18, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10B981, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }}>
              <Icon name="qr_code_2" size={22} />
              {payQr.isPending ? 'Готовим QR…' : 'Оплатить'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {topBar}
      {content}

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', padding: '14px 24px', borderRadius: 16, background: 'rgba(29,26,36,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,92,246,0.4)', color: 'var(--on-surface)', fontSize: 14, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="check_circle" size={18} color="#A78BFA" />
          {toastMsg}
        </div>
      )}

      {tipOverlay}
      {qrOverlay}
    </div>
  )
}
