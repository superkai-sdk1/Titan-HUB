'use client'
import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, Minus, Trash2, CreditCard, Banknote, X, CheckCircle2 } from 'lucide-react'
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
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Наличные', icon: Banknote },
  { id: 'card', label: 'Карта', icon: CreditCard },
  { id: 'transfer', label: 'Перевод', icon: CreditCard },
]

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
      setTimeout(() => router.replace('/pos'), 1500)
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
  const allItems = itemsData?.items ?? []
  const filteredItems = activeCat ? allItems.filter(i => i.category === activeCat) : allItems
  const total = parseFloat(check?.totalAmount ?? '0')
  const paid = parseFloat(payAmount || '0')
  const change = Math.max(0, paid - total)

  if (isPaid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center">
          <CheckCircle2 size={80} className="text-green-400 mx-auto mb-4" />
          <p className="text-2xl font-bold">Оплачено!</p>
          {change > 0 && <p className="text-muted-foreground mt-2">Сдача: {change.toLocaleString('ru')} ₽</p>}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30 px-4 py-3 safe-top flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-muted-foreground">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="font-bold">Чек</h1>
          <p className="text-xs text-muted-foreground">{check?.items.length ?? 0} позиций</p>
        </div>
        <button
          onClick={() => cancelCheck.mutate()}
          className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400"
        >
          Отменить
        </button>
      </div>

      {/* Split layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
        {/* Left: check items */}
        <div className="overflow-y-auto px-4 py-3 lg:border-r border-border">
          {isLoading && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />)}</div>}

          {check?.items.map((ci) => (
            <div key={ci.checkItem.id} className="flex items-center gap-3 py-3 border-b border-border/50">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{ci.item?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{parseFloat(ci.checkItem.priceAtTime).toLocaleString('ru')} ₽</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity - 1 })}
                  className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted-foreground"
                >
                  {ci.checkItem.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                </button>
                <span className="w-6 text-center text-sm font-medium">{ci.checkItem.quantity}</span>
                <button
                  onClick={() => updateQty.mutate({ id: ci.checkItem.id, quantity: ci.checkItem.quantity + 1 })}
                  className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center"
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="text-sm font-semibold w-16 text-right">
                {(parseFloat(ci.checkItem.priceAtTime) * ci.checkItem.quantity).toLocaleString('ru')} ₽
              </p>
            </div>
          ))}

          {check?.items.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8 text-sm">Добавьте товары из меню →</p>
          )}
        </div>

        {/* Right: menu picker */}
        <div className="flex flex-col overflow-hidden">
          {/* Category tabs */}
          <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar border-b border-border">
            <button
              onClick={() => setActiveCat(null)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${!activeCat ? 'bg-primary text-white' : 'bg-surface text-muted-foreground'}`}
            >
              Все
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${activeCat === cat.id ? 'bg-primary text-white' : 'bg-surface text-muted-foreground'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => addItem.mutate(item.id)}
                disabled={item.trackStock && item.stockQuantity === 0}
                className="p-3 rounded-xl bg-surface border border-border text-left active:scale-95 transition-transform disabled:opacity-40"
              >
                <p className="text-sm font-medium leading-tight">{item.name}</p>
                <p className="text-primary text-sm font-bold mt-1">{parseFloat(item.price).toLocaleString('ru')} ₽</p>
                {item.trackStock && (
                  <p className="text-xs text-muted-foreground mt-0.5">Остаток: {item.stockQuantity}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-surface px-4 py-3 safe-bottom">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Итого</p>
            <p className="text-2xl font-bold">{total.toLocaleString('ru')} ₽</p>
          </div>
          <button
            onClick={() => { setPayAmount(String(total)); setShowPayment(true) }}
            disabled={total === 0}
            className="px-8 py-3 rounded-2xl bg-primary text-white font-bold text-lg disabled:opacity-40"
          >
            Оплатить
          </button>
        </div>
      </div>

      {/* Payment drawer */}
      <AnimatePresence>
        {showPayment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Оплата</h2>
                <button onClick={() => setShowPayment(false)} className="text-muted-foreground"><X size={20} /></button>
              </div>

              {/* Method tabs */}
              <div className="flex gap-2 mb-4">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPayMethod(m.id)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${payMethod === m.id ? 'bg-primary text-white' : 'bg-background text-muted-foreground'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Amount input */}
              <div className="mb-4">
                <label className="text-xs text-muted-foreground mb-1 block">Сумма</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white text-xl font-bold"
                />
              </div>

              {/* Totals */}
              <div className="rounded-xl bg-background p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">К оплате</span>
                  <span className="font-semibold">{total.toLocaleString('ru')} ₽</span>
                </div>
                {change > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Сдача</span>
                    <span className="font-semibold">{change.toLocaleString('ru')} ₽</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => pay.mutate({ payments: [{ method: payMethod, amount: total }] })}
                disabled={paid < total || pay.isPending}
                className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg disabled:opacity-40"
              >
                {pay.isPending ? 'Проводим...' : `Принять оплату · ${total.toLocaleString('ru')} ₽`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
