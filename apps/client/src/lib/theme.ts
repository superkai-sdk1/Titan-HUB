// Фирменная тёмная палитра My Titan — та же, что у веб-кошелька
// (apps/wallet): глубокий фиолетово-чёрный фон, violet-акцент, голо-карта.
// Тема всегда тёмная и одинаковая на iOS и Android (решение владельца).
import { StyleSheet } from 'react-native';

export const colors = {
  background: '#15121b',
  backgroundDeep: '#0f0c14',
  surface: '#1d1a24',
  surfaceRaised: '#262130',
  surfacePressed: '#2d2738',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  borderViolet: 'rgba(139,92,246,0.28)',

  text: '#ffffff',
  textBody: '#e2e8f0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  violet: '#8B5CF6',
  violetDeep: '#6d28d9',
  violetLight: '#a78bfa',
  lavender: '#c4b5fd',
  violetTint: 'rgba(139,92,246,0.14)',

  cyan: '#4cd7f6',
  cyanTint: 'rgba(76,215,246,0.10)',
  green: '#34D399',
  greenBright: '#4ade80',
  greenTint: 'rgba(52,211,153,0.10)',
  red: '#F87171',
  redTint: 'rgba(248,113,113,0.10)',
  amber: '#fbbf24',
  amberTint: 'rgba(251,191,36,0.10)',
  pink: '#ec4899',
  telegram: '#2AABEE',
} as const;

/** Голографический градиент карты клуба (как в вебе). */
export const holoGradient =
  'linear-gradient(115deg, #6d28d9 0%, #4cd7f6 18%, #ec4899 36%, #f59e0b 52%, #8B5CF6 68%, #4cd7f6 84%, #6d28d9 100%)';
export const violetGradient = 'linear-gradient(135deg, #8B5CF6 0%, #6d28d9 100%)';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { card: 22, tile: 18, control: 14, pill: 999 } as const;

/** Отступ по бокам экрана и ширина колонки на планшетах. */
export const GUTTER = 16;
export const MAX_WIDTH = 560;

export const type = StyleSheet.create({
  display: { fontSize: 34, lineHeight: 40, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, color: colors.text },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.text },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.text },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.textBody },
  callout: { fontSize: 14, lineHeight: 19, color: colors.textBody },
  caption: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  overline: {
    fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase', color: colors.textSecondary,
  },
  /** Суммы: жирный курсив, цифры одинаковой ширины (как в веб-кошельке). */
  amount: { fontWeight: '800', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
});

/** Пружины Reanimated для анимаций внутри экранов. */
export const springs = {
  snappy: { damping: 18, stiffness: 260, mass: 0.8 },
  smooth: { damping: 22, stiffness: 180 },
  bouncy: { damping: 11, stiffness: 180 },
} as const;
