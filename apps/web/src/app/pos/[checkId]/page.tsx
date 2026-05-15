'use client'
import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
  payments: any[]
  guestName?: string
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Наличные', icon: 'payments', color: 'var(--pay-cash)', rgb: '16,185,129' },
  { id: 'card', label: 'Карта', icon: 'credit_card', color: 'var(--pay-card)', rgb: '59,130,246' },
  { id: 'transfer', label: 'СБП/QR', icon: 'qr_code_2', color: 'var(--pay-split)', rgb: '139,92,246' },
  { id: 'bonus', label: 'Бонусы', icon: 'stars', color: 'var(--pay-bonus)', rgb: '245,158,11' },
  { id: 'deposit', label: 'Депозит', icon: 'account_balance_wallet', color: 'var(--pay-deposit)', rgb: '6,182,212' },
  { id: 'certificate', label: 'В долг', icon: 'person_pin', color: 'var(--pay-debt)', rgb: '244,63,94' },
]

const QUICK_AMOUNTS = [500, 1000, 2000, 5000]

function getInitials(name?: string): string {
  if (!name) return 'Г'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

export default function CheckDetailPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = use(params)
  const router = useRouter()
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
  const [showPayment, setShowPayment] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [isPaid, setIsPaid] = useState(false)

  const invalidateCheck = () => qc.invalidateQueries({ queryKey: ['check', checkId] })

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
    mutationFn: (body: any) => api.post(`/pos/checks/${checkId}/pay`, body),
    onSuccess: () => {
      setIsPaid(true)
      qc.invalidateQueries({ queryKey: ['checks', 'active'] })
      setTimeout(() => router.replace('/pos'), 1800)
    },
  })

  const cancelCheck = useMutation({
    mutationFn: () => api.delete(`/pos/checks/${checkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checks', 'active'] })
      router.replace('/pos')
    },
  })

  const check = checkData
  const categories = categoriesData?.categories ?? []
  const allItems = (itemsData?.items ?? []).filter(i => i.isActive)
  const filteredItems = allItems.filter(item => {
    const matchCat = !activeCat || item.category === activeCat
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })
  const total = parseFloat(check?.totalAmount ?? '0')
  const paid = parseFloat(payAmount || '0')
  const change = Math.max(0, paid - total)
  const remaining = Math.max(0, total - paid)
  const isReady = paid >= total && total > 0

  if (isPaid) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', marginBottom: 20, marginLeft: 'auto', marginRight: 'auto',
            background: 'rgba(52,211,153,0.15)', border: '2px solid var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(52,211,153,0.3)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, color: 'var(--success)', fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="glass-l1" style={{
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
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
              <div
                key={ci.checkItem.id}
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
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {ci.checkItem.quantity === 1 ? 'delete' : 'remove'}
                    </span>
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
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                  </button>
                </div>
                <p style={{ fontSize: 14, fontStyle: 'italic', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', width: 64, textAlign: 'right', margin: 0 }}>
                  {(parseFloat(ci.checkItem.priceAtTime) * ci.checkItem.quantity).toLocaleString('ru')} ₽
                </p>
              </div>
            ))}

            {check?.items.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 12, opacity: 0.4 }}>
                  shopping_cart
                </span>
                <p style={{ fontSize: 13 }}>Добавьте товары из меню →</p>
              </div>
            )}
          </div>

          {/* Payment footer */}
          <div className="glass-l1" style={{ padding: 16, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
                  Итого
                </p>
                <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: 0, color: 'var(--on-surface)' }}>
                  {total.toLocaleString('ru')} ₽
                </p>
              </div>
              <button
                onClick={() => { setPayAmount(String(total)); setShowPayment(true) }}
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

        {/* Right: menu picker */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--on-surface-variant)' }}>
                search
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="glass-l2"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)',
                  fontSize: 13, outline: 'none', background: 'none',
                }}
              />
            </div>
          </div>

          {/* Category filters */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            <button
              onClick={() => setActiveCat(null)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: !activeCat ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'rgba(255,255,255,0.05)',
                color: !activeCat ? '#fff' : 'var(--on-surface-variant)',
                boxShadow: !activeCat ? '0 2px 12px rgba(139,92,246,0.3)' : 'none',
              }}
            >
              Все
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: activeCat === cat.id ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'rgba(255,255,255,0.05)',
                  color: activeCat === cat.id ? '#fff' : 'var(--on-surface-variant)',
                  boxShadow: activeCat === cat.id ? '0 2px 12px rgba(139,92,246,0.3)' : 'none',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignContent: 'start',
          }}>
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => addItem.mutate(item.id)}
                disabled={item.trackStock && item.stockQuantity === 0}
                className="glass-l2"
                style={{
                  borderRadius: 14, padding: 12, border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer', textAlign: 'left',
                  opacity: item.trackStock && item.stockQuantity === 0 ? 0.4 : 1,
                  transition: 'all 0.15s',
                  background: 'rgba(255,255,255,0.04)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(139,92,246,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--on-surface)', lineHeight: 1.3, marginBottom: 6 }}>
                  {item.name}
                </p>
                <p style={{ fontSize: 14, fontStyle: 'italic', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#A78BFA', margin: 0 }}>
                  {parseFloat(item.price).toLocaleString('ru')} ₽
                </p>
                {item.trackStock && (
                  <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                    {item.stockQuantity} шт.
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stitch Payment Modal */}
      {showPayment && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
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
            {/* Modal header */}
            <div style={{ padding: '28px 28px 0', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                background: '#8B5CF6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#fff', fontVariationSettings: "'FILL' 1" }}>
                  payments
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>
                  ОПЛАТА
                </h2>
                <p style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'var(--on-surface-variant)', margin: '4px 0 0',
                }}>
                  ВЫБЕРИТЕ МЕТОД
                </p>
              </div>
              <button
                onClick={() => setShowPayment(false)}
                style={{
                  width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>

            <div style={{ padding: '20px 28px 28px' }}>

              {/* Progress bar */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ height: 12, borderRadius: 9999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (paid / total) * 100)}%`,
                    background: isReady ? 'linear-gradient(90deg, var(--success), #059669)' : 'linear-gradient(90deg, #8B5CF6, #4cd7f6)',
                    borderRadius: 9999,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>РАСПРЕДЕЛЕНИЕ СУММЫ</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8B5CF6' }}>
                    ОСТАТОК: {remaining.toLocaleString('ru')}₽
                  </span>
                </div>
              </div>

              {/* Total display */}
              <div style={{
                textAlign: 'center', padding: '20px 0 16px',
                borderRadius: 20,
                background: isReady ? 'rgba(52,211,153,0.08)' : 'rgba(139,92,246,0.06)',
                border: `1px solid ${isReady ? 'rgba(52,211,153,0.2)' : 'rgba(139,92,246,0.15)'}`,
                marginBottom: 20,
              }}>
                <p style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'var(--on-surface-variant)', margin: '0 0 6px',
                }}>
                  ИТОГО К ОПЛАТЕ:
                </p>
                <p style={{
                  fontSize: 40, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums',
                  color: isReady ? 'var(--success)' : '#A78BFA', margin: 0,
                }}>
                  {total.toLocaleString('ru')} ₽
                </p>
                {change > 0 && (
                  <p style={{ color: 'var(--success)', fontSize: 13, marginTop: 4, margin: '4px 0 0' }}>
                    Сдача: {change.toLocaleString('ru')} ₽
                  </p>
                )}
              </div>

              {/* Payment methods grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {PAYMENT_METHODS.map(m => {
                  const active = payMethod === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      className="glass-l2"
                      style={{
                        padding: '14px 10px', borderRadius: 14, border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: active ? `rgba(${m.rgb},0.12)` : 'rgba(255,255,255,0.04)',
                        boxShadow: active
                          ? `0 0 20px rgba(${m.rgb},0.25), inset 0 0 0 1px rgba(${m.rgb},0.4)`
                          : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{
                        fontSize: 22, color: m.color,
                        fontVariationSettings: "'FILL' 1, 'wght' 400",
                      }}>
                        {m.icon}
                      </span>
                      <p style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--on-surface)' : 'var(--on-surface-variant)', margin: 0 }}>
                        {m.label}
                      </p>
                    </button>
                  )
                })}
              </div>

              {/* Amount input */}
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
                Сумма
              </p>
              <input
                type="number"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="glass-l2"
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  border: '1px solid rgba(139,92,246,0.25)',
                  color: 'var(--on-surface)', fontSize: 22, fontWeight: 800, fontStyle: 'italic',
                  outline: 'none', background: 'none', marginBottom: 12,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />

              {/* Quick pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setPayAmount(String(total))}
                  style={{
                    padding: '8px 14px', borderRadius: 9999, border: '1px solid rgba(139,92,246,0.3)',
                    cursor: 'pointer', background: 'rgba(139,92,246,0.1)', color: '#A78BFA', fontSize: 12, fontWeight: 600,
                  }}
                >
                  Весь остаток
                </button>
                {QUICK_AMOUNTS.map(a => (
                  <button
                    key={a}
                    onClick={() => setPayAmount(v => String((parseFloat(v) || 0) + a))}
                    style={{
                      padding: '8px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    +{a.toLocaleString('ru')}
                  </button>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => pay.mutate({ payments: [{ method: payMethod, amount: total }] })}
                disabled={paid < total || pay.isPending}
                style={{
                  width: '100%', height: 56, borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                  color: '#fff', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em',
                  boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                  opacity: (paid < total || pay.isPending) ? 0.5 : 1,
                  transition: 'all 0.3s',
                }}
              >
                {pay.isPending ? 'ПРОВОДИМ...' : isReady ? 'ЗАВЕРШИТЬ ОПЛАТУ' : `НУЖНО ЕЩЁ ${remaining.toLocaleString('ru')} ₽`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (min-width: 768px) {
          .check-layout {
            grid-template-columns: 420px 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
