'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { openSse } from '@/lib/sse'
import { differenceInMinutes } from 'date-fns'
import { Icon } from '@/components/Icon'

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

interface ProfileData {
  id: string
  nickname: string
  role: string
  linkedSpaceId?: string | null
}

export default function TabletPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [spaceRental, setSpaceRental] = useState(0)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Получаем профиль планшета (linkedSpaceId)
  const { data: profileData } = useQuery({
    queryKey: ['tablet', 'profile'],
    queryFn: () => api.get<{ player: ProfileData }>(`/pos/players/${user!.id}`).then(r => r.player),
    enabled: !!user?.id,
  })

  const linkedSpaceId = profileData?.linkedSpaceId

  // Ищем открытый чек для этого пространства
  const { data: checksData, isLoading, refetch } = useQuery({
    queryKey: ['tablet', 'space-check', linkedSpaceId],
    queryFn: () => api.get<{ checks: CheckData[] }>(`/pos/checks?spaceId=${linkedSpaceId}`),
    enabled: !!linkedSpaceId,
    refetchInterval: 10_000,
  })

  const activeCheck = checksData?.checks?.[0] ?? null

  // Активное событие для пространства
  const { data: eventData } = useQuery({
    queryKey: ['tablet', 'event', linkedSpaceId],
    queryFn: () => api.get<{ event: any }>(`/events/active-for-space/${linkedSpaceId}`),
    enabled: !!linkedSpaceId,
    refetchInterval: 60_000,
  })
  const activeEvent = eventData?.event ?? null

  // Кнопка «Вызвать персонал»
  const staffCall = useMutation({
    mutationFn: () => api.post('/notifications/staff-call', { spaceId: linkedSpaceId }),
    onSuccess: () => {
      setToastMsg('Персонал уведомлён')
      setTimeout(() => setToastMsg(null), 3000)
    },
    onError: (err: any) => {
      setToastMsg(err?.message ?? 'Не удалось вызвать персонал')
      setTimeout(() => setToastMsg(null), 3000)
    },
  })

  // Кнопка «Запросить счёт»
  const requestBill = useMutation({
    mutationFn: () => api.post('/notifications/request-bill', { checkId: activeCheck!.id }),
    onSuccess: () => {
      setToastMsg('Счёт запрошен')
      setTimeout(() => setToastMsg(null), 3000)
    },
    onError: (err: any) => {
      setToastMsg(err?.message ?? 'Не удалось запросить счёт')
      setTimeout(() => setToastMsg(null), 3000)
    },
  })

  // SSE для realtime обновлений
  const sseRef = useRef<EventSource | null>(null)
  useEffect(() => {
    if (!activeCheck?.id) return
    const token = useAuthStore.getState().token
    if (!token) return

    // Одноразовый SSE-тикет вместо JWT в URL. Открытие асинхронное.
    let cancelled = false
    let es: EventSource | null = null
    openSse(`/pos/checks/${activeCheck.id}/events`).then((stream) => {
      if (cancelled) { stream.close(); return }
      es = stream
      sseRef.current = stream
      stream.onmessage = () => { refetch() }
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

  // ─── Ожидание открытия сессии ─────────────────────────────────────────────
  if (!isLoading && !activeCheck) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40 }}>
        <div style={{
          width: 100, height: 100, borderRadius: 32,
          background: 'rgba(139,92,246,0.1)',
          border: '1px solid rgba(139,92,246,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="meeting_room" size={52} color="#A78BFA" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: 'var(--on-surface)', margin: '0 0 12px' }}>
            TITAN HUB
          </h1>
          <p style={{ fontSize: 16, color: 'var(--on-surface-variant)', margin: 0 }}>
            Ожидание открытия сессии…
          </p>
          <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', marginTop: 8 }}>
            Администратор откроет счёт — он появится здесь автоматически
          </p>
        </div>

        {/* Пульсирующий индикатор */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#A78BFA',
            boxShadow: '0 0 8px rgba(139,92,246,0.6)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Ожидание подключения</span>
        </div>

        <style>{`@keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.3;} }`}</style>
      </div>
    )
  }

  // ─── Загрузка ─────────────────────────────────────────────────────────────
  if (isLoading || !activeCheck) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="refresh" size={36} color="rgba(204,195,216,0.3)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─── Активный чек ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '20px 28px',
        background: 'rgba(29,26,36,0.6)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            TITAN HUB
          </h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
            {activeCheck.guestName || 'Ваш столик'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => staffCall.mutate()}
            disabled={staffCall.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 20px', borderRadius: 16, border: '1px solid rgba(245,158,11,0.4)', cursor: 'pointer',
              background: 'rgba(245,158,11,0.1)',
              color: '#F59E0B', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            <Icon name="support_agent" size={20} />
            ВЫЗВАТЬ
          </button>
          <button
            onClick={() => router.push('/tablet/order')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 24px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
              boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
            }}
          >
            <Icon name="add_shopping_cart" size={22} />
            ЗАКАЗАТЬ
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* Активное событие */}
        {activeEvent && (
          <div style={{
            borderRadius: 20, padding: '20px 24px', marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(76,215,246,0.08))',
            border: '1px solid rgba(139,92,246,0.3)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
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
                <Icon name="meeting_room" size={16} />
                Аренда (текущая)
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#A78BFA' }}>
                +{spaceRental.toLocaleString('ru')} ₽
              </span>
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
              <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--on-surface)', margin: 0 }}>
                {activeCheck.items.length}
              </p>
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
              <div
                key={ci.checkItem.id}
                className="glass-l2"
                style={{ borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                  background: 'rgba(139,92,246,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="restaurant_menu" size={22} color="#A78BFA" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ci.item?.name ?? '—'}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
                    {parseFloat(ci.checkItem.priceAtTime).toLocaleString('ru')} ₽ × {ci.checkItem.quantity}
                  </p>
                </div>
                <p style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, flexShrink: 0 }}>
                  {(parseFloat(ci.checkItem.priceAtTime) * ci.checkItem.quantity).toLocaleString('ru')} ₽
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Кнопка "Запросить счёт" — внизу */}
        {activeCheck.items.length > 0 && (
          <div style={{ marginTop: 24, paddingBottom: 24 }}>
            <button
              onClick={() => requestBill.mutate()}
              disabled={requestBill.isPending}
              style={{
                width: '100%', padding: '18px 0', borderRadius: 18, border: '1px solid rgba(16,185,129,0.3)', cursor: 'pointer',
                background: 'rgba(16,185,129,0.08)',
                color: '#10B981', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <Icon name="receipt_long" size={22} />
              {requestBill.isPending ? 'Отправляем…' : 'Запросить счёт'}
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          padding: '14px 24px', borderRadius: 16,
          background: 'rgba(29,26,36,0.95)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(139,92,246,0.4)',
          color: 'var(--on-surface)', fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="check_circle" size={18} color="#A78BFA" />
          {toastMsg}
        </div>
      )}
    </div>
  )
}
