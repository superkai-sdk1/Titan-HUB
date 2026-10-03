// Фирменная тёмная палитра Titan — та же, что у My Titan и веб-киоска:
// глубокий фиолетово-чёрный фон, violet-акцент. Киоск всегда тёмный.
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
  greenDeep: '#10B981',
  greenTint: 'rgba(52,211,153,0.10)',
  red: '#F87171',
  redTint: 'rgba(248,113,113,0.10)',
  amber: '#fbbf24',
  amberDeep: '#F59E0B',
  amberTint: 'rgba(251,191,36,0.10)',
  orange: '#FB923C',
  pink: '#ec4899',
} as const;

export const violetGradient = 'linear-gradient(135deg, #8B5CF6 0%, #6d28d9 100%)';
export const brandGradient = 'linear-gradient(135deg, #8B5CF6 0%, #4cd7f6 100%)';
export const payGradient = 'linear-gradient(135deg, #10B981 0%, #4cd7f6 100%)';
export const warmGradient = 'linear-gradient(145deg, #fbbf24 0%, #F97316 100%)';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { panel: 28, card: 22, tile: 18, control: 14, pill: 999 } as const;

/** Отступ содержимого от краёв экрана планшета. */
export const GUTTER = 24;

export const type = StyleSheet.create({
  hero: { fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1, color: colors.text },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text },
  heading: { fontSize: 21, lineHeight: 27, fontWeight: '800', color: colors.text },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.textBody },
  callout: { fontSize: 14, lineHeight: 19, color: colors.textBody },
  caption: { fontSize: 13, lineHeight: 17, color: colors.textSecondary },
  overline: {
    fontSize: 12, lineHeight: 15, fontWeight: '800', letterSpacing: 1.3,
    textTransform: 'uppercase', color: colors.textSecondary,
  },
  /** Суммы: жирные, цифры одинаковой ширины. */
  amount: { fontWeight: '900', fontVariant: ['tabular-nums'], color: colors.text },
});

/** Пружины Reanimated. */
export const springs = {
  snappy: { damping: 18, stiffness: 260, mass: 0.8 },
  smooth: { damping: 22, stiffness: 180 },
  bouncy: { damping: 11, stiffness: 180 },
} as const;
