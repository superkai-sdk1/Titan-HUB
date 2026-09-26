import type { RefObject } from 'react';
import type { View } from 'react-native';
import { create } from 'zustand';

/**
 * Цели размытия шапок Android. Размытие (expo-blur, движок Dimezis) на Android умеет
 * размывать только содержимое заранее отмеченного BlurTargetView. Фон экрана
 * (AmbientBackdrop) регистрирует себя здесь по ключу маршрута, а шапка этого экрана
 * (components/header-glass) находит по тому же ключу, что размывать.
 */
type BlurTargets = {
  targets: Record<string, RefObject<View | null>>;
  register: (key: string, ref: RefObject<View | null>) => void;
  unregister: (key: string, ref: RefObject<View | null>) => void;
};

export const useBlurTargets = create<BlurTargets>((set) => ({
  targets: {},
  register: (key, ref) => set((s) => (s.targets[key] === ref ? s : { targets: { ...s.targets, [key]: ref } })),
  unregister: (key, ref) =>
    set((s) => {
      if (s.targets[key] !== ref) return s;
      const next = { ...s.targets };
      delete next[key];
      return { targets: next };
    }),
}));
