// Android-двойник expo-glass-effect.
//
// Штатный модуль на не-Apple платформах рендерит пустой View: Liquid Glass исчезает
// вместе с фоном, и 35 карточек становятся прозрачными. Здесь стекло заменяет
// полупрозрачная серая поверхность — она одинаково работает в светлой и тёмной теме,
// а подкраску (tintColor) кладём отдельным слоем, как это делает стекло.
import type { ReactNode } from 'react';
import { View, type ColorValue, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors } from '@/lib/theme';

export type GlassViewProps = ViewProps & {
  glassEffectStyle?: 'regular' | 'clear' | 'identity';
  tintColor?: ColorValue;
  isInteractive?: boolean;
  children?: ReactNode;
};

export default function GlassView({ tintColor, glassEffectStyle, isInteractive, style, children, ...rest }: GlassViewProps) {
  return (
    <View {...rest} style={[{ backgroundColor: colors.card, overflow: 'hidden' }, style]}>
      {tintColor ? <View pointerEvents="none" style={[tintFill, { backgroundColor: tintColor }]} /> : null}
      {children}
    </View>
  );
}

export type GlassContainerProps = ViewProps & { spacing?: number; children?: ReactNode };

/** Контейнер сливающихся стёкол: на Android слияния нет, остаётся обычная группировка. */
export function GlassContainer({ spacing, style, children, ...rest }: GlassContainerProps) {
  return <View {...rest} style={[spacing != null ? { gap: spacing } : null, style]}>{children}</View>;
}

export { GlassView };

export function isLiquidGlassAvailable() {
  return false;
}

export function isGlassEffectAPIAvailable() {
  return false;
}

export type GlassColorScheme = 'light' | 'dark';
export type GlassStyle = 'regular' | 'clear' | 'identity';
export type GlassEffectStyleConfig = { style?: GlassStyle; tintColor?: ColorValue; colorScheme?: GlassColorScheme };

const tintFill: StyleProp<ViewStyle> = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
