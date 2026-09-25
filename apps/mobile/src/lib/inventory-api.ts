import { useQuery } from '@tanstack/react-query';
import type { SFSymbol } from 'sf-symbols-typescript';

import { api } from './api';
import { parsePgTimestamp } from './events-api';
import type { MenuCategory } from './pos-api';
import { queryClient } from './query';
import { useClubKey } from './queries';
import { useSession } from './session';
import type { NumericString } from './types';

/**
 * «Склад»: остатки позиций меню, журнал движений, списания, поставки, ревизии и расходы клуба.
 * Контракт — mobile-api-manage-inventory-salary.md. Главные правила:
 * - при отрицательном остатке относительные операции обнуляют его и пишут «+» — сводить минус
 *   ревизией или установкой абсолютного остатка;
 * - списание, ревизия и относительная корректировка не идемпотентны — без автоповторов;
 * - `null` в необязательных полях тела сервер отклоняет — такие ключи опускаем.
 */

const host = () => useSession.getState().club?.host ?? 'none';

/* ─────────────────────────── Модели ─────────────────────────── */

export type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  price: NumericString;
  costPrice: NumericString | null;
  /** Целые штуки; может быть < 0 после продаж «в минус». */
  stockQuantity: number;
  minThreshold: number | null;
  reorderPoint: number | null;
  parLevel: number | null;
  trackStock: boolean;
  isService: boolean;
  isActive: boolean;
  searchTags: string[] | null;
  linkedSpaceId: string | null;
  sortOrder: number;
};

export type InventoryOverview = {
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  deadStockCount: number;
  trackedCount: number;
  /** Текст Postgres, учитывает и черновики. */
  lastSupplyAt: string | null;
  lastRevisionAt: string | null;
};

export type MovementType = 'opening' | 'receipt' | 'sale' | 'return' | 'adjustment' | 'write_off' | 'count' | 'transfer';

export type StockMovement = {
  id: string;
  type: MovementType;
  /** Фактически применённая дельта. */
  delta: number;
  qtyAfter: number;
  unitCost: NumericString | null;
  sourceType: 'check' | 'refund' | 'supply' | 'revision' | 'manual' | null;
  sourceId: string | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
  author: string | null;
};

export type ItemStats = {
  item: { id: string; name: string; stockQuantity: number; costPrice: number; price: number; minThreshold: number; trackStock: boolean };
  lastSupply: { date: string; quantity: number; costPerUnit: number } | null;
  sales: { totalQty: number; totalRevenue: number; avgDaily: number; allTimeQty: number; series: { date: string; qty: number }[] };
};

export type SupplyLine = { itemId: string | null; name: string; unit: string; quantity: number; costPerUnit: number };

export type SupplyDraftData = {
  note?: string;
  supplier?: string;
  items: { itemId?: string; name?: string; unit: string; quantity: number; costPerUnit: number }[];
};

export type SupplyListItem = {
  id: string;
  status: 'posted' | 'draft';
  draftData: SupplyDraftData | null;
  note: string | null;
  supplier: string | null;
  totalCost: NumericString;
  createdAt: string;
  date: string;
  items: SupplyLine[];
};

export type SupplyCorrection = { id: string; reason: string; totalBefore: number; totalAfter: number; createdAt: string };

export type SupplyDetail = {
  supply: Omit<SupplyListItem, 'items'>;
  items: SupplyLine[];
  corrections: SupplyCorrection[];
};

export type RevisionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string | null;
  status: 'applied' | 'draft';
  author: string | null;
  positions: number;
  surplusValue: number;
  shortageValue: number;
};

export type RevisionItem = { id: string; itemId: string; name: string; expected: number; actual: number; costPrice: NumericString; sortOrder: number };

export type RevisionDetail = {
  revision: {
    id: string;
    status: 'applied' | 'draft';
    draftData: { items: { itemId: string; actual: number | null }[] } | null;
    createdAt: string;
    updatedAt: string | null;
    author: string | null;
    isLatest: boolean;
  };
  items: RevisionItem[];
};

export type ExpenseCategory = 'rent' | 'utilities' | 'supplies' | 'salary' | 'marketing' | 'equipment' | 'other' | 'consumables' | 'tobacco';

export type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: NumericString;
  description: string | null;
  unitPrice: NumericString | null;
  quantity: NumericString | null;
  /** YYYY-MM-DD. */
  expenseDate: string;
  /** Расход мероприятия (миникапа) — правится только из мероприятия. */
  eventId: string | null;
  createdAt: string;
};

