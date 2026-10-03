import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { Kiosk, type Orientation } from '../../modules/titan-kiosk';

/**
 * Настройки этого планшета (меняет сотрудник в своей панели):
 * ориентация крепления, закрепление экрана, автовыключение света и климата.
 */
export type Prefs = {
  orientation: Orientation;
  /** Закреплять экран (lock task). У владельца устройства — молча при каждом запуске. */
  lockTask: boolean;
  /** После закрытия счёта гасить свет и выключать кондиционер кабинки. */
  roomAutoOff: boolean;
};

const KEY = 'titan.home.prefs';
// Ориентация по умолчанию — как повёрнут сам планшет: на больших экранах Android не
// поворачивает дисплей под приложение, а сужает его полосой (letterbox).
const DEFAULTS: Prefs = { orientation: 'auto', lockTask: true, roomAutoOff: false };

type PrefsState = Prefs & {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Prefs>) => Promise<void>;
};

export const usePrefs = create<PrefsState>()((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    let stored: Partial<Prefs> = {};
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) stored = JSON.parse(raw) as Partial<Prefs>;
    } catch {
      /* по умолчанию */
    }
    set({ ...DEFAULTS, ...stored, loaded: true });
  },
  update: async (patch) => {
    set(patch);
    const { orientation, lockTask, roomAutoOff } = { ...get(), ...patch };
    await SecureStore.setItemAsync(KEY, JSON.stringify({ orientation, lockTask, roomAutoOff })).catch(() => {});
  },
}));

/**
 * Режим окна киоска: полный экран, экран не гаснет, ориентация и — для владельца
 * устройства — молчаливое закрепление. Без владельца закрепление включает
 * сотрудник кнопкой (Android спросит подтверждение), а не каждый запуск.
 */
export async function applyKioskWindow() {
  const { orientation, lockTask } = usePrefs.getState();
  await Kiosk.setImmersive(true);
  await Kiosk.setKeepScreenOn(true);
  await Kiosk.setOrientation(orientation);
  if (lockTask && Kiosk.getStatus().isDeviceOwner) await Kiosk.startLockTask();
}
