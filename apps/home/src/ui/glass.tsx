// Стеклянные поверхности. Глубину даёт ступень заливки и светлая верхняя кромка,
// а не тень: размытых теней в приложении нет (на Adreno 610 они стоили кадров).
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { color, radius as R } from './tokens';

export type GlassKind = 'panel' | 'control' | 'raised' | 'inset' | 'overlay' | 'accent' | 'warm' | 'amber' | 'cool';

const KIND: Record<GlassKind, ViewStyle> = {
  panel: { backgroundColor: color.glassPanel, borderColor: color.border, borderTopColor: color.highlight },
  control: { backgroundColor: color.glassControl, borderColor: color.borderStrong, borderTopColor: color.highlight },
  raised: { backgroundColor: color.glassRaised, borderColor: color.borderStrong, borderTopColor: 'rgba(255,255,255,0.32)' },
  inset: { backgroundColor: color.glassInset, borderColor: 'transparent' },
  overlay: { backgroundColor: color.glassOverlay, borderColor: color.borderStrong, borderTopColor: 'rgba(255,255,255,0.30)' },
  accent: { backgroundColor: color.accentFill, borderColor: color.accentBorder, borderTopColor: 'rgba(255,255,255,0.45)' },
  warm: { backgroundColor: color.warmTint, borderColor: color.warmBorder, borderTopColor: 'rgba(255,236,200,0.55)' },
  amber: { backgroundColor: color.amberTint, borderColor: color.amberBorder },
  cool: { backgroundColor: color.glassPanel, borderColor: 'rgba(143,216,248,0.28)', borderTopColor: color.highlight },
};

export function Glass({
  kind = 'panel', radius = R.panel, style, children, ...rest
}: ViewProps & { kind?: GlassKind; radius?: number; children?: ReactNode }) {
  return (
    <View {...rest} style={[styles.base, KIND[kind], { borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

/** Стиль стекла для собственных компонентов (например, анимированных). */
export function glassStyle(kind: GlassKind, radius: number = R.panel): ViewStyle {
  return { ...styles.base, ...KIND[kind], borderRadius: radius };
}

const styles = StyleSheet.create({
  base: { borderWidth: 1 },
});
