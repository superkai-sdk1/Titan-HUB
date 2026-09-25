import { create } from 'zustand';

/** Выбранный чек в правой панели кассы на iPad; после создания чека выбираем его. */
type PosSelection = {
  selectedCheckId: string | null;
  select: (checkId: string | null) => void;
};

export const usePosSelection = create<PosSelection>()((set) => ({
  selectedCheckId: null,
  select: (checkId) => set({ selectedCheckId: checkId }),
}));
