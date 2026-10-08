import { create } from 'zustand';

import { BIG_UNIT, numberText, parseDecimal, reorderQuantity, type GoodsItem, type Unit } from './goods-api';

/**
 * Состав открытого документа — прихода, списания или техкарты. Редактор и шторка выбора
 * позиций («Добавить») работают с одним списком строк, поэтому выбор не передаётся через
 * параметры маршрута. Одновременно открыт один редактор: `start` начинает новый состав.
 *
 * Строка хранит поля так, как их набирают. В приходе количество и цена — в крупной единице
 * (кг, л, шт: «2 кг по 1 850 ₽»), в списании и составе — в базовой (г, мл, шт: «18 г»).
 */

export type DraftMode = 'supply' | 'write_off' | 'recipe';

export type DraftLine = {
  key: string;
  /** null — затрата без карточки товара (только в приходе). */
  itemId: string | null;
  name: string;
  unit: Unit;
  qty: string;
  /** Только приход: цена за крупную единицу. */
  price: string;
  /** Растёт, когда значение подставлено извне, — поле ввода пересоздаётся. */
  version: number;
};

type DraftState = {
  mode: DraftMode | null;
  /** Позиция, чей состав правим, — саму её в состав не добавить. */
  productId: string | null;
  lines: DraftLine[];
  /** Растёт при каждой правке: по нему редактор сохраняет черновик. */
  revision: number;
  start: (mode: DraftMode, lines: DraftLine[], productId?: string | null) => void;
  addItems: (items: GoodsItem[]) => void;
  addFree: (name: string) => void;
  setText: (key: string, field: 'qty' | 'price' | 'name', text: string) => void;
  remove: (key: string) => void;
};

let seq = 0;
export const newLineKey = () => `line-${++seq}`;

/** Начальные значения строки при добавлении: дозаказ до целевого уровня, цена по средней. */
function defaults(mode: DraftMode, item: GoodsItem): { qty: string; price: string } {
  if (mode === 'supply') {
    const factor = BIG_UNIT[item.unit].factor;
    const need = reorderQuantity(item);
    return {
      qty: need > 0 ? numberText(need / factor) : '',
      price: item.costPrice > 0 ? numberText(Math.round(item.costPrice * factor * 100) / 100, 2) : '',
    };
  }
  return { qty: item.unit === 'pcs' ? '1' : '', price: '' };
}

export const useDocDraft = create<DraftState>((set, get) => ({
  mode: null,
  productId: null,
  lines: [],
  revision: 0,
  start: (mode, lines, productId = null) => set({ mode, lines, productId, revision: 0 }),
  addItems: (items) => {
    const { mode, lines, productId } = get();
    if (!mode) return;
    const present = new Set(lines.map((l) => l.itemId));
    const fresh = items
      .filter((item) => !present.has(item.id) && item.id !== productId)
      .map((item): DraftLine => ({ key: newLineKey(), itemId: item.id, name: item.name, unit: item.unit, version: 0, ...defaults(mode, item) }));
    if (fresh.length) set({ lines: [...lines, ...fresh], revision: get().revision + 1 });
  },
  addFree: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      lines: [...get().lines, { key: newLineKey(), itemId: null, name: trimmed, unit: 'pcs', qty: '1', price: '', version: 0 }],
      revision: get().revision + 1,
    });
  },
  setText: (key, field, text) => set({ lines: get().lines.map((l) => (l.key === key ? { ...l, [field]: text } : l)), revision: get().revision + 1 }),
  remove: (key) => set({ lines: get().lines.filter((l) => l.key !== key), revision: get().revision + 1 }),
}));

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Строка прихода в единицах сервера: целое в базовой единице и цена за неё. */
export function supplyValues(line: DraftLine) {
  const factor = line.itemId ? BIG_UNIT[line.unit].factor : 1;
  const qty = parseDecimal(line.qty) ?? 0;
  const price = parseDecimal(line.price) ?? 0;
  const quantity = line.itemId ? Math.round(qty * factor) : qty;
  const error = !line.name.trim() ? 'Укажите название' : quantity <= 0 ? 'Укажите количество' : null;
  return { quantity, costPerUnit: round4(price / factor), sum: round2(qty * price), error };
}

/** Количество строки списания или состава — целое в базовой единице. */
export function baseQuantity(line: DraftLine): number {
  return Math.round(parseDecimal(line.qty) ?? 0);
}

/** Строки из сохранённого документа: количество в базовой единице → текст поля. */
export function draftLineOf(
  mode: DraftMode,
  item: Pick<GoodsItem, 'id' | 'name' | 'unit'> | null,
  saved: { itemId?: string | null; name?: string; quantity: number; costPerUnit?: number },
): DraftLine {
  const unit = item?.unit ?? 'pcs';
  const factor = mode === 'supply' && saved.itemId ? BIG_UNIT[unit].factor : 1;
  return {
    key: newLineKey(),
    itemId: saved.itemId ?? null,
    name: item?.name ?? saved.name ?? '—',
    unit,
    qty: saved.quantity > 0 ? numberText(saved.quantity / factor) : '',
    price: mode === 'supply' && saved.costPerUnit ? numberText(round2(saved.costPerUnit * factor), 2) : '',
    version: 0,
  };
}
