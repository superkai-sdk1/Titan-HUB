import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureDetector, type ComposedGesture, type GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/glass';
import { Text } from '@/components/text';
import { plural } from '@/lib/format';
import { useHa, type HaStatus } from '@/lib/home-assistant';
import { homeSummary, type HomeSummary } from '@/lib/home-control';
import type { Zone } from '@/lib/smart-home-api';
import { colors, type } from '@/lib/theme';

import { IS_IOS } from './home-surface';

/**
 * Край шторки «Свет и климат» — то, что видно от поднятой шторки: тонкая полоса под строкой
 * состояния во всю ширину, низ скруглён, как подол. Посередине ручка, рядом — что горит.
 * Полоса лежит поверх кассы и места в раскладке не занимает: касса сдвигает шапку только на
 * видимую часть подола (HEM_SPACE).
 *
 * iOS — Liquid Glass, Android — плотная поверхность с тенью (как панель самой шторки).
 */

/** Сколько подола видно под строкой состояния. */
export const HEM_SPACE = 16;
/** Скругление низа подола — у раскрытой шторки на Android такое же, она продолжает край. */
export const HEM_RADIUS = 28;
/** Касание чуть ниже подола тоже берёт шторку: полоса тонкая. */
const HEM_TOUCH_EXTRA = 8;
/** Насколько край уезжает вниз за пальцем, пока гаснет. */
const HEM_FOLLOW = 16;
/** Потолок роста цифр: им некуда расти в полосе высотой 16 pt. */
const COUNT_MAX_SCALE = 1.2;

type HemProps = {
  zones: Zone[];
  /** Ширина полосы: экран или колонка сетки на iPad. */
  width: number;
  progress: SharedValue<number>;
  gesture: GestureType | ComposedGesture;
  /** Ключ повторного применения стекла (после зум-перехода и после закрытия шторки). */
  glassKey: string;
  onOpen: () => void;
};

export function Hem({ zones, width, progress, gesture, glassKey, onOpen }: HemProps) {
  const insets = useSafeAreaInsets();
  const status = useHa((s) => s.status);
  const entities = useHa((s) => s.entities);
  const summary = homeSummary(zones, entities);
  const connecting = status === 'connecting' && Object.keys(entities).length === 0;

  // Потянули — край уходит за пальцем и гаснет: дальше его продолжает сама шторка.
  const hemStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.get() * 3),
    transform: [{ translateY: progress.get() * HEM_FOLLOW }],
  }));

  // Полоса уходит под строку состояния и выше экрана на радиус: верхние углы не видны.
  const stripHeight = insets.top + HEM_SPACE + HEM_RADIUS;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.hit, { width, height: insets.top + HEM_SPACE + HEM_TOUCH_EXTRA }, hemStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Свет и климат"
        accessibilityValue={{ text: describe(status, connecting, summary) }}
        accessibilityHint="Открывает управление светом и кондиционерами"
        onAccessibilityTap={onOpen}>
        {IS_IOS ? (
          <GlassView glassEffectStyle="regular" refreshKey={glassKey} style={[styles.strip, { height: stripHeight }]} />
        ) : (
          <View style={[styles.strip, styles.stripAndroid, { height: stripHeight }]} />
        )}
        <View style={[styles.edge, { top: insets.top }]}>
          <View style={styles.grabber} />
          <View style={styles.status}>
            <HemStatus status={status} connecting={connecting} summary={summary} />
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Значки рядом с ручкой: горящий свет и кондиционеры с числом, нет связи, подключение. */
function HemStatus({ status, connecting, summary }: { status: HaStatus; connecting: boolean; summary: HomeSummary }) {
  if (connecting) return <ActivityIndicator size="small" color={colors.secondaryLabel} style={styles.spinner} />;
  if (status === 'offline' || status === 'auth_failed') return <SymbolView name="wifi.slash" size={11} weight="semibold" tintColor={colors.orange} />;
  if (!summary.anyOn) return null;
  return (
    <>
      {summary.lightsOn > 0 && (
        <View style={styles.stat}>
          <SymbolView name="lightbulb.fill" size={11} tintColor={colors.yellow} />
          <Text style={[type.caption2, styles.count]} maxFontSizeMultiplier={COUNT_MAX_SCALE}>
            {summary.lightsOn}
          </Text>
        </View>
      )}
      {summary.climatesOn > 0 && (
        <View style={styles.stat}>
          <SymbolView name="snowflake" size={11} weight="semibold" tintColor={colors.cyan} />
          <Text style={[type.caption2, styles.count]} maxFontSizeMultiplier={COUNT_MAX_SCALE}>
            {summary.climatesOn}
          </Text>
        </View>
      )}
    </>
  );
}

function describe(status: HaStatus, connecting: boolean, summary: HomeSummary): string {
  if (connecting) return 'Подключаемся';
  if (status === 'offline' || status === 'auth_failed') return 'Дом не на связи';
  if (!summary.anyOn) return 'Всё выключено';
  const parts: string[] = [];
  if (summary.lightsOn > 0) parts.push(`${summary.lightsOn} ${plural(summary.lightsOn, ['лампа горит', 'лампы горят', 'ламп горят'])}`);
  if (summary.climatesOn > 0) {
    parts.push(`${summary.climatesOn} ${plural(summary.climatesOn, ['кондиционер включён', 'кондиционера включены', 'кондиционеров включены'])}`);
  }
  return parts.join(', ');
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', top: 0, left: 0, zIndex: 20 },
  strip: { position: 'absolute', top: -HEM_RADIUS, left: 0, right: 0, borderRadius: HEM_RADIUS, borderCurve: 'continuous', overflow: 'hidden' },
  stripAndroid: { backgroundColor: colors.floating, elevation: 4 },
  edge: { position: 'absolute', left: 0, right: 0, height: HEM_SPACE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: colors.tertiaryLabel },
  // Значки — справа от ручки, а сама ручка остаётся строго по центру.
  status: { position: 'absolute', left: '50%', marginLeft: 18 + 8, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { color: colors.label, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spinner: { transform: [{ scale: 0.6 }] },
});
