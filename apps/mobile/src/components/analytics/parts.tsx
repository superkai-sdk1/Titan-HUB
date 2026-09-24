import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { GlassChip, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { Unavailable } from '@/components/unavailable';
import { analyticsErrorText, deltaText, PERIOD_PRESETS, useAnalyticsPeriodStore, type ResolvedPeriod } from '@/lib/analytics-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { METHODS, type TenderMethod } from '@/lib/payment';
import { colors, space, type } from '@/lib/theme';

export const money = (n: number) => formatMoney(n, { kopecks: 'auto' });

/** Подпись, цвет и символ способа оплаты (в том числе «Раздельная», которой нет в кассе). */
export const methodLook = (method: string): { title: string; color: string; symbol: SFSymbol } =>
  method in METHODS ? METHODS[method as TenderMethod] : { title: method === 'split' ? 'Раздельная' : method, color: '#94A3B8', symbol: 'square.split.2x1' };

/** Пресеты периода капсулами и «Период…» — свои даты в шторке. */
export function PeriodChips({ period }: { period: ResolvedPeriod }) {
  const router = useRouter();
  const setPreset = useAnalyticsPeriodStore((s) => s.setPreset);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
      {PERIOD_PRESETS.map((preset) => (
        <GlassChip
          key={preset.key}
          label={preset.label}
          active={period.preset === preset.key}
          onPress={() => {
            haptic.selection();
            setPreset(preset.key);
          }}
        />
      ))}
      <GlassChip
        label={period.preset === 'custom' ? period.label : 'Период…'}
        icon="calendar"
        active={period.preset === 'custom'}
        onPress={() => {
          haptic.light();
          router.push('/analytics/period');
        }}
      />
    </ScrollView>
  );
}

/** Плитка показателя: подпись, значение «прокруткой», изменение к прошлому периоду. */
export function KpiTile({
  label,
  value,
  delta,
  invertDelta,
  caption,
  icon,
  color = colors.accent,
  onPress,
}: {
  label: string;
  value: string;
  delta?: number;
  /** Для расходов рост — плохо. */
  invertDelta?: boolean;
  caption?: string;
  icon?: SFSymbol;
  color?: ColorValue;
  onPress?: () => void;
}) {
  const text = deltaText(delta);
  const good = delta !== undefined && (invertDelta ? delta < 0 : delta > 0);
  return (
    <Pressable style={styles.tileCell} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <GlassView isInteractive={!!onPress} style={styles.tile}>
        <View style={styles.tileTop}>
          {icon && <SymbolView name={icon} size={13} weight="semibold" tintColor={color} />}
          <Text style={[type.footnote, styles.secondary, styles.flex]} numberOfLines={1}>
            {label}
          </Text>
          {text && (
            <View style={[styles.delta, { backgroundColor: good ? 'rgba(52,199,89,0.16)' : 'rgba(255,59,48,0.14)' }]}>
              <Text style={[type.caption2, styles.deltaText, { color: good ? colors.green : colors.red }]}>{text}</Text>
            </View>
          )}
        </View>
        <RollingText text={value} style={[type.title3, type.amount, styles.label]} />
        {caption && (
          <Text style={[type.caption1, styles.secondary]} numberOfLines={1}>
            {caption}
          </Text>
        )}
      </GlassView>
    </Pressable>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** Рейтинг полосами: подпись, значение и доля от максимума. */
export function BarRow({ label, value, caption, share, color = colors.accent, onPress }: { label: string; value: string; caption?: string; share: number; color?: ColorValue; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.barRow, pressed && sheetStyles.pressedRow]}>
      <View style={styles.barTop}>
        <Text style={[type.subhead, styles.label, styles.flex]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[type.subhead, type.amount, styles.label]}>{value}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, Math.min(1, share) * 100)}%`, backgroundColor: color }]} />
      </View>
      {caption && <Text style={[type.caption1, styles.secondary]}>{caption}</Text>}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={[type.footnote, sheetStyles.sectionTitle]}>{children}</Text>;
}

/** Загрузка, ошибка (в том числе выключенный модуль) или содержимое. */
export function QueryState({ loading, error, children }: { loading: boolean; error: unknown; children: ReactNode }) {
  if (error) {
    return (
      <View style={styles.state}>
        <Unavailable title="Отчёт недоступен" systemImage="chart.bar.xaxis" description={analyticsErrorText(error)} />
      </View>
    );
  }
  if (loading) return <ActivityIndicator style={styles.loading} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  chips: { flexGrow: 0, flexShrink: 0, height: 44, marginHorizontal: -space.lg },
  chipsContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tileCell: { width: '48.8%', flexGrow: 1 },
  tile: { padding: space.md, gap: 4, borderRadius: 20, borderCurve: 'continuous', minHeight: 92 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  delta: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  deltaText: { fontWeight: '700' },
  barRow: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: 5 },
  barTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  state: { height: 360 },
  loading: { paddingVertical: 80 },
});
