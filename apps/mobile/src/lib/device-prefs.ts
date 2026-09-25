import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Настройки САМОГО устройства — не клуба и не профиля: у кассира на планшете и у
 * владельца на телефоне они разные, на сервер не уезжают.
 */

const CALENDAR_KEY = 'prefs.calendarSync';

type DevicePrefs = {
  hydrated: boolean;
  /** Класть мероприятия клуба в календарь телефона. */
  calendarSync: boolean;
  hydrate: () => Promise<void>;
  setCalendarSync: (on: boolean) => Promise<void>;
};

export const useDevicePrefs = create<DevicePrefs>((set) => ({
  hydrated: false,
  calendarSync: false,
  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(CALENDAR_KEY).catch(() => null);
    set({ calendarSync: raw === '1', hydrated: true });
  },
  setCalendarSync: async (on) => {
    set({ calendarSync: on });
    await SecureStore.setItemAsync(CALENDAR_KEY, on ? '1' : '0').catch(() => {});
  },
}));

/** Синхронизация запускается не чаще раза в пять минут: календарь — не источник правды. */
const SYNC_EVERY_MS = 5 * 60_000;
let lastSync = 0;

export const calendarSyncDue = () => Date.now() - lastSync > SYNC_EVERY_MS;
export const markCalendarSynced = () => {
  lastSync = Date.now();
};
