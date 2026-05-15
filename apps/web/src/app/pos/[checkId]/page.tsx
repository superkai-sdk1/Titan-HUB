'use client'
import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, Minus, Trash2, X, CheckCircle2, Search } from 'lucide-react'
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
  { id: 'cash', label: 'Наличные', color: 'var(--pay-cash)' },
  { id: 'card', label: 'Карта', color: 'var(--pay-card)' },
  { id: 'transfer', label: 'Перевод', color: 'var(--pay-split)' },
  { id: 'bonus', label: 'Бонусы', color: 'var(--pay-bonus)' },
  { id: 'deposit', label: 'Депозит', color: 'var(--pay-deposit)' },
  { id: 'certificate', label: 'Сертификат', color: 'var(--pay-cert)' },
]

const QUICK_AMOUNTS = [500, 1000, 2000, 5000]

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

  function getInitials(name?: string) {
    if (!name) return 'Г'
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  }

  if (isPaid) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          style={{ textAlign: 'center' }}
        >
          <div style={{
            width: 88, height: 88, borderRadius: '50%', marginBottom: 20, marginLeft: 'auto', marginRight: 'auto',
            background: 'rgba(52,211,153,0.15)', border: '2px solid var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(52,211,153,0.3)',
          }}>
            <CheckCircle2 size={44} color="var(--success)" />
          </div>
          <h2 className="drawer-title" style={{ fontSize: 28, color: 'var(--success)', marginBottom: 8 }}>ОПЛАЧЕНО!</h2>
          {change > 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
              Сдача: <span className="amount" style={{ color: 'var(--text-primary)', fontSize: 17 }}>{change.toLocaleString('ru')} ₽</span>
            </p>
          )}
        </motion.div>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="glass-1" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0 }}>
        <button
          onClick={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <ArrowLeft size={18} />
        </button>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.3), rgba(var(--accent-2-rgb),0.3))',
            border: '1px solid rgba(var(--accent-rgb),0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'var(--accent-light)',
          }}>
            {getInitials(check?.guestName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {check?.guestName || 'Гость'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {check?.items.length ?? 0} позиций
            </p>
          </div>
        </div>

        <button
          onClick={() => cancelCheck.mutate()}
          style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(251,113,133,0.25)', cursor: 'pointer', background: 'rgba(251,113,133,0.08)', color: 'var(--danger)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
        >
          Отменить
        </button>
      </div>

      {/* Split layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', overflow: 'hidden' }}
        className="md:grid-cols-[420px_1fr]"
      >
        {/* Left: check items */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--l1-border)' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12, marginBottom: 8 }} />
            ))}

            {check?.items.map((ci) => (
              <div key={ci.checkItem.id} className="glass-2" style={{ borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                    {ci.item?.name ?? '—'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                    {parseFloat(ci.checkItem.priceAtTime).toLocaleString('ru')} ₽
                  </p>
                </div>
                {/* Qty controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity - 1 })}
                    style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--l2-border)', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {ci.checkItem.quantity === 1 ? <Trash2 size={12} color="var(--danger)" /> : <Minus size={12} />}
                  </button>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {ci.checkItem.quantity}
                  </span>
                  <button
                    onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity + 1 })}
                    style={{ width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(var(--accent-rgb),0.2)', color: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <p className="amount" style={{ fontSize: 14, color: 'var(--text-primary)', width: 64, textAlign: 'right' }}>
                  {(parseFloat(ci.checkItem.priceAtTime) * ci.checkItem.quantity).toLocaleString('ru')} ₽
                </p>
              </div>
            ))}

            {check?.items.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: 13 }}>Добавьте товары из меню →</p>
              </div>
            )}
          </div>

          {/* Payment footer */}
          <div className="glass-1" style={{ padding: '16px', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p className="label-cap">Итого</p>
                <p className="amount" style={{ fontSize: 28, margin: 0, color: 'var(--text-primary)' }}>
                  {total.toLocaleString('ru')} ₽
                </p>
              </div>
              <button
                onClick={() => { setPayAmount(String(total)); setShowPayment(true) }}
                disabled={total === 0}
                style={{
                  padding: '14px 28px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                  color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  boxShadow: 'var(--sh-button)', opacity: total === 0 ? 0.4 : 1,
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
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--l1-border)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="glass-2"
                style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 12, border: '1px solid var(--l2-border)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', background: 'none' }}
              />
            </div>
          </div>

          {/* Category filters */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto', borderBottom: '1px solid var(--l1-border)', flexShrink: 0 }}>
            <button
              onClick={() => setActiveCat(null)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: !activeCat ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'rgba(255,255,255,0.05)',
                color: !activeCat ? '#fff' : 'var(--text-secondary)',
                boxShadow: !activeCat ? '0 2px 12px rgba(var(--accent-rgb),0.3)' : 'none',
              }}
            >
              Все
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: activeCat === cat.id ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'rgba(255,255,255,0.05)',
                  color: activeCat === cat.id ? '#fff' : 'var(--text-secondary)',
                  boxShadow: activeCat === cat.id ? '0 2px 12px rgba(var(--accent-rgb),0.3)' : 'none',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignContent: 'start' }}>
            {filteredItems.map(item => (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => addItem.mutate(item.id)}
                disabled={item.trackStock && item.stockQuantity === 0}
                className="glass-2"
                style={{
                  borderRadius: 14, padding: '12px', border: '1px solid var(--l2-border)', cursor: 'pointer', textAlign: 'left',
                  opacity: item.trackStock && item.stockQuantity === 0 ? 0.4 : 1,
                  transition: 'background 0.15s',
                  background: 'var(--l2-bg)',
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 6 }}>
                  {item.name}
                </p>
                <p className="amount" style={{ fontSize: 14, color: 'var(--accent-light)', margin: 0 }}>
                  {parseFloat(item.price).toLocaleString('ru')} ₽
                </p>
                {item.trackStock && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {item.stockQuantity} шт.
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Drawer */}
      <AnimatePresence>
        {showPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
            onClick={e => { if (e.target === e.currentTarget) setShowPayment(false) }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="glass-1"
              style={{
                width: '100%', maxHeight: '92dvh', overflowY: 'auto',
                borderRadius: '32px 32px 0 0', padding: '20px 24px 40px',
                boxShadow: 'var(--sh-drawer)',
              }}
            >
              {/* Drag indicator */}
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 20px' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 className="drawer-title" style={{ fontSize: 20, margin: 0 }}>ОПЛАТА</h2>
                <button
                  onClick={() => setShowPayment(false)}
                  style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Big amount block */}
              <div style={{
                textAlign: 'center', padding: '20px 0 16px',
                borderRadius: 20,
                background: isReady ? 'rgba(52,211,153,0.08)' : 'rgba(var(--accent-rgb),0.06)',
                border: `1px solid ${isReady ? 'rgba(52,211,153,0.2)' : 'rgba(var(--accent-rgb),0.15)'}`,
                marginBottom: 20,
              }}>
                <p className="label-cap" style={{ marginBottom: 4 }}>
                  {isReady ? 'К ОПЛАТЕ' : 'ОСТАТОК'}
                </p>
                <p className="amount" style={{ fontSize: 40, color: isReady ? 'var(--success)' : 'var(--accent-light)', margin: 0 }}>
                  {(isReady ? total : remaining).toLocaleString('ru')} ₽
                </p>
                {change > 0 && (
                  <p style={{ color: 'var(--success)', fontSize: 13, marginTop: 4 }}>
                    Сдача: {change.toLocaleString('ru')} ₽
                  </p>
                )}
              </div>

              {/* Payment methods grid */}
              <p className="label-cap" style={{ marginBottom: 10 }}>Метод оплаты</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
                {PAYMENT_METHODS.map(m => {
                  const active = payMethod === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      style={{
                        padding: '12px 8px', borderRadius: 14, border: 'none', cursor: 'pointer', textAlign: 'center',
                        background: active ? `rgba(${hexToRgb(m.color)},0.15)` : 'rgba(255,255,255,0.04)',
                        boxShadow: active ? `0 0 20px rgba(${hexToRgb(m.color)},0.3), inset 0 0 0 1px rgba(${hexToRgb(m.color)},0.4)` : '0 0 0 1px rgba(255,255,255,0.07)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', marginBottom: 6, marginLeft: 'auto', marginRight: 'auto',
                        background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16,
                      }}>
                        {methodIcon(m.id)}
                      </div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', margin: 0 }}>
                        {m.label}
                      </p>
                    </button>
                  )
                })}
              </div>

              {/* Amount input */}
              <p className="label-cap" style={{ marginBottom: 8 }}>Сумма</p>
              <input
                type="number"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="glass-2"
                style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--text-primary)', fontSize: 22, fontWeight: 800, fontStyle: 'italic', outline: 'none', background: 'none', marginBottom: 12 }}
              />

              {/* Quick pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setPayAmount(String(total))}
                  style={{ padding: '8px 14px', borderRadius: 'var(--r-full)', border: '1px solid rgba(var(--accent-rgb),0.3)', cursor: 'pointer', background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent-light)', fontSize: 12, fontWeight: 600 }}
                >
                  Весь остаток
                </button>
                {QUICK_AMOUNTS.map(a => (
                  <button
                    key={a}
                    onClick={() => setPayAmount(v => String((parseFloat(v) || 0) + a))}
                    style={{ padding: '8px 14px', borderRadius: 'var(--r-full)', border: '1px solid var(--l2-border)', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
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
                  width: '100%', padding: '16px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                  background: isReady ? 'linear-gradient(135deg, var(--success), #059669)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                  color: '#fff', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em',
                  boxShadow: isReady ? '0 4px 20px rgba(52,211,153,0.35)' : 'var(--sh-button)',
                  opacity: (paid < total || pay.isPending) ? 0.5 : 1,
                  transition: 'all 0.3s',
                }}
              >
                {pay.isPending
                  ? 'ПРОВОДИМ...'
                  : isReady
                    ? `ПРИНЯТЬ ОПЛАТУ · ${total.toLocaleString('ru')} ₽`
                    : `НУЖНО ЕЩЁ ${remaining.toLocaleString('ru')} ₽`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function methodIcon(id: string) {
  const icons: Record<string, string> = {
    cash: '💵', card: '💳', transfer: '📲', bonus: '⭐', deposit: '💠', certificate: '🎁'
  }
  return icons[id] ?? '💳'
}

function hexToRgb(hex: string): string {
  // Handle CSS variables or hex
  const cssVarMap: Record<string, string> = {
    'var(--pay-cash)': '16,185,129',
    'var(--pay-card)': '59,130,246',
    'var(--pay-debt)': '244,63,94',
    'var(--pay-bonus)': '245,158,11',
    'var(--pay-deposit)': '6,182,212',
    'var(--pay-split)': '139,92,246',
    'var(--pay-cert)': '20,184,166',
  }
  return cssVarMap[hex] ?? '139,92,246'
}
