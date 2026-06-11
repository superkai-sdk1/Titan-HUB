'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { Icon } from '@/components/Icon'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { funnyGuestName } from '@/lib/funnyName'
import { useCurrentShift } from '@/hooks/useShift'
import { OpenShiftModal, CloseShiftModal } from '@/components/ShiftModals'
import { differenceInMinutes } from 'date-fns'
import { CheckDetailView } from '@/components/CheckDetailView'
import { PullToRefreshContainer } from '@/components/PullToRefreshContainer'
import { useToast } from '@/components/Toast'
import { NotificationBell } from '@/components/NotificationBell'
import { useNotifications } from '@/components/NotificationsProvider'

interface CheckCard {
  id: string
  createdAt: string
  totalAmount: string
  itemCount: number
  status: string
  note?: string
  guestName?: string
  spaceName?: string
  hasRental?: boolean
  spaceStartAt?: string | null
  spaceEndAt?: string | null
  spaceHourlyRate?: string | null
  eventBaseAmount?: string | null
  spaceId?: string | null
}

interface PlayerResult {
  id: string
  nickname: string
  clientTier: string
  balance: string
  bonusPoints: string
  photoUrl: string | null
}

interface SpaceResult {
  id: string
  name: string
  type: string
  hourlyRate: string
  isActive: boolean
}

// Стандартизированный тариф из /tariffs. itemId — backing-позиция меню,
// которую добавляем в чек при выборе тарифа.
interface TariffOption {
  id: string
  name: string
  price: string | number
  color?: string | null
  isActive?: boolean
  itemId?: string | null
}

type NewCheckStep = 'search' | 'tariff' | 'new_client' | 'space'

// Нормальное время нахождения — 8 часов. До него таймер просто считается
// (нейтральный), последние 30 мин — мягкое жёлтое предупреждение, после 8ч — красный.
const NORMAL_STAY_MIN = 8 * 60

function getTimerColor(createdAt: string, now: number): string {
  const mins = differenceInMinutes(now, new Date(createdAt))
  if (mins >= NORMAL_STAY_MIN) return 'var(--danger)'
  if (mins >= NORMAL_STAY_MIN - 30) return 'var(--warning)'
  return 'var(--on-surface-variant)'
}