export type StaffCostRow = {
  staffId: string;
  nickname: string;
  role: string | null;
  salary: number;
  salaryCash: number;
  salaryTransfer: number;
  salaryCount: number;
  compCost: number;
  compRetail: number;
  compChecks: number;
  total: number;
  photoUrl: string | null;
};

export type ExpensesSummary = {
  period: { from: string; to: string };
  categories: { category: ExpenseCategory; amount: number }[];
  opexTotal: number;
  salary: { total: number; cash: number; transfer: number };
  staffComp: { cost: number; retail: number; checksCount: number };
  byStaff: StaffCostRow[];
  pnlTotal: number;
  staffTotal: number;
  expenses: ExpenseRow[];
};

export type ExpenseCatalogItem = { name: string; unitPrice: number | null; category: ExpenseCategory };

/* ─────────────────────────── Представление ─────────────────────────── */

export const MOVEMENT_LOOK: Record<MovementType, { label: string; symbol: SFSymbol; color: string }> = {
  opening: { label: 'Открытие', symbol: 'flag', color: '#94A3B8' },
  receipt: { label: 'Приход', symbol: 'shippingbox.fill', color: '#10B981' },
  sale: { label: 'Продажа', symbol: 'cart.fill', color: '#3B82F6' },
  return: { label: 'Возврат', symbol: 'arrow.uturn.backward', color: '#06B6D4' },
  adjustment: { label: 'Корректировка', symbol: 'slider.horizontal.3', color: '#8B5CF6' },
  write_off: { label: 'Списание', symbol: 'trash.fill', color: '#F43F5E' },
  count: { label: 'Ревизия', symbol: 'checklist', color: '#F59E0B' },
  transfer: { label: 'Перемещение', symbol: 'arrow.left.arrow.right', color: '#64748B' },
};

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; symbol: SFSymbol; color: string }> = {
  rent: { label: 'Аренда', symbol: 'building.2.fill', color: '#8B5CF6' },
  utilities: { label: 'Коммунальные', symbol: 'bolt.fill', color: '#F59E0B' },
  supplies: { label: 'Закупки', symbol: 'shippingbox.fill', color: '#10B981' },
  consumables: { label: 'Расходники', symbol: 'drop.fill', color: '#06B6D4' },
  tobacco: { label: 'Табак', symbol: 'smoke.fill', color: '#A16207' },
  salary: { label: 'Зарплата', symbol: 'person.crop.circle.badge.checkmark', color: '#3B82F6' },
  marketing: { label: 'Маркетинг', symbol: 'megaphone.fill', color: '#EC4899' },
  equipment: { label: 'Оборудование', symbol: 'wrench.and.screwdriver.fill', color: '#64748B' },
  other: { label: 'Прочее', symbol: 'ellipsis.circle.fill', color: '#94A3B8' },
};

/** Категории, которые можно выбрать для нового расхода: зарплата живёт в своём разделе. */
export const EXPENSE_CATEGORY_CHOICES: ExpenseCategory[] = ['rent', 'utilities', 'supplies', 'consumables', 'tobacco', 'marketing', 'equipment', 'other'];

export type StockLevel = 'out' | 'low' | 'norm' | 'ok' | 'untracked';

export const STOCK_LOOK: Record<StockLevel, { label: string; color: string }> = {
  out: { label: 'Нет', color: '#F43F5E' },
  low: { label: 'Мало', color: '#F97316' },
  norm: { label: 'Норм', color: '#EAB308' },
  ok: { label: 'Ок', color: '#10B981' },
  untracked: { label: 'Без учёта', color: '#94A3B8' },
};

export const thresholdOf = (item: Pick<InventoryItem, 'reorderPoint' | 'minThreshold'>) => item.reorderPoint ?? item.minThreshold ?? 0;

export function stockLevel(item: Pick<InventoryItem, 'trackStock' | 'stockQuantity' | 'reorderPoint' | 'minThreshold'>): StockLevel {
  if (!item.trackStock) return 'untracked';
  if (item.stockQuantity <= 0) return 'out';
  const threshold = thresholdOf(item);
  if (threshold > 0 && item.stockQuantity <= threshold) return 'low';
  if (threshold > 0 && item.stockQuantity <= threshold * 2) return 'norm';
  return 'ok';
}

/** Физические товары, как на веб-складе: без услуг, аренды зон и тарифов. */
export function isPhysical(item: InventoryItem, categories: MenuCategory[] | undefined): boolean {
  if (item.isService || item.linkedSpaceId) return false;
  const category = item.category ? categories?.find((c) => c.id === item.category) : undefined;
  const name = category?.name.toLowerCase() ?? '';
  return !name.includes('тариф') && !name.includes('аренд');
}

