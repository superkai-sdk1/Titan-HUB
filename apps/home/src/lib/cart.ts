import { create } from 'zustand';

import { num } from './format';
import type { MenuItem } from './types';

/** Корзина заказа гостя: уходит одним заказом на подтверждение персоналу. */
type CartLine = { item: MenuItem; quantity: number };

type CartState = {
  lines: CartLine[];
  add: (item: MenuItem) => void;
  remove: (itemId: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()((set) => ({
  lines: [],
  add: (item) =>
    set((s) => {
      const existing = s.lines.find((l) => l.item.id === item.id);
      if (existing) return { lines: s.lines.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l)) };
      return { lines: [...s.lines, { item, quantity: 1 }] };
    }),
  remove: (itemId) =>
    set((s) => {
      const existing = s.lines.find((l) => l.item.id === itemId);
      if (!existing) return s;
      if (existing.quantity <= 1) return { lines: s.lines.filter((l) => l.item.id !== itemId) };
      return { lines: s.lines.map((l) => (l.item.id === itemId ? { ...l, quantity: l.quantity - 1 } : l)) };
    }),
  clear: () => set({ lines: [] }),
}));

export function cartSummary(lines: CartLine[]) {
  return {
    count: lines.reduce((s, l) => s + l.quantity, 0),
    total: lines.reduce((s, l) => s + num(l.item.price) * l.quantity, 0),
  };
}

export const qtyOf = (lines: CartLine[], itemId: string) => lines.find((l) => l.item.id === itemId)?.quantity ?? 0;
