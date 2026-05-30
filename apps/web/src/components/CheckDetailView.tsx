'use client'
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { funnyGuestName } from '@/lib/funnyName'
import { SwipeableRow } from '@/components/SwipeableRow'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { ConfirmDialog } from '@/components/manage/DesignSystem'
import { TimeInput24 } from '@/components/TimeInput24'

interface InventoryItem {
  id: string
  name: string
  price: string
  category: string | null
  isActive: boolean
  stockQuantity: number
  trackStock: boolean
}

interface MenuCategory {
  id: string
  name: string
  icon: string
  color: string
}

interface CheckItem {
  checkItem: { id: string; quantity: number; priceAtTime: string }
  item: InventoryItem | null
}

interface CheckData {
  id: string
  totalAmount: string
  status: string
  items: CheckItem[]
  payments: { id: string; method: string; amount: string }[]
  guestName?: string
  playerId?: string | null
  spaceId?: string | null
  spaceStartAt?: string | null
  spaceEndAt?: string | null
  spaceHourlyRate?: string | null
  discounts?: { id: string; name: string; type: string; value: string; amount: string; discountId: string | null }[]
}

interface PlayerProfile {
  id: string
  nickname: string
  clientTier: string
  balance: string
  bonusPoints: string
  photoUrl: string | null
}

interface CertificateInfo {
  id: string
  code: string
  nominal: string
  balance: string
  isUsed: boolean
}

interface SplitPart {
  method: string
  amount: number
  label?: string
}

type PayScreen = 'methods' | 'bonus' | 'deposit' | 'certificate' | 'split' | 'qr'

const METHOD_CONFIGS: Record<string, { label: string; icon: string; color: string; rgb: string }> = {
  cash: { label: 'Наличные', icon: 'payments', color: 'var(--pay-cash)', rgb: '16,185,129' },
  card: { label: 'Карта', icon: 'credit_card', color: 'var(--pay-card)', rgb: '59,130,246' },
  transfer: { label: 'СБП/QR', icon: 'qr_code_2', color: 'var(--pay-split)', rgb: '139,92,246' },
  bonus: { label: 'Бонусы', icon: 'stars', color: 'var(--pay-bonus)', rgb: '245,158,11' },
  deposit: { label: 'Депозит', icon: 'account_balance_wallet', color: 'var(--pay-deposit)', rgb: '6,182,212' },
  debt: { label: 'В долг', icon: 'person_pin', color: 'var(--pay-debt, #f43f5e)', rgb: '244,63,94' },
  certificate: { label: 'Сертификат', icon: 'card_membership', color: 'var(--pay-cert)', rgb: '251,191,36' },
  split: { label: 'Раздельная', icon: 'call_split', color: 'var(--on-surface-variant)', rgb: '148,163,184' },
}

