import { PlatformColor } from 'react-native';

/**
 * Android-двойник палитры из theme.ts.
 *
 * Цвета лежат в ресурсах (plugins/with-android-colors.js) с ночным вариантом:
 * Android выбирает их по конфигурации устройства, поэтому они совпадают с тем,
 * что видит useColorScheme() в JS. Атрибуты темы (?android:attr/textColorPrimary)
 * для этого НЕ годятся — тема Activity остаётся светлой даже в тёмной системе,
 * и подписи выходят тёмными на тёмном фоне.
 * Семантических системных цветов (systemRed и прочих) в Android нет — берём палитру iOS.
 */
export const colors = {
  // Один тон вместо DynamicColorIOS: читается и на светлом, и на тёмном фоне.
  // Где нужен точный тон под тему — экраны берут useAccentHex().
  accent: '#8B5CF6',
  background: PlatformColor('@color/titan_background'),
  groupedBackground: PlatformColor('@color/titan_grouped_background'),
  card: PlatformColor('@color/titan_card'),
  /** Непрозрачная поверхность для плашек поверх контента. */
  floating: PlatformColor('@color/titan_floating'),
  fill: PlatformColor('@color/titan_fill'),
  label: PlatformColor('@color/titan_label'),
  secondaryLabel: PlatformColor('@color/titan_secondary_label'),
  tertiaryLabel: PlatformColor('@color/titan_tertiary_label'),
  separator: PlatformColor('@color/titan_separator'),
  green: '#34C759',
  orange: '#FF9500',
  yellow: '#FFCC00',
  red: '#FF3B30',
  blue: '#007AFF',
  teal: '#30B0C7',
  indigo: '#5856D6',
  pink: '#FF2D55',
  purple: '#AF52DE',
  mint: '#00C7BE',
  cyan: '#32ADE6',
  brown: '#A2845E',
  gray: '#8E8E93',
  /** Под шторкой на Android ничего не рисуется — без фона окно выглядит пустым. */
  sheetBackground: PlatformColor('@color/titan_grouped_background'),
} as const;

export * from './theme.shared';
