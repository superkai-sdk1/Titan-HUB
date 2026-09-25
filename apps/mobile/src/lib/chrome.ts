import { create } from 'zustand';

/** Состояние «хрома» приложения: плашка смены над таб-баром прячется при прокрутке вниз. */
type ChromeState = {
  accessoryVisible: boolean;
  setAccessoryVisible: (visible: boolean) => void;
};

export const useChrome = create<ChromeState>()((set, get) => ({
  accessoryVisible: true,
  setAccessoryVisible: (visible) => {
    if (get().accessoryVisible !== visible) set({ accessoryVisible: visible });
  },
}));

/**
 * Обработчик прокрутки: вниз — плашка уходит, вверх или у самого верха — возвращается.
 * Порог гасит дрожание на мелких движениях пальца.
 */
export function createAccessoryScrollHandler() {
  let lastY = 0;
  return (y: number) => {
    const { setAccessoryVisible } = useChrome.getState();
    if (y <= 24) {
      setAccessoryVisible(true);
    } else if (y - lastY > 12) {
      setAccessoryVisible(false);
    } else if (lastY - y > 12) {
      setAccessoryVisible(true);
    }
    if (Math.abs(y - lastY) > 12 || y <= 24) lastY = y;
  };
}
