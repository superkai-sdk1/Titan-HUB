'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

interface MenuItem {
  id: string
  name: string
  price: string
  category: string | null
  isActive: boolean
  isTabletVisible: boolean
  stockQuantity: number
  trackStock: boolean
  searchTags?: string[]
}

interface MenuCategory {
  id: string
  name: string
  icon: string
  color: string
}

interface ProfileData {
  id: string
  nickname: string
  role: string
  linkedSpaceId?: string | null
}

interface CartItem {
  item: MenuItem
  quantity: number
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

export default function TabletOrderPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Профиль планшета
  const { data: profileData } = useQuery({
    queryKey: ['tablet', 'profile'],
    queryFn: () => api.get<{ profile: ProfileData }>(`/pos/players/${user!.id}`).then(r => r.profile),
    enabled: !!user?.id,
  })

  const linkedSpaceId = profileData?.linkedSpaceId

  // Активный чек пространства
  const { data: checksData } = useQuery({
    queryKey: ['tablet', 'space-check', linkedSpaceId],
    queryFn: () => api.get<{ checks: { id: string }[] }>(`/pos/checks?spaceId=${linkedSpaceId}`),
    enabled: !!linkedSpaceId,
  })

  const activeCheckId = checksData?.checks?.[0]?.id

  // Меню категорий
  const { data: categoriesData } = useQuery({
    queryKey: ['menu', 'categories'],
    queryFn: () => api.get<{ categories: MenuCategory[] }>('/menu/categories'),
  })

  // Позиции меню (только tablet_visible)
  const { data: itemsData } = useQuery({
    queryKey: ['menu', 'items', 'tablet'],
    queryFn: () => api.get<{ items: MenuItem[] }>('/menu/items?tabletVisible=true'),
  })

  const categories = categoriesData?.categories ?? []
  const allItems = (itemsData?.items ?? []).filter(i => i.isActive && i.isTabletVisible)

