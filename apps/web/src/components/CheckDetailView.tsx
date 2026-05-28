'use client'
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { differenceInMinutes } from 'date-fns'
import { SwipeableRow } from '@/components/SwipeableRow'
import { Icon } from '@/components/Icon'

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
  spaceHourlyRate?: string | null
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

  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showMenuDrawer, setShowMenuDrawer] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [isPaid, setIsPaid] = useState(false)

  // Space rental live timer
  const [spaceRental, setSpaceRental] = useState(0)

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
  const categories = categoriesData?.categories ?? []
  const allItems = (itemsData?.items ?? []).filter(i => i.isActive)
  const filteredItems = allItems.filter(item => {
    const matchCat = !activeCat || item.category === activeCat
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // Space rental calc
  useEffect(() => {
    if (!check?.spaceId || !check?.spaceStartAt || !check?.spaceHourlyRate) return
    const calc = () => {
      const mins = differenceInMinutes(new Date(), new Date(check.spaceStartAt!))
      setSpaceRental(Math.ceil(mins / 60) * parseFloat(check.spaceHourlyRate ?? '0'))
    }
    calc()
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
      if (err instanceof ApiError && err.data) {
        if (err.data.redirectUrl) setQrRedirectUrl(err.data.redirectUrl as string)
        // Транзакция создана на Platega, polling продолжается чтобы поймать CONFIRMED
        if (err.data.transactionId) setQrTransactionId(err.data.transactionId as string)
      }
      setQrError((err as Error)?.message ?? 'Ошибка создания QR')
    } finally {
      setQrLoading(false)
    }
  }

  const invalidateCheck = useCallback(() => qc.invalidateQueries({ queryKey: ['check', checkId] }), [qc, checkId])

  // Polling Platega статуса каждые 3 секунды пока QR-экран активен
  useEffect(() => {
    if (payScreen !== 'qr' || !qrTransactionId || qrStatus !== 'pending' || qrLoading) return
    const poll = async () => {
      try {
        const res = await api.get<{ status: string }>(`/pos/checks/${checkId}/qr/${qrTransactionId}/status`)
        if (res.status === 'CONFIRMED') {
          setQrStatus('confirmed')
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
  }, [payScreen, qrTransactionId, qrStatus, qrLoading, checkId, qrAmount])

  const addItem = useMutation({
    mutationFn: (itemId: string) => api.post(`/pos/checks/${checkId}/items`, { itemId, quantity: 1 }),
    onSuccess: invalidateCheck,
  })

  const updateQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      quantity === 0
        ? api.delete(`/pos/checks/${checkId}/items/${id}`)
        : api.patch(`/pos/checks/${checkId}/items/${id}`, { quantity }),
    onSuccess: invalidateCheck,
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
      qc.invalidateQueries({ queryKey: ['checks', 'active'] })
      if (onClose) onClose()
      else onBack()
    },
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
    } catch {
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
            {getInitials(check?.guestName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {check?.guestName || 'Гость'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>
              {check?.items.length ?? 0} позиций
            </p>
          </div>
        </div>

        <button
          onClick={() => cancelCheck.mutate()}
          style={{
            padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(251,113,133,0.25)',
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
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
                    style={{
                      width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer', background: 'rgba(255,255,255,0.04)',
                      color: ci.checkItem.quantity === 1 ? 'var(--danger)' : 'var(--on-surface-variant)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name={ci.checkItem.quantity === 1 ? 'delete' : 'remove'} size={14} />
                  </button>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>
                    {ci.checkItem.quantity}
                  </span>
                  <button
                    onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity + 1 })}
                    style={{
                      width: 30, height: 30, borderRadius: 9, border: 'none',
                      cursor: 'pointer', background: 'rgba(139,92,246,0.2)', color: '#A78BFA',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="add" size={14} />
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

          {/* Payment footer */}
          <div className="glass-l1" style={{ padding: 16, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0 }}>
            {spaceRental > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="meeting_room" size={14} />
                  Аренда (живой счётчик)
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#A78BFA' }}>
                  +{spaceRental.toLocaleString('ru')} ₽
                </span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
                  Итого
                </p>
                <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: 0, color: 'var(--on-surface)' }}>
                  {total.toLocaleString('ru')} ₽
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowMenuDrawer(true)}
                  style={{
                    padding: '14px 20px', borderRadius: 16, border: '1px solid rgba(139,92,246,0.35)',
                    cursor: 'pointer', background: 'rgba(139,92,246,0.1)',
                    color: '#A78BFA', fontSize: 13, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Icon name="add" size={18} />
                  Добавить
                </button>
                <button
                  onClick={openPaymentDrawer}
                  disabled={total === 0}
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
                  const maxBonus = Math.min(playerBonus, Math.floor(total * 0.5))
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
      `}</style>
    </div>
  )
}
