import type { SFSymbol } from 'sf-symbols-typescript';

import { formatMoney } from '@/lib/format';
import { METHODS, type TenderMethod } from '@/lib/payment';

export const money = (n: number) => formatMoney(n, { kopecks: 'auto' });

/** Подпись, цвет и символ способа оплаты (в том числе «Раздельная», которой нет в кассе). */
export const methodLook = (method: string): { title: string; color: string; symbol: SFSymbol } =>
  method in METHODS ? METHODS[method as TenderMethod] : { title: method === 'split' ? 'Раздельная' : method, color: '#94A3B8', symbol: 'square.split.2x1' };
