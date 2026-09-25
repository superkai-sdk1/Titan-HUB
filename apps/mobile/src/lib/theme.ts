import { DynamicColorIOS, PlatformColor } from 'react-native';

import { accentHex } from './theme.shared';

/**
 * Оформление — системное iOS: семантические цвета подстраиваются под светлую и
 * тёмную тему, повышенный контраст и «Уменьшение прозрачности» сами. Фирменный
 * фиолетовый — только акцент. Android-двойник палитры лежит в theme.android.ts.
 */
export const colors = {
  accent: DynamicColorIOS(accentHex),
  background: PlatformColor('systemBackground'),
  groupedBackground: PlatformColor('systemGroupedBackground'),
  card: PlatformColor('secondarySystemGroupedBackground'),
  /** Непрозрачная поверхность для плашек поверх контента. */
  floating: PlatformColor('secondarySystemGroupedBackground'),
  fill: PlatformColor('tertiarySystemFill'),
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  green: PlatformColor('systemGreen'),
  orange: PlatformColor('systemOrange'),
  yellow: PlatformColor('systemYellow'),
  red: PlatformColor('systemRed'),
  blue: PlatformColor('systemBlue'),
  teal: PlatformColor('systemTeal'),
  indigo: PlatformColor('systemIndigo'),
  pink: PlatformColor('systemPink'),
  purple: PlatformColor('systemPurple'),
  mint: PlatformColor('systemMint'),
  cyan: PlatformColor('systemCyan'),
  brown: PlatformColor('systemBrown'),
  gray: PlatformColor('systemGray'),
  /** Фон шторок: iOS 26 рисует под ними Liquid Glass, поэтому контент прозрачный. */
  sheetBackground: 'transparent',
} as const;

export * from './theme.shared';