function formatElapsed(createdAt: string, now: number): string {
  const mins = differenceInMinutes(now, new Date(createdAt))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

// Аренда зоны: ceil(минуты/60) × ставка. До spaceEndAt (если задан) либо до now
// (живой счётчик). Тем же правилом считает бэкенд при оплате.
function computeRental(startAt: string | null | undefined, endAt: string | null | undefined, hourlyRate: string | null | undefined, now: number): number {
  if (!startAt || !hourlyRate) return 0
  const end = endAt ? new Date(endAt).getTime() : now
  const mins = Math.max(0, (end - new Date(startAt).getTime()) / 60000)
  return Math.ceil(mins / 60) * (parseFloat(hourlyRate) || 0)
}

function getInitials(name?: string | null): string {
  if (!name) return 'Г'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

// Красное мигание — только после 8ч (для обычных гостей и почасовой аренды).
function isWarning(createdAt: string, now: number): boolean {
  return differenceInMinutes(now, new Date(createdAt)) >= NORMAL_STAY_MIN
}


const TIER_LABELS: Record<string, string> = {
  guest: 'Гость',
  resident: 'Резидент',
  student: 'Студент',
}

// Маппинг clientTier → название тарифа в меню
const TIER_TO_TARIFF_NAME: Record<string, string> = {
  guest: 'Гость',
  resident: 'Резидент',
  student: 'Студент',
}

// Цветовая палитра тарифов (по индексу)
const TARIFF_PALETTE = [
  { color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', selBg: 'rgba(139,92,246,0.22)', selBorder: 'rgba(139,92,246,0.65)' },
  { color: '#10B981', bg: 'rgba(16,185,129,0.15)',  selBg: 'rgba(16,185,129,0.22)',  selBorder: 'rgba(16,185,129,0.65)'  },
  { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  selBg: 'rgba(245,158,11,0.22)',  selBorder: 'rgba(245,158,11,0.65)'  },
  { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  selBg: 'rgba(59,130,246,0.22)',  selBorder: 'rgba(59,130,246,0.65)'  },
  { color: '#F43F5E', bg: 'rgba(244,63,94,0.15)',   selBg: 'rgba(244,63,94,0.22)',   selBorder: 'rgba(244,63,94,0.65)'   },
  { color: '#4cd7f6', bg: 'rgba(76,215,246,0.15)',  selBg: 'rgba(76,215,246,0.22)',  selBorder: 'rgba(76,215,246,0.65)'  },
]

// ── Умный поиск: раскладка + транслитерация ───────────────────────────────
const EN_TO_RU: Record<string, string> = {
  q:'й',w:'ц',e:'у',r:'к',t:'е',y:'н',u:'г',i:'ш',o:'щ',p:'з','[':'х',']':'ъ',
  a:'ф',s:'ы',d:'в',f:'а',g:'п',h:'р',j:'о',k:'л',l:'д',';':'ж',"'":'э',
  z:'я',x:'ч',c:'с',v:'м',b:'и',n:'т',m:'ь',',':'б','.':'ю',
}

function switchLayout(s: string): string {
  return s.toLowerCase().split('').map(c => EN_TO_RU[c] ?? c).join('')
}

function latinToRu(s: string): string {
  return s.toLowerCase()
    .replace(/shch/g,'щ').replace(/sch/g,'щ').replace(/sh/g,'ш')
    .replace(/zh/g,'ж').replace(/ch/g,'ч').replace(/ts/g,'ц').replace(/kh/g,'х')
    .replace(/ya/g,'я').replace(/yu/g,'ю').replace(/yo/g,'ё').replace(/ye/g,'е')
    .replace(/a/g,'а').replace(/b/g,'б').replace(/v/g,'в').replace(/g/g,'г')
    .replace(/d/g,'д').replace(/e/g,'е').replace(/z/g,'з').replace(/i/g,'и')
    .replace(/y/g,'й').replace(/k/g,'к').replace(/l/g,'л').replace(/m/g,'м')
    .replace(/n/g,'н').replace(/o/g,'о').replace(/p/g,'п').replace(/r/g,'р')
    .replace(/s/g,'с').replace(/t/g,'т').replace(/u/g,'у').replace(/f/g,'ф')
    .replace(/h/g,'х')
}

function isLatin(s: string): boolean { return /[a-zA-Z]/.test(s) }

function getSearchVariants(q: string): string[] {
  const variants = new Set<string>([q.toLowerCase()])
  if (isLatin(q)) {
    variants.add(switchLayout(q))
    variants.add(latinToRu(q))
  }
  return [...variants].filter(Boolean)
}

const SPACE_TYPE_LABELS: Record<string, string> = {
  small_booth: 'Малая кабинка',
  large_booth: 'Большая кабинка',
  hall: 'Зал',
}

function PosPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()

  const { data: shift, isLoading: shiftLoading } = useCurrentShift()

  // Таймер для обновления времени на карточках чеков каждые 30 секунд
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── Регулируемый сплит (десктоп/планшет ≥1024): ширина правой панели чека ──
  // Тянется мышью или пальцем за ручку между панелями; сохраняется в localStorage.
  const splitRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const saved = parseInt(localStorage.getItem('pos-split-w') ?? '')
    if (saved && splitRef.current) splitRef.current.style.setProperty('--pos-right-w', `${saved}px`)
  }, [])
  const startSplitDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const root = splitRef.current
    if (!root) return
    let last = 0
    const onMove = (ev: PointerEvent) => {
      // Ширина правой панели = расстояние от курсора до правого края окна.
      last = Math.round(Math.min(Math.max(window.innerWidth - ev.clientX, 420), Math.min(960, window.innerWidth - 480)))
      root.style.setProperty('--pos-right-w', `${last}px`)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (last) localStorage.setItem('pos-split-w', String(last))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [])

  const { data: checksData, isLoading, refetch: refetchChecks } = useQuery({
    queryKey: ['checks', 'active'],
    queryFn: () => api.get<{ checks: CheckCard[] }>('/pos/checks'),
    refetchInterval: 5000,
    enabled: !!shift,
  })

  const { show: showToast } = useToast()

  const createCheck = useMutation({
    mutationFn: async (body: { note?: string; playerId?: string; spaceId?: string; tariffItemId?: string; linkedEventId?: string }) => {
      const { tariffItemId, ...checkBody } = body
      // Привязка к событию: если открываем чек на зону, у которой сейчас идёт
      // активное мероприятие, прикрепляем его linkedEventId — бэкенд тогда
      // инкрементит число гостей события. (UI выбора события в кассе нет —
      // событие определяется по активной зоне через /events/active-for-space.)
      if (checkBody.spaceId && !checkBody.linkedEventId) {
        try {
          const { event } = await api.get<{ event: { id: string } | null }>(`/events/active-for-space/${checkBody.spaceId}`)
          if (event?.id) checkBody.linkedEventId = event.id
        } catch {
          // не блокируем открытие чека, если проверка события упала
        }
      }
      const res = await api.post<{ check: { id: string } }>('/pos/checks', checkBody)
      if (tariffItemId) {
        // itemId — правильное имя поля согласно AddItemSchema на бэкенде
        await api.post(`/pos/checks/${res.check.id}/items`, { itemId: tariffItemId, quantity: 1 })
          .catch(() => {}) // не блокировать навигацию если добавление позиции упало
      }
      return res
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['checks'] })
      setShowNewCheck(false)
      router.push(`/pos/${res.check.id}`)
    },
    onError: (e) => showToast(e instanceof ApiError ? String((e.data as Record<string, unknown>)?.error ?? 'Не удалось создать чек') : 'Ошибка сети', 'error'),
  })

  const createClient = useMutation({
    // POST /clients возвращает { client: {...} } — раньше читали .profile.id (undefined),
    // из-за чего открытие чека падало молча: клиент создавался, а чек не открывался.
    mutationFn: (body: { nickname: string; clientTier: string }) =>
      api.post<{ client: { id: string } }>('/clients', body),
  })

  // Open shift modal state
  const [showOpenShift, setShowOpenShift] = useState(false)

  // New check modal state
  const [showNewCheck, setShowNewCheck] = useState(false)
  const [newCheckStep, setNewCheckStep] = useState<NewCheckStep>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null)
  const [newClientNick, setNewClientNick] = useState('')
  const [newClientTier, setNewClientTier] = useState('newbie')
  const [selectedTariffId, setSelectedTariffId] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Desktop split-view: активный чек справа
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null)

  // Close shift modal state
  const [showCloseShift, setShowCloseShift] = useState(false)

  // Открыть модал закрытия смены если URL содержит ?close=1 (из Sidebar)
  useEffect(() => {
    if (searchParams.get('close') === '1') {
      setShowCloseShift(true)
      // Убираем параметр из URL без перехода
      router.replace('/pos')
    }
  }, [searchParams, router])

  // Birthdays
  const [showBirthdays, setShowBirthdays] = useState(false)
  const [birthdaysShown, setBirthdaysShown] = useState(false)

  const { data: birthdaysData } = useQuery({
    queryKey: ['shifts', 'birthdays-today'],
    queryFn: () => api.get<{ birthdays: { id: string; nickname: string; birthday: string | null }[] }>('/shifts/birthdays-today'),
    enabled: !!shift && !birthdaysShown,
  })

  useEffect(() => {
    if (birthdaysData?.birthdays?.length && !birthdaysShown) {
      setShowBirthdays(true)
      setBirthdaysShown(true)
    }
  }, [birthdaysData, birthdaysShown])

  // Spaces for rental step
  const { data: spacesData } = useQuery({
    queryKey: ['pos', 'spaces'],
    queryFn: () => api.get<{ spaces: SpaceResult[] }>('/pos/spaces'),
    enabled: newCheckStep === 'space',
  })

  // Тарифы из стандартизированного справочника /tariffs (активные). У каждого
  // тарифа есть backing itemId — его и добавляем позицией в чек при выборе.
  const { data: tariffsData } = useQuery({
    queryKey: ['pricing', 'tariffs'],
    queryFn: () => api.get<{ tariffs: TariffOption[] } | TariffOption[]>('/pricing/tariffs'),
    enabled: newCheckStep === 'tariff',
  })
  const allTariffs: TariffOption[] = Array.isArray(tariffsData) ? tariffsData : (tariffsData?.tariffs ?? [])
  const tariffItems = allTariffs.filter(t => t.isActive !== false)

  // Предвыбор тарифа по тиру клиента (матч tariff.name ↔ метка тира)
  useEffect(() => {
    if (newCheckStep !== 'tariff' || !tariffsData || !selectedPlayer) return
    const expectedName = TIER_TO_TARIFF_NAME[selectedPlayer.clientTier]
    if (!expectedName) { setSelectedTariffId(null); return }
    const match = tariffItems.find(t => t.name.toLowerCase() === expectedName.toLowerCase())
    setSelectedTariffId(match?.id ?? null)
  }, [newCheckStep, tariffsData, selectedPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced smart player search (layout switch + transliteration)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const variants = getSearchVariants(searchQuery)
        const results = await Promise.all(
          variants.map(v =>
            api.get<{ players: PlayerResult[] }>(`/pos/players/search?q=${encodeURIComponent(v)}`)
              .then(r => r.players).catch(() => [] as PlayerResult[])
          )
        )
        // Merge + deduplicate by id, preserve order
        const seen = new Set<string>()
        const merged: PlayerResult[] = []
        for (const list of results) {
          for (const p of list) {
            if (!seen.has(p.id)) { seen.add(p.id); merged.push(p) }
          }
        }
        setSearchResults(merged)
      } catch {
        setSearchResults([])
      }
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  function openNewCheckModal() {
    setShowNewCheck(true)
    setNewCheckStep('search')
    setSearchQuery('')
    setSearchResults([])
    setSelectedPlayer(null)
    setNewClientNick('')
    setNewClientTier('guest')
  }

  function closeNewCheckModal() {
    setShowNewCheck(false)
  }

  // FAB в BottomNav открывает новый чек через CustomEvent
  useEffect(() => {
    const handler = () => { if (shift) openNewCheckModal() }
    window.addEventListener('titan:new-check', handler)
    return () => window.removeEventListener('titan:new-check', handler)
  }, [shift])

  const checks = checksData?.checks ?? []

  // «Пульс» карточки чека: непрочитанное обращение гостя (чат / вызов / заказ /
  // запрос счёта). staff_call привязан к пространству (без checkId), остальные — к чеку.
  const { notifications: appNotifs } = useNotifications()
  const ATTENTION_TYPES = new Set(['staff_call', 'request_bill', 'client_order', 'chat_message'])
  function checkNeedsAttention(card: CheckCard): boolean {
    return appNotifs.some((n) => {
      if (n.isRead || !ATTENTION_TYPES.has(n.type)) return false
      const m = (n.meta ?? {}) as Record<string, unknown>
      return m['checkId'] === card.id || (n.type === 'staff_call' && !!card.spaceId && m['spaceId'] === card.spaceId)
    })
  }

  const avgTime = checks.length
    ? Math.round(checks.reduce((acc, c) => acc + differenceInMinutes(now, new Date(c.createdAt)), 0) / checks.length)
    : 0

  // Определяем режим split-view через CSS media
  // На десктопе клик открывает панель справа, на мобильном — навигация
  function handleCheckClick(checkId: string) {
    if (window.innerWidth >= 1024) {
      setActiveCheckId(checkId)
    } else {
      router.push(`/pos/${checkId}`)
    }
  }

  // paddingBottom:0 на корне перебивает глобальное правило
  // `.layout-content > :last-child { padding-bottom: --bottom-nav-clear }`: для
  // height:100% flex-контейнера этот отступ укорачивал видимую область и создавал
  // «мёртвую» полосу, перекрывавшую чеки. Клиренс под плавающую нижнюю навигацию
  // перенесён на саму сетку карточек (.pos-cards-grid, прокручиваемый контент).
  return (
    <div ref={splitRef} style={{ height: '100%', display: 'flex', flexDirection: 'row', overflow: 'hidden', paddingBottom: 0 }}>
      {/* Left panel — список чеков (всегда виден) */}
      <div className="pos-left-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

      {/* Page header */}
      <div className="pos-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Left: title + count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 className="pos-header-title" style={{ margin: 0, flexShrink: 0, letterSpacing: '-0.01em', color: 'var(--on-surface)' }}>Касса</h2>
            {checks.length > 0 && (
              <div className="glass-l2" style={{ borderRadius: 999, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Icon name="groups" size={13} color="var(--on-surface-variant)" />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{checks.length}</span>
              </div>
            )}
          </div>

          {/* Right: action icon buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Возврат — только мобильный режим (на десктопе есть нижняя панель) */}
            {shift && (
              <button
                onClick={() => router.push('/manage/refunds')}
                className="glass-l2 pos-header-actions"
                title="Возврат"
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Icon name="money_return" size={18} color="var(--on-surface-variant)" />
              </button>
            )}
            {/* Колокольчик уведомлений: бейдж непрочитанных + тряска при важных */}
            <NotificationBell />
          </div>
        </div>
      </div>
      <style>{`
        .pos-header {
          padding: 10px 14px 8px;
        }
        .pos-header-title {
          font-size: 18px;
          font-weight: 800;
        }
        /* На десктопе шапку с иконками прячем — там есть нижняя панель */
        @media (min-width: 1024px) {
          .pos-header {
            padding: 24px 32px 0;
          }
          .pos-header-title {
            font-size: 24px;
          }
          .pos-header-actions {
            display: none;
          }
        }
      `}</style>

      {/* Cards grid — scrollable */}
      <PullToRefreshContainer onRefresh={async () => { await refetchChecks() }} disabled={!shift}>
      <div className="pos-cards-wrap" style={{ flex: 1 }}>
        <div className="pos-cards-grid">
        <style>{`
          .pos-cards-wrap { padding: 8px 12px 12px; }
          .pos-cards-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            /* Клиренс под плавающую нижнюю навигацию кладём на сам прокручиваемый
               контент: последние карточки доезжают выше панели, без «мёртвой» полосы.
               На десктопе --bottom-nav-clear=0 (панель скрыта) → остаётся 16px. */
            padding-bottom: calc(16px + var(--bottom-nav-clear, 0px));
          }
          .pos-check-card { padding: 10px; }
          .pos-check-card .card-avatar { width: 28px; height: 28px; font-size: 11px; }
          .pos-check-card .card-name { font-size: 12px; }
          .pos-check-card .card-space { font-size: 10px; }
          .pos-check-card .card-badge { display: none; }
          .pos-check-card .card-amount { font-size: 20px; margin: 0 0 6px; }
          .pos-check-card .card-timer-icon { font-size: 12px; }
          .pos-check-card .card-timer-text { font-size: 11px; }
          .pos-check-card .card-items { font-size: 10px; }
          .pos-check-card .card-top { margin-bottom: 8px; gap: 7px; }
          @media (min-width: 480px) {
            .pos-cards-grid { gap: 12px; }
            .pos-check-card { padding: 12px; }
            .pos-check-card .card-avatar { width: 32px; height: 32px; font-size: 12px; }
            .pos-check-card .card-amount { font-size: 22px; }
          }
          @media (min-width: 1024px) {
            .pos-cards-wrap { padding: 0 32px 16px; }
            .pos-header { max-width: calc(var(--content-wide) + 64px); margin: 0 auto; width: 100%; box-sizing: border-box; }
            .pos-cards-grid {
              grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
              gap: 20px;
              padding-bottom: 24px;
              max-width: var(--content-wide);
              margin: 0 auto;
            }
            .pos-check-card { padding: 14px; border-radius: 20px !important; }
            .pos-check-card .card-avatar { width: 36px; height: 36px; font-size: 13px; }
            .pos-check-card .card-badge { display: flex; }
            .pos-check-card .card-amount { font-size: 28px; margin: 0 0 10px; }
            .pos-check-card .card-timer-icon { font-size: 14px; }
            .pos-check-card .card-timer-text { font-size: 12px; }
            .pos-check-card .card-items { font-size: 11px; }
            .pos-check-card .card-top { margin-bottom: 12px; gap: 10px; }
          }
        `}</style>

          {/* Skeleton loading */}
          {isLoading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: 20 }} />
          ))}

          {/* Check cards */}
          {checks.map((check, idx) => {
            const warn = isWarning(check.createdAt, now)
            const timerColor = getTimerColor(check.createdAt, now)
            const isActive = activeCheckId === check.id
            const attention = checkNeedsAttention(check)
            // Почасовая аренда: итог на карточке = позиции + живой счётчик аренды.
            const rental = computeRental(check.spaceStartAt, check.spaceEndAt, check.spaceHourlyRate, now)
            const displayTotal = parseFloat(check.totalAmount) + rental + (parseFloat(check.eventBaseAmount ?? '0') || 0)
            const cardName = check.guestName || funnyGuestName(check.id)
            return (
              <button
                key={check.id}
                onClick={() => handleCheckClick(check.id)}
                className={`glass-l2 ti-slide-up stagger-${Math.min(idx, 6)} pos-check-card${attention ? ' pos-card-attention' : ''}`}
                style={{
                  borderRadius: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: isActive ? '0 0 20px rgba(139,92,246,0.2)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  transition: 'all 0.3s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1.02)'
                  el.style.border = '1px solid rgba(139,92,246,0.5)'
                  el.style.boxShadow = '0 0 20px rgba(139,92,246,0.2)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1)'
                  el.style.border = '1px solid rgba(255,255,255,0.08)'
                  el.style.boxShadow = 'none'
                }}
              >
                {/* Полоса-маркер только для семантики «требует внимания» */}
                {attention && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#F59E0B', opacity: 0.9, pointerEvents: 'none' }} />}
                {attention && (
                  <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 26, height: 26, borderRadius: '50%', background: 'rgba(245,158,11,0.95)', boxShadow: '0 0 0 3px rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="notifications_active" size={15} color="#1a1622" />
                  </span>
                )}
                {/* Top: avatar + info + badge */}
                <div className="card-top" style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="card-avatar" style={{
                    borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(76,215,246,0.3))',
                    border: '1px solid rgba(139,92,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, color: '#A78BFA',
                  }}>
                    {getInitials(cardName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="card-name" style={{ fontWeight: 600, color: 'var(--on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cardName}
                    </p>
                    {check.spaceName && (
                      <p className="card-space" style={{ color: 'var(--on-surface-variant)', margin: 0 }}>{check.spaceName}</p>
                    )}
                  </div>
                  <div className="card-badge" style={{
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.3)',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#A78BFA',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                    alignItems: 'center',
                  }}>
                    Открыт
                  </div>
                </div>

                {/* Amount */}
                <p className="card-amount" style={{
                  fontWeight: 900,
                  
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--on-surface)',
                  lineHeight: 1,
                }}>
                  {displayTotal.toLocaleString('ru')} ₽
                </p>

                {/* Bottom: timer + items */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon
                      name={warn ? 'warning' : 'schedule'}
                      color={timerColor}
                      className="card-timer-icon"
                    />
                    <span className="card-timer-text" style={{
                      fontWeight: 600, color: timerColor,
                      animation: warn ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                    }}>
                      {formatElapsed(check.createdAt, now)}
                    </span>
                  </div>
                  {check.itemCount > 0 && (
                    <span className="card-items" style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      fontSize: 11,
                      color: 'var(--on-surface-variant)',
                    }}>
                      {check.itemCount} поз.
                    </span>
                  )}
                </div>

                {/* Rental stripe */}
                {check.hasRental && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)',
                  }} />
                )}
              </button>
            )
          })}

          {/* New check slot */}
          {shift && !isLoading && (
            <button
              onClick={openNewCheckModal}
              style={{
                borderRadius: 20,
                padding: 14,
                cursor: 'pointer',
                background: 'rgba(139,92,246,0.03)',
                border: '1.5px dashed rgba(139,92,246,0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                minHeight: 80,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(139,92,246,0.08)'
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(139,92,246,0.03)'
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(76,215,246,0.25))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="add" size={22} color="#A78BFA" />
              </div>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#A78BFA',
              }}>
                НОВЫЙ ЧЕК
              </span>
            </button>
          )}
        </div>
      </div>
      </PullToRefreshContainer>

      {/* Bottom action bar */}
      {shift && (
        <div className="pos-action-bar" style={{
          flexShrink: 0,
          background: 'rgba(29,26,36,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          gap: 8,
        }}>
        <style>{`
          /* На мобильном bottom bar скрыт — кнопки перенесены в шапку */
          .pos-action-bar { display: none; }
          @media (min-width: 1024px) {
            .pos-action-bar { display: flex; padding: 16px 32px; gap: 12px; }
            .pos-action-btn { padding: 12px 20px !important; border-radius: 14px !important; }
            .pos-action-btn .btn-label { display: inline; }
          }
        `}</style>
          <button
            onClick={openNewCheckModal}
            className="glass-l2 pos-action-btn"
            style={{
              border: '1px solid rgba(139,92,246,0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#A78BFA',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              transition: 'all 0.2s',
            }}
          >
            <Icon name="add_circle" size={18} />
            <span className="btn-label">НОВЫЙ СЧЁТ</span>
          </button>
          <button
            onClick={() => router.push('/manage/refunds')}
            className="glass-l2 pos-action-btn"
            style={{
              marginLeft: 'auto',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--on-surface-variant)',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <Icon name="money_return" size={18} />
            <span className="btn-label">ВОЗВРАТ</span>
          </button>
        </div>
      )}

      {/* No active shift overlay */}
      {!shiftLoading && !shift && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(21,18,27,0.8)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div
            className="glass-l1"
            style={{ borderRadius: 32, padding: '48px 40px', maxWidth: 380, width: '100%', textAlign: 'center' }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 24, marginLeft: 'auto', marginRight: 'auto',
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="schedule" size={30} color="#A78BFA" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8, color: 'var(--on-surface)' }}>
              СМЕНА НЕ ОТКРЫТА
            </h2>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 13, marginBottom: 28 }}>
              Откройте смену чтобы начать работу
            </p>
            <button
              onClick={() => setShowOpenShift(true)}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
              }}
            >
              Открыть смену
            </button>
          </div>
        </div>
      )}

      <OpenShiftModal open={showOpenShift} onClose={() => setShowOpenShift(false)} />

      {/* New Check Modal — multi-step */}
      {showNewCheck && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(13,21,38,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) closeNewCheckModal() }}
        >
          <div
            className="glass-l1"
            style={{ borderRadius: 32, maxWidth: 520, width: '100%', maxHeight: '90dvh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
          >
            {/* Step: search */}
            {newCheckStep === 'search' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                  }}>
                    <Icon name="receipt_long" size={26} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>
                      НОВЫЙ ЧЕК
                    </h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      ШАГ 1 — ВЫБЕРИТЕ ИГРОКА
                    </p>
                  </div>
                  <button
                    onClick={closeNewCheckModal}
                    style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>

                {/* Search input */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Имя игрока..."
                    className="glass-l2"
                    style={{
                      width: '100%', padding: '14px 14px 14px 44px', borderRadius: 14,
                      border: '1px solid rgba(139,92,246,0.25)', color: 'var(--on-surface)',
                      fontSize: 15, outline: 'none', background: 'none',
                    }}
                  />
                </div>

                {/* Search results */}
                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                    {searchResults.map(player => (
                      <button
                        key={player.id}
                        onClick={() => { setSelectedPlayer(player); setNewCheckStep('tariff') }}
                        className="glass-l2"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px', borderRadius: 14,
                          border: '1px solid rgba(255,255,255,0.07)',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.background = 'rgba(139,92,246,0.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = '' }}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(76,215,246,0.35))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#A78BFA',
                        }}>
                          {getInitials(player.nickname)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {player.nickname}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
                            {TIER_LABELS[player.clientTier] ?? player.clientTier}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pay-deposit)', background: 'rgba(6,182,212,0.1)', borderRadius: 6, padding: '2px 7px' }}>
                            {parseFloat(player.balance).toLocaleString('ru')} ₽
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pay-bonus)', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '2px 7px' }}>
                            ★ {parseFloat(player.bonusPoints).toLocaleString('ru')}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.trim() && searchResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0 8px', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                    Игрок не найден
                  </div>
                )}

                {/* Quick action buttons */}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    onClick={() => createCheck.mutate({})}
                    disabled={createCheck.isPending}
                    className="glass-l2"
                    style={{
                      flex: 1, padding: '12px 10px', borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer', color: 'var(--on-surface-variant)',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Icon name="person_off" size={16} />
                    БЕЗ КЛИЕНТА
                  </button>
                  <button
                    onClick={() => setNewCheckStep('new_client')}
                    className="glass-l2"
                    style={{
                      flex: 1, padding: '12px 10px', borderRadius: 14,
                      border: '1px solid rgba(76,215,246,0.3)',
                      cursor: 'pointer', color: '#4cd7f6',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Icon name="person_add" size={16} />
                    НОВЫЙ КЛИЕНТ
                  </button>
                  <button
                    onClick={() => setNewCheckStep('space')}
                    className="glass-l2"
                    style={{
                      flex: 1, padding: '12px 10px', borderRadius: 14,
                      border: '1px solid rgba(139,92,246,0.35)',
                      cursor: 'pointer', color: '#A78BFA',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Icon name="meeting_room" size={16} />
                    АРЕНДА
                  </button>
                </div>
              </div>
            )}

            {/* Step: tariff */}
            {newCheckStep === 'tariff' && selectedPlayer && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <button
                    onClick={() => setNewCheckStep('search')}
                    style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>ТАРИФ</h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      ШАГ 2 — ВЫБЕРИТЕ ТАРИФ
                    </p>
                  </div>
                </div>

                {/* Selected player display */}
                <div className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, marginBottom: 20, border: '1px solid rgba(139,92,246,0.25)' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(76,215,246,0.35))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#A78BFA',
                  }}>
                    {getInitials(selectedPlayer.nickname)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{selectedPlayer.nickname}</p>
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{TIER_LABELS[selectedPlayer.clientTier] ?? selectedPlayer.clientTier}</p>
                  </div>
                </div>

                {/* Tariff list — from /tariffs, with pre-selection by player tier */}
                {!tariffsData ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                    Загрузка тарифов…
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {tariffItems.map((item, idx) => {
                      const price = parseFloat(String(item.price)) || 0
                      const isSelected = selectedTariffId === item.id
                      const pal = TARIFF_PALETTE[idx % TARIFF_PALETTE.length]
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedTariffId(isSelected ? null : item.id)}
                          disabled={createCheck.isPending}
                          className="glass-l2"
                          style={{
                            padding: '18px 14px', borderRadius: 16,
                            border: isSelected ? `1px solid ${pal.selBorder}` : '1px solid rgba(255,255,255,0.08)',
                            background: isSelected ? pal.selBg : 'transparent',
                            boxShadow: isSelected ? `0 0 0 1px ${pal.selBorder}40` : 'none',
                            cursor: 'pointer', textAlign: 'left',
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                            gap: 10, transition: 'all 0.18s',
                            opacity: createCheck.isPending ? 0.6 : 1,
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: isSelected ? `${pal.color}44` : pal.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.18s',
                          }}>
                            <Icon name="confirmation_number" size={18} color={pal.color} />
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: isSelected ? '#fff' : 'var(--on-surface)' }}>{item.name}</p>
                            <p style={{ fontSize: 16, fontWeight: 900, margin: '4px 0 0', color: pal.color, fontVariantNumeric: 'tabular-nums' }}>
                              {price.toLocaleString('ru')} ₽
                            </p>
                          </div>
                        </button>
                      )
                    })}

                    {/* Без тарифа */}
                    {(() => {
                      const noTariff = selectedTariffId === null
                      return (
                        <button
                          onClick={() => setSelectedTariffId(null)}
                          disabled={createCheck.isPending}
                          style={{
                            gridColumn: '1 / -1',
                            padding: '14px 18px', borderRadius: 16,
                            border: noTariff ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                            background: noTariff ? 'rgba(255,255,255,0.06)' : 'transparent',
                            cursor: 'pointer', textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 12,
                            opacity: createCheck.isPending ? 0.6 : 1, transition: 'all 0.18s',
                          }}
                        >
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name="block" size={18} color="var(--on-surface-variant)" />
                          </div>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: noTariff ? 'var(--on-surface)' : 'var(--on-surface-variant)' }}>Без тарифа</span>
                            <p style={{ fontSize: 11, color: 'rgba(204,195,216,0.4)', margin: '2px 0 0' }}>Открыть счёт без добавления позиции</p>
                          </div>
                        </button>
                      )
                    })()}

                    {/* Confirm button */}
                    <button
                      onClick={() => {
                        const chosen = tariffItems.find(t => t.id === selectedTariffId)
                        createCheck.mutate({ playerId: selectedPlayer.id, tariffItemId: chosen?.itemId ?? undefined })
                      }}
                      disabled={createCheck.isPending}
                      style={{
                        gridColumn: '1 / -1',
                        marginTop: 4, width: '100%', padding: '15px 0', borderRadius: 16,
                        border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                        color: '#fff', fontSize: 14, fontWeight: 700,
                        boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                        opacity: createCheck.isPending ? 0.7 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {createCheck.isPending ? 'Открываем…' : 'Открыть счёт'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step: new_client */}
            {newCheckStep === 'new_client' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <button
                    onClick={() => setNewCheckStep('search')}
                    style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>НОВЫЙ КЛИЕНТ</h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      ШАГ 3 — ДАННЫЕ
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                      Никнейм *
                    </label>
                    <input
                      autoFocus
                      value={newClientNick}
                      onChange={e => setNewClientNick(e.target.value)}
                      placeholder="Имя игрока"
                      className="glass-l2"
                      style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 15, outline: 'none', background: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                      Тип
                    </label>
                    <select
                      value={newClientTier}
                      onChange={e => setNewClientTier(e.target.value)}
                      className="glass-l2"
                      style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.04)' }}
                    >
                      <option value="newbie">Новичок</option>
                      <option value="guest">Гость</option>
                      <option value="resident">Резидент</option>
                      <option value="student">Студент</option>
                    </select>
                  </div>
                  <button
                    onClick={async () => {
                      if (!newClientNick.trim()) return
                      const clientRes = await createClient.mutateAsync({ nickname: newClientNick.trim(), clientTier: newClientTier })
                      createCheck.mutate({ playerId: clientRes.client.id })
                    }}
                    disabled={!newClientNick.trim() || createClient.isPending || createCheck.isPending}
                    style={{
                      marginTop: 8, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                      color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                      boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                      opacity: (!newClientNick.trim() || createClient.isPending || createCheck.isPending) ? 0.5 : 1,
                    }}
                  >
                    {createClient.isPending || createCheck.isPending ? 'СОЗДАЁМ...' : 'СОЗДАТЬ И ОТКРЫТЬ ЧЕК'}
                  </button>
                  {createClient.isError && (
                    <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>
                      {(createClient.error as Error)?.message ?? 'Ошибка создания'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step: space */}
            {newCheckStep === 'space' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <button
                    onClick={() => setNewCheckStep('search')}
                    style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>АРЕНДА</h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      ШАГ 3 — ПРОСТРАНСТВО
                    </p>
                  </div>
                </div>

                {!spacesData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />
                    ))}
                  </div>
                )}

                {spacesData?.spaces.length === 0 && (
                  <p style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: '24px 0' }}>Нет активных пространств</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(spacesData?.spaces ?? []).map(space => (
                    <button
                      key={space.id}
                      onClick={() => createCheck.mutate({ spaceId: space.id })}
                      disabled={createCheck.isPending}
                      className="glass-l2"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px', borderRadius: 14,
                        border: '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                        opacity: createCheck.isPending ? 0.6 : 1,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.background = 'rgba(139,92,246,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = '' }}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: 'rgba(139,92,246,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name="meeting_room" size={22} color="#A78BFA" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{space.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{SPACE_TYPE_LABELS[space.type] ?? space.type}</p>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <p style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: 0, color: '#A78BFA' }}>
                          {parseFloat(space.hourlyRate).toLocaleString('ru')} ₽
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>/ час</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CloseShiftModal open={showCloseShift} onClose={() => setShowCloseShift(false)} />

      {/* Birthdays popup */}
      {showBirthdays && birthdaysData?.birthdays && birthdaysData.birthdays.length > 0 && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowBirthdays(false) }}
        >
          <div className="glass-l1" style={{ borderRadius: 28, padding: '36px 32px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎂</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8, color: 'var(--on-surface)' }}>
              ИМЕНИННИКИ СЕГОДНЯ
            </h2>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 13, marginBottom: 24 }}>
              Не забудьте поздравить!
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {birthdaysData.birthdays.map(person => (
                <div key={person.id} className="glass-l2" style={{ padding: '10px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', flexShrink: 0 }}>
                    {getInitials(person.nickname)}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--on-surface)' }}>{person.nickname}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowBirthdays(false)}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
      </div>{/* /pos-left-panel */}

      {/* Ручка регулировки сплита (видна только при открытой правой панели, ≥1024) */}
      {activeCheckId && (
        <div
          className="pos-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину панели чека"
          onPointerDown={startSplitDrag}
        >
          <div className="pos-split-grip" />
        </div>
      )}

      {/* Right panel — detail view на десктопе */}
      {activeCheckId && (
        <div
          className="pos-right-panel"
          style={{
            width: 0,
            flexShrink: 0,
            overflow: 'hidden',
            borderLeft: '1px solid rgba(255,255,255,0.07)',
            position: 'relative',
          }}
        >
          <CheckDetailView
            key={activeCheckId}
            checkId={activeCheckId}
            onBack={() => setActiveCheckId(null)}
            onClose={() => setActiveCheckId(null)}
          />
        </div>
      )}

      <style>{`
        .pos-split-handle { display: none; }
        @media (min-width: 1024px) {
          .pos-right-panel {
            width: var(--pos-right-w, 680px) !important;
          }
          .pos-split-handle {
            display: flex; align-items: center; justify-content: center;
            width: 16px; margin: 0 -6px; flex-shrink: 0; z-index: 5;
            cursor: col-resize; touch-action: none; user-select: none;
            -webkit-tap-highlight-color: transparent;
          }
          .pos-split-grip {
            width: 4px; height: 48px; border-radius: 4px;
            background: rgba(255,255,255,0.14); transition: background 0.15s;
          }
          .pos-split-handle:hover .pos-split-grip,
          .pos-split-handle:active .pos-split-grip { background: rgba(139,92,246,0.65); }
        }
      `}</style>
    </div>
  )
}

export default function PosPage() {
  return (
    <Suspense fallback={null}>
      <PosPageInner />
    </Suspense>
  )
}
