import { create } from 'zustand';

/**
 * Визит гостя на экране киоска:
 *   idle    — счёта нет: заставка клуба, меню для просмотра, вызов администратора;
 *   session — администратор открыл счёт зоны в кассе: счёт, заказ, чат, оплата;
 *   finish  — счёт оплачен или закрыт: «спасибо» и оценка вечера, затем снова idle.
 *
 * Сессия планшета (токен) при этом не сбрасывается: следующий гость увидит заставку,
 * а не экран входа сотрудника.
 */
export type Phase =
  | { kind: 'idle' }
  | { kind: 'session'; checkId: string }
  | { kind: 'finish'; checkId: string; paid: boolean };

type FlowState = {
  phase: Phase;
  startSession: (checkId: string) => void;
  finish: (checkId: string, paid: boolean) => void;
  toIdle: () => void;
};

export const useFlow = create<FlowState>()((set, get) => ({
  phase: { kind: 'idle' },
  startSession: (checkId) => set({ phase: { kind: 'session', checkId } }),
  finish: (checkId, paid) => {
    const cur = get().phase;
    // Уже на экране благодарности за этот чек: «оплачено» важнее «закрыт».
    if (cur.kind === 'finish' && cur.checkId === checkId) {
      if (paid && !cur.paid) set({ phase: { ...cur, paid: true } });
      return;
    }
    set({ phase: { kind: 'finish', checkId, paid } });
  },
  toIdle: () => set({ phase: { kind: 'idle' } }),
}));

/** Всплывающие подсказки гостю («Заказ подтверждён», «Администратор идёт»). */
export type ToastTone = 'success' | 'info' | 'warning' | 'error';
type Toast = { id: number; text: string; tone: ToastTone };

export const useToast = create<{ toast: Toast | null; show: (text: string, tone?: ToastTone) => void; hide: () => void }>()(
  (set) => ({
    toast: null,
    show: (text, tone = 'success') => set({ toast: { id: Date.now(), text, tone } }),
    hide: () => set({ toast: null }),
  }),
);

export const toast = (text: string, tone?: ToastTone) => useToast.getState().show(text, tone);
