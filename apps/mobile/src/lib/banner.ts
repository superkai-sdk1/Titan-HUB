import { create } from 'zustand';

export type Banner = {
  key: string;
  type: string;
  title: string;
  body: string;
  checkId?: string;
};

type BannerState = {
  current: Banner | null;
  recent: Record<string, number>;
  show: (banner: Banner) => void;
  hide: () => void;
};

/** Одно и то же событие может прийти из двух потоков — не показываем его дважды за 15 секунд. */
const DEDUPE_MS = 15_000;

export const useBanner = create<BannerState>()((set, get) => ({
  current: null,
  recent: {},
  show: (banner) => {
    const now = Date.now();
    const dedupeKey = `${banner.type}:${banner.checkId ?? banner.key}`;
    const last = get().recent[dedupeKey];
    if (last && now - last < DEDUPE_MS) return;
    const recent = Object.fromEntries(Object.entries(get().recent).filter(([, t]) => now - t < DEDUPE_MS));
    set({ current: banner, recent: { ...recent, [dedupeKey]: now } });
  },
  hide: () => set({ current: null }),
}));