/** Дата из сырого SQL склада («2026-09-17 09:12:34+00») или ISO. */
export function parseStockDate(value: string | null): Date | null {
  if (!value) return null;
  const date = value.includes('T') ? new Date(value) : parsePgTimestamp(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ─────────────────────────── Запросы ─────────────────────────── */

export function useInventory() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'items'],
    queryFn: () => api.get<{ items: InventoryItem[] }>('/inventory').then((r) => r.items),
    staleTime: 15_000,
  });
}

export function useMenuCategories() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'menu', 'categories'],
    queryFn: () => api.get<{ categories: MenuCategory[] }>('/menu/categories').then((r) => r.categories),
    staleTime: 10 * 60_000,
  });
}

export function useInventoryOverview() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'overview'],
    queryFn: () => api.get<InventoryOverview>('/inventory/overview'),
    staleTime: 15_000,
  });
}

export function useItemStats(itemId: string) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'item', itemId, 'stats'],
    queryFn: () => api.get<ItemStats>(`/inventory/${itemId}/stats`),
    staleTime: 15_000,
  });
}

export function useItemMovements(itemId: string) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'item', itemId, 'movements'],
    queryFn: () => api.get<{ movements: StockMovement[] }>(`/inventory/${itemId}/movements`).then((r) => r.movements),
    staleTime: 15_000,
  });
}

export function useSupplies() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'supplies'],
    // Черновики сервер не закрепляет — поднимаем их наверх сами.
    queryFn: () =>
      api
        .get<{ supplies: SupplyListItem[] }>('/supplies')
        .then((r) => [...r.supplies].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'draft' ? -1 : 1))),
    staleTime: 15_000,
  });
}

export function useSupply(supplyId: string | undefined) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'supply', supplyId],
    queryFn: () => api.get<SupplyDetail>(`/supplies/${supplyId}`),
    enabled: !!supplyId,
    staleTime: 15_000,
  });
}

export function useRevisions() {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'revisions'],
    queryFn: () =>
      api
        .get<{ revisions: RevisionSummary[] }>('/inventory/revisions')
        .then((r) => [...r.revisions].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'draft' ? -1 : 1))),
    staleTime: 15_000,
  });
}

export function useRevision(revisionId: string | undefined) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'revision', revisionId],
    queryFn: () => api.get<RevisionDetail>(`/inventory/revisions/${revisionId}`),
    enabled: !!revisionId,
    staleTime: 10_000,
  });
}