  const filteredItems = allItems.filter(item => {
    const matchCat = !activeCat || item.category === activeCat
    const matchSearch = !search.trim() || (
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.searchTags ?? []).some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    )
    return matchCat && matchSearch
  })

  const cartTotal = cart.reduce((s, ci) => s + parseFloat(ci.item.price) * ci.quantity, 0)
  const cartCount = cart.reduce((s, ci) => s + ci.quantity, 0)

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id)
      if (existing) {
        return prev.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci)
      }
      return [...prev, { item, quantity: 1 }]
    })
  }

  function removeFromCart(itemId: string) {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === itemId)
      if (!existing) return prev
      if (existing.quantity === 1) return prev.filter(ci => ci.item.id !== itemId)
      return prev.map(ci => ci.item.id === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci)
    })
  }

  function getCartQty(itemId: string): number {
    return cart.find(ci => ci.item.id === itemId)?.quantity ?? 0
  }

  async function submitOrder() {
    if (!activeCheckId || cart.length === 0 || isSubmitting) return
    setIsSubmitting(true)
    try {
      // Добавляем каждую позицию в чек
      for (const ci of cart) {
        await api.post(`/pos/checks/${activeCheckId}/items`, {
          itemId: ci.item.id,
          quantity: ci.quantity,
        })
      }
      setCart([])
      setShowCart(false)
      setSubmitted(true)
      setTimeout(() => {
        setSubmitted(false)
        router.push('/tablet')
      }, 2500)
    } catch (e) {
      console.error('Order failed:', e)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Успешный заказ ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: 'rgba(52,211,153,0.15)',
          border: '2px solid var(--success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 40px rgba(52,211,153,0.3)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 52, color: 'var(--success)', fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: 'var(--success)', margin: '0 0 8px' }}>
            ЗАКАЗ ПРИНЯТ!
          </h2>
          <p style={{ fontSize: 15, color: 'var(--on-surface-variant)', margin: 0 }}>
            Персонал получил ваш заказ
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px',
        background: 'rgba(29,26,36,0.6)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => router.push('/tablet')}
          style={{
            width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>

        <h1 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)', flex: 1 }}>
          МЕНЮ
        </h1>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--on-surface-variant)' }}>
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск блюд..."
            className="glass-l2"
            style={{
              width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)',
              fontSize: 14, outline: 'none', background: 'none',
            }}
          />
        </div>

        {/* Cart button */}
        {cartCount > 0 && (
          <button
            onClick={() => setShowCart(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 20px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 14, fontWeight: 800,
              boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
            {cartCount}
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 24px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button
          onClick={() => setActiveCat(null)}
          style={{
            flexShrink: 0, padding: '8px 18px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
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
              flexShrink: 0, padding: '8px 18px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
        }}>
          {filteredItems.map(item => {
            const qty = getCartQty(item.id)
            const outOfStock = item.trackStock && item.stockQuantity === 0
            return (
              <div
                key={item.id}
                className="glass-l2"
                style={{
                  borderRadius: 20, padding: '20px 16px',
                  border: qty > 0 ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: qty > 0 ? '0 0 20px rgba(139,92,246,0.15)' : 'none',
                  opacity: outOfStock ? 0.4 : 1,
                  display: 'flex', flexDirection: 'column', gap: 12,
                  transition: 'all 0.2s',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: 'rgba(139,92,246,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#A78BFA', fontVariationSettings: "'FILL' 1" }}>
                    restaurant_menu
                  </span>
                </div>

                {/* Name + price */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--on-surface)', lineHeight: 1.3 }}>
                    {item.name}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: 0, color: '#A78BFA' }}>
                    {parseFloat(item.price).toLocaleString('ru')} ₽
                  </p>
                  {item.trackStock && (
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                      {item.stockQuantity} шт.
                    </p>
                  )}
                </div>

                {/* Add/remove controls */}
                {outOfStock ? (
                  <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>Нет в наличии</div>
                ) : qty === 0 ? (
                  <button
                    onClick={() => addToCart(item)}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: 'rgba(139,92,246,0.15)', color: '#A78BFA',
                      fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                    Добавить
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      style={{
                        width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: 'rgba(244,63,94,0.1)', color: 'var(--danger)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove</span>
                    </button>
                    <span style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 900, color: '#A78BFA' }}>{qty}</span>
                    <button
                      onClick={() => addToCart(item)}
                      style={{
                        width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: 'rgba(139,92,246,0.2)', color: '#A78BFA',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {filteredItems.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 0', color: 'var(--on-surface-variant)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12, opacity: 0.3 }}>
                search_off
              </span>
              <p style={{ fontSize: 16, margin: 0 }}>Ничего не найдено</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating cart button (mobile) */}
      {cartCount > 0 && !showCart && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 40 }}>
          <button
            onClick={() => setShowCart(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 32px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 16, fontWeight: 800,
              boxShadow: '0 8px 32px rgba(139,92,246,0.5)',
              whiteSpace: 'nowrap',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
            {cartCount} позиций · {cartTotal.toLocaleString('ru')} ₽
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCart(false) }}
        >
          <div
            className="glass-l1"
            style={{ width: '100%', maxHeight: '80dvh', borderRadius: '32px 32px 0 0', overflowY: 'auto', padding: '28px 24px 40px' }}
          >
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 24px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>
                ВАШ ЗАКАЗ
              </h2>
              <button onClick={() => setShowCart(false)} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            {/* Cart items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {cart.map(ci => (
                <div key={ci.item.id} className="glass-l2" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ci.item.name}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
                      {parseFloat(ci.item.price).toLocaleString('ru')} ₽ / шт.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => removeFromCart(ci.item.id)} style={{ width: 36, height: 36, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(244,63,94,0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span>
                    </button>
                    <span style={{ width: 28, textAlign: 'center', fontSize: 16, fontWeight: 800, color: 'var(--on-surface)' }}>{ci.quantity}</span>
                    <button onClick={() => addToCart(ci.item)} style={{ width: 36, height: 36, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(139,92,246,0.2)', color: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    </button>
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', margin: 0, width: 72, textAlign: 'right', flexShrink: 0 }}>
                    {(parseFloat(ci.item.price) * ci.quantity).toLocaleString('ru')} ₽
                  </p>
                </div>
              ))}
            </div>

            {/* Total + submit */}
            <div className="glass-l2" style={{ borderRadius: 16, padding: '16px 20px', marginBottom: 16, border: '1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', fontWeight: 600 }}>Итого:</span>
                <span style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: '#A78BFA' }}>
                  {cartTotal.toLocaleString('ru')} ₽
                </span>
              </div>
            </div>

            <button
              onClick={submitOrder}
              disabled={isSubmitting || !activeCheckId}
              style={{
                width: '100%', padding: '18px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
                color: '#fff', fontSize: 16, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em',
                boxShadow: '0 6px 24px rgba(139,92,246,0.4)',
                opacity: (isSubmitting || !activeCheckId) ? 0.5 : 1,
              }}
            >
              {isSubmitting ? 'ОТПРАВЛЯЕМ...' : 'ОТПРАВИТЬ ЗАКАЗ'}
            </button>

            {!activeCheckId && (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>
                Нет активного счёта. Обратитесь к персоналу.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
