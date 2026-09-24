// Часть оформления, одинаковая на всех платформах: типографика, отступы, радиусы, пружины.
// Цвета лежат в theme.ts (iOS) и theme.android.ts — там они завязаны на системные палитры.
import { StyleSheet, useColorScheme } from 'react-native';

export const accentHex = { light: '#7C3AED', dark: '#A78BFA' } as const;

/** Hex-акцент для мест, где нужен цвет-строка (SwiftUI-хосты, тема навигации). */
export function useAccentHex(): string {
  return useColorScheme() === 'dark' ? accentHex.dark : accentHex.light;
}

/** Системные стили текста iOS (Large Title 34 … Caption 2 11). */
export const type = StyleSheet.create({
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption1: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },
  /** Суммы: скруглённый SF Pro с цифрами одинаковой ширины. */
  amount: { fontFamily: 'ui-rounded', fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { card: 22, control: 14, small: 8 } as const;

/**
 * Пружины в духе SwiftUI для анимаций внутри экранов (Reanimated `withSpring`).
 * Переходы между экранами, шторки и меню анимирует система.
 */
export const springs = {
  smooth: { duration: 400, dampingRatio: 1 },
  snappy: { duration: 300, dampingRatio: 0.85 },
  bouncy: { duration: 450, dampingRatio: 0.7 },
} as const;