export function useExpensesSummary(from: string, to: string) {
  const club = useClubKey();
  return useQuery({
    queryKey: [club, 'inventory', 'expenses', from, to],
    queryFn: () => api.get<ExpensesSummary>(`/expenses/summary?from=${from}&to=${to}`),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useExpenseCatalog(query: string) {
  const club = useClubKey();
  const q = query.trim();
  return useQuery({
    queryKey: [club, 'inventory', 'expense-catalog', q],
    queryFn: ({ signal }) => api.get<{ items: ExpenseCatalogItem[] }>(`/expenses/catalog?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.items),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

/* ─────────────────────────── Изменения ─────────────────────────── */

function refreshInventory(itemId?: string) {
  const club = host();
  void queryClient.invalidateQueries({ queryKey: [club, 'inventory'] });
  void queryClient.invalidateQueries({ queryKey: [club, 'menu'] });
  if (itemId) void queryClient.invalidateQueries({ queryKey: [club, 'inventory', 'item', itemId] });
}

/** Относительная корректировка (не идемпотентна) или установка точного остатка (идемпотентна). */
export async function adjustStock(itemId: string, change: { delta: number } | { absolute: number }, reason: string): Promise<InventoryItem> {
  const body = 'delta' in change ? { adjustDelta: change.delta, reason } : { stockQuantity: change.absolute, reason };
  const { item } = await api.patch<{ item: InventoryItem }>(`/inventory/${itemId}`, body);
  refreshInventory(itemId);
  return item;
}

/** Точка заказа пишется и в `minThreshold` — по нему сервер шлёт push «мало». */
export async function setReplenishment(itemId: string, reorderPoint: number | null, parLevel: number | null): Promise<void> {
  await api.patch(`/inventory/${itemId}`, { reorderPoint, minThreshold: reorderPoint ?? 0, parLevel });
  refreshInventory(itemId);
}

export async function writeOff(itemId: string, quantity: number, reason: string): Promise<{ qtyAfter: number; applied: number }> {
  try {
    return await api.post<{ qtyAfter: number; applied: number }>(`/inventory/${itemId}/write-off`, { quantity, reason });
  } finally {
    refreshInventory(itemId);
  }
}

export async function fetchLastSupplyPrice(itemId: string): Promise<number | null> {
  try {
    return (await api.get<{ lastPrice: number | null }>(`/supplies/items/${itemId}/last-price`)).lastPrice;
  } catch {
    return null;
  }
}

export type SupplyLineInput = { itemId: string | null; name: string; quantity: number; costPerUnit: number };

/** Строка тела поставки: пустые ключи опускаем — `null` сервер не принимает. */
const lineBody = (line: SupplyLineInput) => ({
  ...(line.itemId ? { itemId: line.itemId } : {}),
  ...(line.name.trim() ? { name: line.name.trim() } : {}),
  unit: 'шт',
  quantity: line.quantity,
  costPerUnit: line.costPerUnit,
});

export async function createSupply(lines: SupplyLineInput[], idempotencyKey: string): Promise<{ duplicate: boolean }> {
  try {
    const r = await api.post<{ duplicate?: boolean }>('/supplies', { items: lines.map(lineBody), idempotencyKey });
    return { duplicate: !!r.duplicate };
  } finally {
    refreshInventory();
  }
}

export async function saveSupplyDraft(draftId: string | undefined, lines: SupplyLineInput[]): Promise<string> {
  const r = await api.post<{ id: string }>('/supplies/draft', { ...(draftId ? { id: draftId } : {}), items: lines.map(lineBody) });
  refreshInventory();
  return r.id;
}

export async function applySupplyDraft(draftId: string, lines: SupplyLineInput[]): Promise<void> {
  try {
    await api.post(`/supplies/${draftId}/apply`, { items: lines.map(lineBody) });
  } finally {
    refreshInventory();
  }
}

/** Только для проведённой поставки: черновик правится через draft/apply, иначе приход задвоится. */
export async function correctSupply(supplyId: string, lines: SupplyLineInput[], reason: string): Promise<void> {
  try {
    await api.patch(`/supplies/${supplyId}`, { items: lines.map(lineBody), reason });
  } finally {
    refreshInventory();
  }
}

export async function deleteSupply(supplyId: string): Promise<void> {
  await api.delete(`/supplies/${supplyId}`);
  const club = host();
  queryClient.removeQueries({ queryKey: [club, 'inventory', 'supply', supplyId] });
  refreshInventory();
}

export type RevisionLineInput = { itemId: string; actual: number | null };

export async function applyRevision(draftId: string | undefined, lines: RevisionLineInput[]): Promise<string> {
  const items = lines.filter((l) => l.actual !== null).map((l) => ({ itemId: l.itemId, actual: l.actual as number }));
  try {
    if (draftId) {
      await api.post(`/inventory/revisions/${draftId}/apply`, { items });
      return draftId;
    }
    const { revision } = await api.post<{ revision: { id: string } }>('/inventory/revisions', { items });
    return revision.id;
  } finally {
    refreshInventory();
  }
}

export async function saveRevisionDraft(draftId: string | undefined, lines: RevisionLineInput[]): Promise<string> {
  const r = await api.post<{ id: string }>('/inventory/revisions/draft', { ...(draftId ? { id: draftId } : {}), items: lines });
  refreshInventory();
  return r.id;
}

export async function correctRevision(
  revisionId: string,
  items: { id: string; actual: number }[],
): Promise<{ name: string; from: number; to: number; stockDelta: number }[]> {
  try {
    return (await api.patch<{ changes: { name: string; from: number; to: number; stockDelta: number }[] }>(`/inventory/revisions/${revisionId}`, { items })).changes;
  } finally {
    refreshInventory();
  }
}

export async function deleteRevisionDraft(revisionId: string): Promise<void> {
  await api.delete(`/inventory/revisions/${revisionId}`);
  refreshInventory();
}

export type ExpenseLineInput = { category: ExpenseCategory; description: string; unitPrice: number; quantity: number };

export async function createExpenses(expenseDate: string, lines: ExpenseLineInput[], idempotencyKey: string): Promise<void> {
  const items = lines
    .map((l) => ({
      category: l.category,
      ...(l.description.trim() ? { description: l.description.trim() } : {}),
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      amount: round2(l.unitPrice * l.quantity),
    }))
    .filter((l) => l.amount > 0);
  try {
    await api.post('/expenses', { expenseDate, items, idempotencyKey });
  } finally {
    refreshInventory();
  }
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await api.delete(`/expenses/${expenseId}`);
  refreshInventory();
}