function getInitials(name?: string | null): string {
  if (!name) return 'Г'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

// ISO → значение для <input type="datetime-local"> (локальное время, без TZ-суффикса)
function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function methodColor(m: string): string {
  return METHOD_CONFIGS[m]?.color ?? 'var(--on-surface-variant)'
}

function methodLabel(m: string): string {
  return METHOD_CONFIGS[m]?.label ?? m
}

function methodIcon(m: string): string {
  return METHOD_CONFIGS[m]?.icon ?? 'payments'
}

interface CheckDetailViewProps {
  checkId: string
  onBack: () => void
  onClose?: () => void // для split-view — очистить активный чек
}

export function CheckDetailView({ checkId, onBack, onClose }: CheckDetailViewProps) {
  const qc = useQueryClient()
  const { show } = useToast()
  const toastError = useCallback(
    (e: unknown) => show(e instanceof ApiError ? String((e.data as Record<string, unknown>)?.error ?? 'Ошибка') : 'Ошибка сети', 'error'),
    [show],
  )
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: checkData, isLoading } = useQuery({
    queryKey: ['check', checkId],
    queryFn: () => api.get<{ check: CheckData }>(`/pos/checks/${checkId}`).then(r => r.check),
    refetchInterval: 10000,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['menu', 'categories'],
    queryFn: () => api.get<{ categories: MenuCategory[] }>('/menu/categories'),
  })

  const { data: itemsData } = useQuery({
    queryKey: ['menu', 'items'],
    queryFn: () => api.get<{ items: InventoryItem[] }>('/menu/items'),
  })

  // Настройки: процент макс. оплаты бонусами (bonus_max_spend). Бэкенд /pay
  // enforce-ит этот же лимит; здесь — только для корректного UI слайдера.
  const { data: settingsData } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<{ settings: Record<string, string> }>('/system/settings'),
  })
  const bonusMaxSpendPct = (() => {
    const parsed = parseFloat(settingsData?.settings?.['bonus_max_spend'] ?? '')
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 50
  })()

  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showMenuDrawer, setShowMenuDrawer] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [isPaid, setIsPaid] = useState(false)

  // Space rental live timer
  const [spaceRental, setSpaceRental] = useState(0)
  // Редактор времени аренды
  const [showRentalEdit, setShowRentalEdit] = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  // Ручная скидка на чек
  const [showDiscount, setShowDiscount] = useState(false)
  const [discType, setDiscType] = useState<'percent' | 'fixed'>('percent')
  const [discValue, setDiscValue] = useState('')

  // Payment drawer state
  const [payScreen, setPayScreen] = useState<PayScreen>('methods')
  const [splitParts, setSplitParts] = useState<SplitPart[]>([])
  const [bonusAmount, setBonusAmount] = useState(0)
  const [depositAmt, setDepositAmt] = useState(0)
  const [certCode, setCertCode] = useState('')
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null)
  const [certError, setCertError] = useState('')
  const [certLoading, setCertLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // QR / Platega state
  const [qrTransactionId, setQrTransactionId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrStatus, setQrStatus] = useState<'pending' | 'confirmed' | 'canceled'>('pending')
  const [qrError, setQrError] = useState('')
  const [qrRedirectUrl, setQrRedirectUrl] = useState<string | null>(null)
  const [qrAmount, setQrAmount] = useState(0)

  const check = checkData
  // Имя в заголовке: реальное имя клиента/гостя, иначе смешная заглушка (по id чека).
  const displayName = check ? (check.guestName || funnyGuestName(check.id)) : 'Гость'
  const categories = categoriesData?.categories ?? []
  const allItems = (itemsData?.items ?? []).filter(i => i.isActive)
  const filteredItems = allItems.filter(item => {
    const matchCat = !activeCat || item.category === activeCat
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // Space rental calc — та же epoch-логика, что и на бэкенде при оплате:
  // ceil(минуты/60) × ставка. До spaceEndAt (если задан) либо до now (живой счётчик).
  useEffect(() => {
    // Нет аренды у этого чека — обнуляем счётчик (иначе значение «прилипло» бы
    // от предыдущего чека и попало в «Итого»).
    if (!check?.spaceId || !check?.spaceStartAt || !check?.spaceHourlyRate) { setSpaceRental(0); return }
    const startMs = new Date(check.spaceStartAt).getTime()
    const rate = parseFloat(check.spaceHourlyRate ?? '0')
    const calc = () => {
      const endMs = check.spaceEndAt ? new Date(check.spaceEndAt).getTime() : Date.now()
      const mins = Math.max(0, (endMs - startMs) / 60000)
      setSpaceRental(Math.ceil(mins / 60) * rate)
    }
    calc()
    if (check.spaceEndAt) return // фиксированный конец — счётчик не тикает
    const t = setInterval(calc, 15000)
    return () => clearInterval(t)
  }, [check])

  const baseTotal = parseFloat(check?.totalAmount ?? '0')
  const total = baseTotal + spaceRental
  const splitSum = splitParts.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, total - splitSum)

  const { data: playerData } = useQuery({
    queryKey: ['player', check?.playerId],
    queryFn: () => api.get<{ player: PlayerProfile }>(`/pos/players/${check!.playerId}`).then(r => r.player),
    enabled: !!check?.playerId && showPayment,
  })
  const player = playerData ?? null

  const playerBalance = parseFloat(player?.balance ?? '0') || 0
  const playerBonus = parseFloat(player?.bonusPoints ?? '0') || 0

  function openPaymentDrawer() {
    setSplitParts([])
    setBonusAmount(0)
    setDepositAmt(0)
    setCertCode('')
    setCertInfo(null)
    setCertError('')
    setPayScreen('methods')
    setIsProcessing(false)
    setQrTransactionId(null)
    setQrDataUrl(null)
    setQrStatus('pending')
    setQrError('')
    setShowPayment(true)
  }

  function openRentalEdit() {
    setEditStart(toLocalInput(check?.spaceStartAt))
    setEditEnd(toLocalInput(check?.spaceEndAt))
    setShowRentalEdit(true)
  }
  function saveRental() {
    const body: { spaceStartAt?: string; spaceEndAt?: string | null } = {}
    if (editStart) body.spaceStartAt = new Date(editStart).toISOString()
    // Пустой конец → null (снова живой счётчик до оплаты)
    body.spaceEndAt = editEnd ? new Date(editEnd).toISOString() : null
    updateRental.mutate(body)
  }

  async function startQrPayment() {
    const amount = remaining > 0 ? remaining : total
    setQrAmount(amount)
    setQrLoading(true)
    setQrError('')
    setQrRedirectUrl(null)
    setQrStatus('pending')
    setQrTransactionId(null)
    setQrDataUrl(null)
    setPayScreen('qr')
    try {
      const res = await api.post<{ transactionId: string; qrDataUrl: string; expiresIn?: string }>(
        `/pos/checks/${checkId}/qr`,
        { amount }
      )
      setQrTransactionId(res.transactionId)
      setQrDataUrl(res.qrDataUrl)
    } catch (err) {
      const data = err instanceof ApiError ? err.data : undefined
      const redirect = data?.['redirectUrl'] as string | undefined
      const txId = data?.['transactionId'] as string | undefined
      if (redirect) setQrRedirectUrl(redirect)
      // Транзакция создана на Platega, polling продолжается чтобы поймать CONFIRMED
      if (txId) setQrTransactionId(txId)
      // Если есть страница оплаты или транзакция — это не ошибка, а ожидание
      // подтверждения через redirect (H2H ещё генерит QR). Иначе — реальная ошибка.
      if (!redirect && !txId) {
        setQrError((err as Error)?.message ?? 'Ошибка создания QR')
      }
    } finally {
      setQrLoading(false)
    }
  }

  // Единый путь "успешно оплачено и закрыто": показать успех и закрыть шторку.
  const markPaidAndClose = useCallback(() => {
    setIsPaid(true)
    setShowPayment(false)
    qc.invalidateQueries({ queryKey: ['checks', 'active'] })
    qc.invalidateQueries({ queryKey: ['check', checkId] })
    setTimeout(() => { if (onClose) onClose(); else onBack() }, 1800)
  }, [qc, checkId, onClose, onBack])

  // Polling Platega статуса каждые 3 секунды пока QR-экран активен
  useEffect(() => {
    if (payScreen !== 'qr' || !qrTransactionId || qrStatus !== 'pending' || qrLoading) return
    const poll = async () => {
      try {
        const res = await api.get<{ status: string }>(`/pos/checks/${checkId}/qr/${qrTransactionId}/status`)
        if (res.status === 'CONFIRMED') {
          setQrStatus('confirmed')
          // Webhook Platega мог уже закрыть чек на сервере. Сверяемся со статусом,
          // чтобы не пытаться повторно провести уже закрытый чек ("Check not open").
          try {
            const { check: fresh } = await api.get<{ check: { status: string } }>(`/pos/checks/${checkId}`)
            if (fresh.status === 'closed') {
              markPaidAndClose()
              return
            }
          } catch {
            // не смогли свериться — продолжаем обычным путём ниже
          }
          // Чек ещё открыт (частичная оплата/сплит или webhook не успел) — обычная финализация.
          addSplitPart({ method: 'transfer', amount: qrAmount, label: 'СБП / QR (Platega)' })
          setPayScreen('split')
        } else if (res.status === 'CANCELED') {
          setQrStatus('canceled')
          setQrError('Платёж отменён или истекло время ожидания')
        }
      } catch {
        // игнорируем ошибки поллинга
      }
    }
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [payScreen, qrTransactionId, qrStatus, qrLoading, checkId, qrAmount, markPaidAndClose])

  // Ответ мутации = свежий чек целиком (getCheckWithItems). Пишем его прямо в кэш
  // вместо invalidate+refetch — карточка обновляется мгновенно, без сетевой задержки.
  const writeCheck = useCallback((res: { check: CheckData }) => qc.setQueryData(['check', checkId], res.check), [qc, checkId])

  const addItem = useMutation({
    mutationFn: (itemId: string) => api.post<{ check: CheckData }>(`/pos/checks/${checkId}/items`, { itemId, quantity: 1 }),
    onSuccess: writeCheck,
    onError: toastError,
  })

  const updateQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      quantity === 0
        ? api.delete<{ check: CheckData }>(`/pos/checks/${checkId}/items/${id}`)
        : api.patch<{ check: CheckData }>(`/pos/checks/${checkId}/items/${id}`, { quantity }),
    onSuccess: writeCheck,
    onError: toastError,
  })

  // Редактирование времени аренды (начало/конец). spaceEndAt=null → снова живой счётчик.
  const updateRental = useMutation({
    mutationFn: (body: { spaceStartAt?: string; spaceEndAt?: string | null }) =>
      api.patch<{ check: CheckData }>(`/pos/checks/${checkId}`, body),
    onSuccess: (res) => { writeCheck(res); setShowRentalEdit(false) },
    onError: toastError,
  })

  // Ручная скидка на чек (percent/fixed). Бэкенд пересчитывает total.
  const applyDiscount = useMutation({
    mutationFn: (body: { type: 'percent' | 'fixed'; value: number }) =>
      api.post<{ check: CheckData }>(`/pos/checks/${checkId}/discount`, {
        name: body.type === 'percent' ? `Скидка ${body.value}%` : `Скидка ${body.value} ₽`,
        type: body.type,
        value: body.value,
        target: 'check',
      }),
    onSuccess: (res) => { writeCheck(res); setShowDiscount(false); setDiscValue('') },
    onError: toastError,
  })
  const removeDiscount = useMutation({
    mutationFn: (discountId: string) => api.delete<{ check: CheckData }>(`/pos/checks/${checkId}/discount/${discountId}`),
    onSuccess: writeCheck,
    onError: toastError,
  })

  const pay = useMutation({
    mutationFn: (body: { payments: SplitPart[]; bonusAmount?: number; certificateCode?: string; playerId?: string }) =>
      api.post(`/pos/checks/${checkId}/pay`, body),
    onSuccess: () => {
      setIsPaid(true)
      setShowPayment(false)
      qc.invalidateQueries({ queryKey: ['checks', 'active'] })
      setTimeout(() => {
        if (onClose) onClose()
        else onBack()
      }, 1800)
    },
  })

  const cancelCheck = useMutation({
    mutationFn: () => api.delete(`/pos/checks/${checkId}`),
    onSuccess: () => {
      setConfirmCancel(false)
      qc.invalidateQueries({ queryKey: ['checks', 'active'] })
      if (onClose) onClose()
      else onBack()
    },
    onError: (e) => { setConfirmCancel(false); toastError(e) },
  })

  async function lookupCertificate() {
    if (!certCode.trim()) return
    setCertLoading(true)
    setCertError('')
    setCertInfo(null)
    let attempts = 0
    const delays = [500, 1000, 1500]
    while (attempts <= 2) {
      try {
        const res = await api.get<{ certificate: CertificateInfo }>(`/certificates/validate/${certCode.trim().toUpperCase()}`)
        setCertInfo(res.certificate)
        setCertLoading(false)
        return
      } catch (err) {
        attempts++
        if (attempts > 2) {
          setCertError((err as Error)?.message ?? 'Сертификат не найден')
          setCertLoading(false)
          return
        }
        await new Promise(r => setTimeout(r, delays[attempts - 1]))
      }
    }
  }

  function addSplitPart(part: SplitPart) {
    setSplitParts(prev => [...prev, part])
  }

  function removeSplitPart(idx: number) {
    setSplitParts(prev => prev.filter((_, i) => i !== idx))
  }

  function handleMethodClick(method: string) {
    if (method === 'bonus') {
      setPayScreen('bonus')
    } else if (method === 'deposit') {
      setPayScreen('deposit')
    } else if (method === 'certificate') {
      setPayScreen('certificate')
    } else if (method === 'transfer') {
      startQrPayment()
    } else {
      addSplitPart({ method, amount: remaining > 0 ? remaining : total, label: METHOD_CONFIGS[method]?.label })
      setPayScreen('split')
    }
  }

  async function finishPayment() {
    if (isProcessing || remaining > 0.01) return
    setIsProcessing(true)
    try {
      await pay.mutateAsync({
        payments: splitParts,
        bonusAmount: bonusAmount > 0 ? bonusAmount : undefined,
        certificateCode: certInfo?.code,
        playerId: check?.playerId ?? undefined,
      })
    } catch (err) {
      // Гонка с вебхуком Platega: чек мог быть уже закрыт оплатой по QR.
      // Если чек действительно закрыт — это успех, а не ошибка.
      if (err instanceof ApiError) {
        try {
          const { check: fresh } = await api.get<{ check: { status: string } }>(`/pos/checks/${checkId}`)
          if (fresh.status === 'closed') {
            markPaidAndClose()
            return
          }
        } catch {
          // не удалось свериться — показываем исходную ошибку
        }
        show(String((err.data as Record<string, unknown>)?.error ?? 'Не удалось провести оплату'), 'error')
      } else {
        show('Ошибка сети. Повторите попытку.', 'error')
      }
      setIsProcessing(false)
    }
  }

  if (isPaid) {
    const change = splitSum - total
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', marginBottom: 20, marginLeft: 'auto', marginRight: 'auto',
            background: 'rgba(52,211,153,0.15)', border: '2px solid var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(52,211,153,0.3)',
          }}>
            <Icon name="check_circle" size={44} color="var(--success)" />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 8 }}>
            ОПЛАЧЕНО!
          </h2>
          {change > 0 && (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 15 }}>
              Сдача: <span style={{ fontStyle: 'italic', fontWeight: 800, color: 'var(--on-surface)', fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{change.toLocaleString('ru')} ₽</span>
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div className="glass-l1" style={{
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Icon name="arrow_back" size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(76,215,246,0.3))',
            border: '1px solid rgba(139,92,246,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#A78BFA',
          }}>
            {getInitials(displayName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>
              {check?.items.length ?? 0} позиций
            </p>
          </div>
        </div>

        <button
          onClick={() => setConfirmCancel(true)}
          style={{
            padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(251,113,133,0.25)',
            cursor: 'pointer', background: 'rgba(251,113,133,0.08)',
            color: 'var(--danger)', fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}
        >
          Отменить
        </button>
      </div>

      {/* Split layout */}
      <div
        style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', overflow: 'hidden' }}
        className="check-layout"
      >
        {/* Left: check items */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="check-items" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12, marginBottom: 8 }} />
            ))}

            {check?.items.map((ci) => (
              <SwipeableRow
                key={ci.checkItem.id}
                onDelete={() => updateQty.mutate({ id: ci.checkItem.id, quantity: 0 })}
              >
              <div
                className="glass-l2"
                style={{ borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--on-surface)' }}>
                    {ci.item?.name ?? '—'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
                    {parseFloat(ci.checkItem.priceAtTime).toLocaleString('ru')} ₽
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity - 1 })}
                    disabled={updateQty.isPending}
                    aria-label={ci.checkItem.quantity === 1 ? 'Удалить позицию' : 'Уменьшить количество'}
                    style={{
                      width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                      cursor: updateQty.isPending ? 'not-allowed' : 'pointer', background: 'rgba(255,255,255,0.04)',
                      color: ci.checkItem.quantity === 1 ? 'var(--danger)' : 'var(--on-surface-variant)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      opacity: updateQty.isPending ? 0.5 : 1,
                    }}
                  >
                    <Icon name={ci.checkItem.quantity === 1 ? 'delete' : 'remove'} size={16} />
                  </button>
                  <span style={{ width: 26, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>
                    {ci.checkItem.quantity}
                  </span>
                  <button
                    onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity + 1 })}
                    disabled={updateQty.isPending}
                    aria-label="Увеличить количество"
                    style={{
                      width: 36, height: 36, borderRadius: 10, border: 'none',
                      cursor: updateQty.isPending ? 'not-allowed' : 'pointer', background: 'rgba(139,92,246,0.2)', color: '#A78BFA',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      opacity: updateQty.isPending ? 0.5 : 1,
                    }}
                  >
                    <Icon name="add" size={16} />
                  </button>
                </div>
                <p style={{ fontSize: 14, fontStyle: 'italic', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', width: 64, textAlign: 'right', margin: 0 }}>
                  {(parseFloat(ci.checkItem.priceAtTime) * ci.checkItem.quantity).toLocaleString('ru')} ₽
                </p>
              </div>
              </SwipeableRow>
            ))}

            {check?.items.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--on-surface-variant)' }}>
                <Icon name="shopping_cart" size={40} style={{ display: 'block', marginBottom: 12, opacity: 0.4 }} />
                <p style={{ fontSize: 13 }}>Добавьте товары из меню →</p>
              </div>
            )}
          </div>

          {/* Payment footer — на телефоне превращается в плавающий «остров»
              с точными размерами/позицией нижней навигации (см. <style> ниже). */}
          <div className="check-pay-bar glass-l1" style={{ padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0 }}>
            {(check?.discounts ?? []).map(d => (
              <div key={d.id} className="check-pay-line" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <Icon name="sell" size={14} color="#34D399" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  {d.discountId === null
                    ? <button type="button" onClick={() => removeDiscount.mutate(d.id)} disabled={removeDiscount.isPending} aria-label="Снять скидку" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', padding: 0, flexShrink: 0 }}><Icon name="close" size={13} /></button>
                    : <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', flexShrink: 0 }}>авто</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#34D399', flexShrink: 0 }}>
                  −{Math.round(parseFloat(d.amount)).toLocaleString('ru')} ₽
                </span>
              </div>
            ))}
            <div className="check-pay-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p className="check-pay-label" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
                  Итого
                </p>
                <p className="check-pay-amount" style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: 0, color: 'var(--on-surface)' }}>
                  {total.toLocaleString('ru')} ₽
                </p>
              </div>
              <div className="check-pay-actions" style={{ display: 'flex', gap: 10 }}>
                {check?.spaceId && (
                  <button
                    onClick={openRentalEdit}
                    className="check-pay-timer"
                    aria-label="Аренда — редактировать время"
                    title={check.spaceEndAt ? 'Аренда (фикс.)' : 'Аренда (живой счётчик)'}
                    style={{
                      padding: '14px 14px', borderRadius: 16, border: '1px solid rgba(167,139,250,0.35)',
                      cursor: 'pointer', background: 'rgba(167,139,250,0.1)', color: '#A78BFA',
                      fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
                    }}
                  >
                    <Icon name={check.spaceEndAt ? 'schedule' : 'timer'} size={18} />
                    {spaceRental.toLocaleString('ru')} ₽
                  </button>
                )}
                <button
                  onClick={() => setShowMenuDrawer(true)}
                  className="check-pay-add"
                  style={{
                    padding: '14px 20px', borderRadius: 16, border: '1px solid rgba(139,92,246,0.35)',
                    cursor: 'pointer', background: 'rgba(139,92,246,0.1)',
                    color: '#A78BFA', fontSize: 13, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Icon name="add" size={18} />
                  <span className="check-pay-add-label">Добавить</span>
                </button>
                <button
                  onClick={() => { setDiscType('percent'); setDiscValue(''); setShowDiscount(true) }}
                  className="check-pay-add"
                  aria-label="Добавить скидку"
                  title="Скидка"
                  style={{
                    padding: '14px 16px', borderRadius: 16, border: '1px solid rgba(52,211,153,0.35)',
                    cursor: 'pointer', background: 'rgba(52,211,153,0.1)', color: '#34D399',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name="sell" size={18} />
                </button>
                <button
                  onClick={openPaymentDrawer}
                  disabled={total === 0}
                  className="check-pay-go"
                  style={{
                    padding: '14px 28px', borderRadius: 16, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                    color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                    boxShadow: '0 4px 20px rgba(139,92,246,0.35)', opacity: total === 0 ? 0.4 : 1,
                  }}
                >
                  К ОПЛАТЕ
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Menu Drawer */}
      {showMenuDrawer && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowMenuDrawer(false)}
            style={{
              position: 'absolute', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 41,
            background: 'rgba(21,18,27,0.98)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            borderRadius: '20px 20px 0 0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            height: '70%',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Handle + header */}
            <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Добавить позицию</h3>
                <button
                  onClick={() => setShowMenuDrawer(false)}
                  style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Icon name="search" size={16} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Поиск..."
                  className="glass-l2"
                  style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 13, outline: 'none', background: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {/* Category pills */}
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10 }}>
                <button onClick={() => setActiveCat(null)} style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: !activeCat ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'rgba(255,255,255,0.06)', color: !activeCat ? '#fff' : 'var(--on-surface-variant)' }}>Все</button>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)} style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeCat === cat.id ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'rgba(255,255,255,0.06)', color: activeCat === cat.id ? '#fff' : 'var(--on-surface-variant)' }}>{cat.name}</button>
                ))}
              </div>
            </div>

            {/* Items grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, alignContent: 'start' }}>
              {filteredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { addItem.mutate(item.id) }}
                  disabled={item.trackStock && item.stockQuantity === 0}
                  className="glass-l2"
                  style={{ borderRadius: 14, padding: '12px 10px', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', textAlign: 'left', opacity: item.trackStock && item.stockQuantity === 0 ? 0.4 : 1, transition: 'all 0.15s', background: 'rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px', color: 'var(--on-surface)', lineHeight: 1.3 }}>{item.name}</p>
                  <p style={{ fontSize: 12, fontWeight: 800, fontStyle: 'italic', color: '#A78BFA', margin: 0 }}>{parseFloat(item.price).toLocaleString('ru')} ₽</p>
                  {item.trackStock && <p style={{ fontSize: 10, color: item.stockQuantity <= 3 ? '#F59E0B' : 'var(--on-surface-variant)', margin: '4px 0 0' }}>×{item.stockQuantity}</p>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Manual discount editor */}
      {showDiscount && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !applyDiscount.isPending) setShowDiscount(false) }}
          style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,21,38,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: 16 }}
        >
          <div className="glass-l1" style={{ borderRadius: 24, padding: 24, width: 'min(420px,100%)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Icon name="sell" size={22} color="#34D399" />
              <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0 }}>Скидка на чек</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button type="button" onClick={() => setDiscType('percent')} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${discType === 'percent' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`, background: discType === 'percent' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', color: discType === 'percent' ? '#34D399' : 'var(--on-surface-variant)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Процент %</button>
              <button type="button" onClick={() => setDiscType('fixed')} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${discType === 'fixed' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`, background: discType === 'fixed' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', color: discType === 'fixed' ? '#34D399' : 'var(--on-surface-variant)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Сумма ₽</button>
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: 6 }}>{discType === 'percent' ? 'Процент скидки' : 'Сумма скидки (₽)'}</label>
            <input
              type="number" inputMode="decimal" min="0" max={discType === 'percent' ? '100' : undefined} autoFocus
              value={discValue} onChange={e => setDiscValue(e.target.value)}
              placeholder={discType === 'percent' ? 'например 10' : 'например 200'}
              className="glass-l2"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', fontSize: 18, fontWeight: 700, background: 'rgba(255,255,255,0.04)', boxSizing: 'border-box', marginBottom: 18 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowDiscount(false)} disabled={applyDiscount.isPending} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
              <button
                type="button"
                onClick={() => { const v = parseFloat(discValue); if (v > 0) applyDiscount.mutate({ type: discType, value: discType === 'percent' ? Math.min(v, 100) : v }) }}
                disabled={applyDiscount.isPending || !(parseFloat(discValue) > 0)}
                style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #34D399, #10B981)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', opacity: (applyDiscount.isPending || !(parseFloat(discValue) > 0)) ? 0.5 : 1 }}
              >{applyDiscount.isPending ? '...' : 'Применить'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Rental time editor */}
      {showRentalEdit && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !updateRental.isPending) setShowRentalEdit(false) }}
          style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,21,38,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: 16 }}
        >
          <div className="glass-l1" style={{ borderRadius: 24, padding: 24, width: 'min(420px,100%)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Icon name="meeting_room" size={22} color="#A78BFA" />
              <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0 }}>Время аренды</h2>
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: 6 }}>Начало</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input type="date" value={editStart.slice(0, 10)} onChange={e => setEditStart(e.target.value ? `${e.target.value}T${editStart.slice(11, 16) || '00:00'}` : '')} className="glass-l2" style={{ flex: 1, minWidth: 0, padding: '12px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', fontSize: 14, background: 'rgba(29,26,36,0.9)', boxSizing: 'border-box' }} />
              <TimeInput24 value={editStart.slice(11, 16)} onChange={t => setEditStart(`${editStart.slice(0, 10) || new Date().toISOString().slice(0, 10)}T${t}`)} style={{ flex: 1 }} />
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: 6 }}>Конец</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="date" value={editEnd.slice(0, 10)} onChange={e => setEditEnd(e.target.value ? `${e.target.value}T${editEnd.slice(11, 16) || '00:00'}` : '')} className="glass-l2" style={{ flex: 1, minWidth: 0, padding: '12px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', fontSize: 14, background: 'rgba(29,26,36,0.9)', boxSizing: 'border-box' }} />
              <TimeInput24 value={editEnd.slice(11, 16)} onChange={t => setEditEnd(`${editEnd.slice(0, 10) || editStart.slice(0, 10) || new Date().toISOString().slice(0, 10)}T${t}`)} style={{ flex: 1 }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 14px' }}>
              {editEnd
                ? <button type="button" onClick={() => setEditEnd('')} style={{ background: 'none', border: 'none', color: '#A78BFA', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Сбросить конец → живой счётчик до оплаты</button>
                : 'Пусто = живой счётчик до момента оплаты'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowRentalEdit(false)} disabled={updateRental.isPending} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
              <button type="button" onClick={saveRental} disabled={updateRental.isPending || !editStart} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', opacity: (updateRental.isPending || !editStart) ? 0.5 : 1 }}>{updateRental.isPending ? '...' : 'Сохранить'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Payment Drawer */}
      {showPayment && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(13,21,38,0.80)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPayment(false) }}
        >
          <div
            className="glass-l1"
            style={{
              borderRadius: 32, maxWidth: 560, width: '100%',
              maxHeight: '92dvh', overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
          >
            {/* ===== SCREEN: METHODS ===== */}
            {payScreen === 'methods' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                    background: '#8B5CF6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                  }}>
                    <Icon name="payments" size={28} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>ОПЛАТА</h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      ВЫБЕРИТЕ МЕТОД
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPayment(false)}
                    style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>

                {player && (
                  <div className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, marginBottom: 16, border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(76,215,246,0.35))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#A78BFA' }}>
                      {getInitials(player.nickname)}
                    </div>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--on-surface)' }}>{player.nickname}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 8px', background: playerBalance < 0 ? 'rgba(244,63,94,0.1)' : 'rgba(6,182,212,0.1)', color: playerBalance < 0 ? 'var(--danger)' : 'var(--pay-deposit)' }}>
                      {playerBalance.toLocaleString('ru')} ₽
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 8px', background: 'rgba(245,158,11,0.1)', color: 'var(--pay-bonus)' }}>
                      ★ {playerBonus.toLocaleString('ru')}
                    </span>
                  </div>
                )}

                <div style={{
                  textAlign: 'center', padding: '16px 0',
                  borderRadius: 16,
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.15)',
                  marginBottom: 20,
                }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
                    ИТОГО К ОПЛАТЕ:
                  </p>
                  <p style={{ fontSize: 36, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: '#A78BFA', margin: 0 }}>
                    {total.toLocaleString('ru')} ₽
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {Object.entries(METHOD_CONFIGS).map(([id, cfg]) => {
                    const disabled = id === 'debt' && !check?.playerId
                    return (
                      <button
                        key={id}
                        onClick={() => !disabled && handleMethodClick(id)}
                        disabled={disabled}
                        className="glass-l2"
                        style={{
                          padding: '14px 10px', borderRadius: 14, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
                          background: 'rgba(255,255,255,0.04)',
                          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.07)`,
                          transition: 'all 0.2s',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
                          opacity: disabled ? 0.35 : 1,
                        }}
                        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = `rgba(${cfg.rgb},0.12)`; e.currentTarget.style.boxShadow = `0 0 20px rgba(${cfg.rgb},0.2), inset 0 0 0 1px rgba(${cfg.rgb},0.35)` } }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}
                      >
                        <Icon name={cfg.icon} size={22} color={cfg.color} />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{cfg.label}</p>
                          {id === 'bonus' && player && <p style={{ fontSize: 10, color: 'var(--pay-bonus)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{playerBonus.toLocaleString('ru')} б.</p>}
                          {id === 'deposit' && player && <p style={{ fontSize: 10, color: 'var(--pay-deposit)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{playerBalance.toLocaleString('ru')} ₽</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===== SCREEN: BONUS ===== */}
            {payScreen === 'bonus' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setPayScreen('methods')} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>БОНУСНАЯ ОПЛАТА</h2>
                </div>

                {player && (
                  <div className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, marginBottom: 20, border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(76,215,246,0.35))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#A78BFA' }}>
                      {getInitials(player.nickname)}
                    </div>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--on-surface)' }}>{player.nickname}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pay-bonus)' }}>★ {playerBonus.toLocaleString('ru')} бонусов</span>
                  </div>
                )}

                {(() => {
                  const maxBonus = Math.min(playerBonus, Math.floor(total * (bonusMaxSpendPct / 100)))
                  const step = Math.max(10, Math.round(maxBonus / 20) * 10) || 10
                  const bonusRemainder = total - bonusAmount
                  return (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
                          Сумма бонусов (макс. {maxBonus.toLocaleString('ru')})
                        </p>
                        <input type="range" min={0} max={maxBonus} step={step} value={bonusAmount} onChange={e => setBonusAmount(Number(e.target.value))} style={{ width: '100%', accentColor: '#f59e0b' }} />
                        <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--pay-bonus)', textAlign: 'center', margin: '8px 0' }}>
                          {bonusAmount.toLocaleString('ru')} бонусов
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        {[0.25, 0.5, 0.75, 1].map(pct => (
                          <button key={pct} onClick={() => setBonusAmount(Math.min(maxBonus, Math.round(maxBonus * pct / step) * step))} className="glass-l2" style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer', color: 'var(--pay-bonus)', fontSize: 12, fontWeight: 700 }}>
                            {Math.round(pct * 100)}%
                          </button>
                        ))}
                      </div>
                      {bonusRemainder > 0.01 && (
                        <div className="glass-l2" style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16, border: '1px solid rgba(255,255,255,0.07)' }}>
                          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>Остаток к доплате:</p>
                          <p style={{ fontSize: 20, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0 }}>{bonusRemainder.toLocaleString('ru')} ₽</p>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          if (bonusAmount > 0) {
                            addSplitPart({ method: 'bonus', amount: bonusAmount, label: 'Бонусы' })
                            if (bonusRemainder > 0.01) addSplitPart({ method: 'cash', amount: bonusRemainder, label: 'Наличные (остаток)' })
                          }
                          setPayScreen('split')
                        }}
                        disabled={bonusAmount === 0}
                        style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: bonusAmount === 0 ? 0.5 : 1 }}
                      >
                        ПРИМЕНИТЬ
                      </button>
                    </>
                  )
                })()}
              </div>
            )}

            {/* ===== SCREEN: DEPOSIT ===== */}
            {payScreen === 'deposit' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setPayScreen('methods')} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>ОПЛАТА ДЕПОЗИТОМ</h2>
                </div>
                {player && (
                  <div className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, marginBottom: 20, border: '1px solid rgba(6,182,212,0.2)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(76,215,246,0.35))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#A78BFA' }}>
                      {getInitials(player.nickname)}
                    </div>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--on-surface)' }}>{player.nickname}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pay-deposit)' }}>{playerBalance.toLocaleString('ru')} ₽</span>
                  </div>
                )}
                {(() => {
                  const maxDeposit = Math.min(Math.max(0, playerBalance), total)
                  return (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>Сумма депозита (макс. {maxDeposit.toLocaleString('ru')} ₽)</p>
                        <input type="range" min={0} max={maxDeposit} step={10} value={depositAmt} onChange={e => setDepositAmt(Number(e.target.value))} style={{ width: '100%', accentColor: '#06b6d4' }} />
                        <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--pay-deposit)', textAlign: 'center', margin: '8px 0' }}>{depositAmt.toLocaleString('ru')} ₽</p>
                      </div>
                      <button onClick={() => { if (depositAmt > 0) addSplitPart({ method: 'deposit', amount: depositAmt, label: 'Депозит' }); setPayScreen('split') }} disabled={depositAmt === 0} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: depositAmt === 0 ? 0.5 : 1 }}>
                        ПРИМЕНИТЬ
                      </button>
                    </>
                  )
                })()}
              </div>
            )}

            {/* ===== SCREEN: CERTIFICATE ===== */}
            {payScreen === 'certificate' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setPayScreen('methods')} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>СЕРТИФИКАТ</h2>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input value={certCode} onChange={e => { setCertCode(e.target.value.toUpperCase()); setCertInfo(null); setCertError('') }} placeholder="КОД СЕРТИФИКАТА" className="glass-l2" style={{ flex: 1, padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', outline: 'none', background: 'none' }} />
                  <button onClick={lookupCertificate} disabled={certLoading || !certCode.trim()} style={{ padding: '14px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'rgba(139,92,246,0.2)', color: '#A78BFA', fontSize: 13, fontWeight: 700, opacity: (certLoading || !certCode.trim()) ? 0.5 : 1 }}>
                    {certLoading ? '...' : 'НАЙТИ'}
                  </button>
                </div>
                {certError && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{certError}</p>}
                {certInfo && (
                  <>
                    <div className="glass-l2" style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16, border: '1px solid rgba(251,191,36,0.2)' }}>
                      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>Сертификат {certInfo.code}</p>
                      <p style={{ fontSize: 22, fontWeight: 800, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--pay-cert, #fbbf24)', margin: 0 }}>{parseFloat(certInfo.balance).toLocaleString('ru')} ₽</p>
                      <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>Номинал: {parseFloat(certInfo.nominal).toLocaleString('ru')} ₽</p>
                    </div>
                    <button onClick={() => { const certBal = parseFloat(certInfo.balance); const certUsed = Math.min(certBal, total); addSplitPart({ method: 'certificate', amount: certUsed, label: `Сертификат ${certInfo.code}` }); setPayScreen('split') }} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      ПРИМЕНИТЬ
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ===== SCREEN: QR (Platega SBP) ===== */}
            {payScreen === 'qr' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <button
                    onClick={() => { setPayScreen('methods'); setQrTransactionId(null); setQrDataUrl(null); setQrStatus('pending'); setQrError('') }}
                    style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>СБП / QR-ОПЛАТА</h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      {qrAmount.toLocaleString('ru')} ₽
                    </p>
                  </div>
                </div>

                {qrLoading && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>Генерируем QR-код...</p>
                  </div>
                )}

                {qrError && (
                  <div className="glass-l2" style={{ padding: '16px', borderRadius: 14, border: '1px solid rgba(244,63,94,0.25)', marginBottom: 16 }}>
                    <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="error" size={18} color="var(--danger)" />
                      {qrError}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button
                        onClick={startQrPayment}
                        style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(139,92,246,0.2)', color: '#A78BFA', fontSize: 12, fontWeight: 700 }}
                      >
                        Попробовать снова
                      </button>
                      {qrRedirectUrl && (
                        <a
                          href={qrRedirectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <Icon name="open_in_new" size={14} />
                          Открыть страницу оплаты
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!qrError && !qrDataUrl && qrRedirectUrl && qrStatus === 'pending' && (
                  <div className="glass-l2" style={{ padding: '18px 16px', borderRadius: 14, marginBottom: 16, border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 12px' }}>
                      QR пока недоступен — откройте страницу оплаты. Подтверждение придёт автоматически.
                    </p>
                    <a
                      href={qrRedirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 12, background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                    >
                      <Icon name="open_in_new" size={16} />
                      Открыть страницу оплаты
                    </a>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--on-surface-variant)', fontSize: 13, marginTop: 16 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      Ожидаем подтверждение оплаты...
                    </div>
                  </div>
                )}

                {qrDataUrl && qrStatus === 'pending' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                      <div style={{
                        padding: 12, borderRadius: 20,
                        background: '#fff',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      }}>
                        <img src={qrDataUrl} alt="QR для оплаты" style={{ width: 240, height: 240, display: 'block' }} />
                      </div>
                    </div>

                    <div className="glass-l2" style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16, border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
                        Отсканируйте в приложении банка
                      </p>
                      <p style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: '#A78BFA', margin: 0 }}>
                        {qrAmount.toLocaleString('ru')} ₽
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--on-surface-variant)', fontSize: 13 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      Ожидаем оплату...
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== SCREEN: SPLIT ===== */}
            {payScreen === 'split' && (
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setPayScreen('methods')} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="arrow_back" size={18} />
                  </button>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>ПОДТВЕРЖДЕНИЕ</h2>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      ИТОГО: {total.toLocaleString('ru')} ₽
                    </p>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ height: 10, borderRadius: 9999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex' }}>
                    {splitParts.map((p, i) => (
                      <div key={i} style={{ height: '100%', width: `${Math.min(100, (p.amount / total) * 100)}%`, background: methodColor(p.method), opacity: 0.85 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>ОПЛАЧЕНО: {splitSum.toLocaleString('ru')} ₽</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: remaining > 0.01 ? '#8B5CF6' : 'var(--success)' }}>
                      {remaining > 0.01 ? `ОСТАТОК: ${remaining.toLocaleString('ru')} ₽` : '✓ ПОЛНОСТЬЮ'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {splitParts.map((part, idx) => (
                    <div key={idx} className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Icon name={methodIcon(part.method)} size={18} color={methodColor(part.method)} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{part.label ?? methodLabel(part.method)}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: methodColor(part.method) }}>{part.amount.toLocaleString('ru')} ₽</span>
                      <button onClick={() => removeSplitPart(idx)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(244,63,94,0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {remaining > 0.01 && (
                  <div style={{ textAlign: 'center', padding: '10px 0 14px', color: '#8B5CF6', fontSize: 13, fontWeight: 600 }}>
                    Ещё нужно: {remaining.toLocaleString('ru')} ₽
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setPayScreen('methods')} className="glass-l2" style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface-variant)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    + МЕТОД
                  </button>
                  <button
                    onClick={finishPayment}
                    disabled={remaining > 0.01 || isProcessing || pay.isPending}
                    style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 4px 20px rgba(139,92,246,0.35)', opacity: (remaining > 0.01 || isProcessing || pay.isPending) ? 0.5 : 1 }}
                  >
                    {pay.isPending || isProcessing ? 'ПРОВОДИМ...' : 'ЗАВЕРШИТЬ ОПЛАТУ'}
                  </button>
                </div>
                {pay.isError && (
                  <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
                    {(pay.error as Error)?.message ?? 'Ошибка оплаты'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        .check-layout {
          position: relative;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* ── Плашка оплаты как плавающий «остров» навигации (телефон/планшет) ──
           Точные размеры и позиция нижней панели: fixed, left/right 14,
           bottom = safe + 6 (+ standalone-смещение), радиус 28, то же стекло. */
        @media (max-width: 1023px) {
          .check-pay-bar {
            position: fixed !important;
            left: 14px !important;
            right: 14px !important;
            bottom: calc(env(safe-area-inset-bottom) + 6px) !important;
            z-index: 30 !important;
            padding: 7px 12px !important;
            border: 1px solid rgba(255,255,255,0.12) !important;
            border-radius: 28px !important;
            background: rgba(24,20,32,0.6) !important;
            backdrop-filter: blur(26px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25) !important;
          }
          /* Строки аренды/скидок в компактном острове — мельче и плотнее, но видны
             (синхронно с ПК: те же редактор времени аренды и снятие скидок). */
          .check-pay-line { margin-bottom: 4px !important; font-size: 11px !important; }
          .check-pay-label { font-size: 9px !important; letter-spacing: 0.06em !important; margin: 0 0 1px !important; }
          .check-pay-amount { font-size: 18px !important; }
          .check-pay-actions { gap: 6px !important; }
          /* «Добавить» и «Скидка» → круглые иконки-кнопки (как FAB у навигации). */
          .check-pay-add {
            width: 44px !important; height: 44px !important;
            padding: 0 !important; border-radius: 50% !important; gap: 0 !important; flex-shrink: 0 !important;
          }
          .check-pay-add-label { display: none !important; }
          /* Кнопка-таймер аренды: компактная капсула с иконкой+суммой (сумма видна). */
          .check-pay-timer {
            height: 44px !important; padding: 0 10px !important;
            font-size: 11px !important; border-radius: 14px !important; gap: 4px !important;
          }
          .check-pay-go {
            height: 44px !important; padding: 0 14px !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            font-size: 12px !important; border-radius: 16px !important; flex-shrink: 0 !important;
            white-space: nowrap !important;
          }
          /* Контент чека докручивается выше плавающей плашки. */
          .check-items { padding-bottom: var(--bottom-nav-clear, 96px) !important; }
        }
        /* iOS standalone: опускаем остров ровно как нав-панель (см. globals.css). */
        @media (display-mode: standalone) and (max-width: 1023px) {
          .check-pay-bar {
            bottom: calc(env(safe-area-inset-bottom) + 6px + (100svh - 100lvh)) !important;
          }
        }
      `}</style>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelCheck.mutate()}
        title="Отменить чек?"
        message="Чек будет отменён без оплаты. Действие необратимо."
        confirmLabel="Отменить чек"
        cancelLabel="Назад"
        danger
        loading={cancelCheck.isPending}
      />
    </div>
  )
}
