import { create } from 'zustand'

interface CartItem {
  id: string
  itemId: string
  name: string
  price: number
  quantity: number
  modifierIds: string[]
  modifierNames: string[]
  modifierDelta: number
}

interface POSState {
  activeCheckId: string | null
  cart: CartItem[]
  cartFingerprint: string
  _savePromise: Promise<void> | null
  _pendingSave: boolean
  _cancellingCheckIds: Set<string>
  _closingCheckIds: Set<string>
  _recentlyRemovedCheckIds: Map<string, number>
  setActiveCheck: (id: string | null) => void
  addToCart: (item: CartItem) => void
  removeFromCart: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  clearCart: () => void
  markCancelling: (id: string) => void
  markClosing: (id: string) => void
  markRemoved: (id: string) => void
  isRecentlyRemoved: (id: string) => boolean
}

export const usePOSStore = create<POSState>((set, get) => ({
  activeCheckId: null,
  cart: [],
  cartFingerprint: '',
  _savePromise: null,
  _pendingSave: false,
  _cancellingCheckIds: new Set(),
  _closingCheckIds: new Set(),
  _recentlyRemovedCheckIds: new Map(),

  setActiveCheck: (id) => set({ activeCheckId: id }),

  addToCart: (item) =>
    set((s) => {
      const key = `${item.itemId}-${item.modifierIds.sort().join(',')}`
      const existing = s.cart.find(
        (c) => `${c.itemId}-${c.modifierIds.sort().join(',')}` === key
      )
      const cart = existing
        ? s.cart.map((c) =>
            `${c.itemId}-${c.modifierIds.sort().join(',')}` === key
              ? { ...c, quantity: c.quantity + item.quantity }
              : c
          )
        : [...s.cart, item]
      return { cart, cartFingerprint: Date.now().toString() }
    }),

  removeFromCart: (id) =>
    set((s) => ({
      cart: s.cart.filter((c) => c.id !== id),
      cartFingerprint: Date.now().toString(),
    })),

  updateQuantity: (id, qty) =>
    set((s) => ({
      cart:
        qty <= 0
          ? s.cart.filter((c) => c.id !== id)
          : s.cart.map((c) => (c.id === id ? { ...c, quantity: qty } : c)),
      cartFingerprint: Date.now().toString(),
    })),

  clearCart: () => set({ cart: [], cartFingerprint: '', activeCheckId: null }),

  markCancelling: (id) =>
    set((s) => {
      const set_ = new Set(s._cancellingCheckIds)
      set_.add(id)
      setTimeout(() => usePOSStore.getState()._cancellingCheckIds.delete(id), 15_000)
      return { _cancellingCheckIds: set_ }
    }),

  markClosing: (id) =>
    set((s) => {
      const set_ = new Set(s._closingCheckIds)
      set_.add(id)
      setTimeout(() => usePOSStore.getState()._closingCheckIds.delete(id), 10_000)
      return { _closingCheckIds: set_ }
    }),

  markRemoved: (id) =>
    set((s) => {
      const map = new Map(s._recentlyRemovedCheckIds)
      map.set(id, Date.now())
      setTimeout(() => usePOSStore.getState()._recentlyRemovedCheckIds.delete(id), 15_000)
      return { _recentlyRemovedCheckIds: map }
    }),

  isRecentlyRemoved: (id) => {
    const ts = get()._recentlyRemovedCheckIds.get(id)
    return !!ts && Date.now() - ts < 15_000
  },
}))

if (typeof window !== 'undefined') {
  window.__clearPOSState = () => usePOSStore.getState().clearCart()
}
