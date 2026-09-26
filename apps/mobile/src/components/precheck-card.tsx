import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlassView } from '@/components/glass';
import { Avatar } from '@/components/new-check-parts';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { Precheck } from '@/lib/pos-api';
import { colors, radius, space, type } from '@/lib/theme';

const HOLD_MS = 600;
/** Фиолетовое стекло Tai — как ИИ-карточка предчека в веб-кассе. */
const TAI_TINT = 'rgba(139,92,246,0.30)';

/**
 * Предчек Tai: игрок проголосовал «приду», чека у него ещё нет. Карточка — фиолетовое
 * интерактивное стекло; удержание открывает чек с тарифом по статусу.
 */
export function PrecheckCard({ precheck, busy, onOpen, glassKey }: { precheck: Precheck; busy: boolean; onOpen: () => void; glassKey?: number }) {
  const [holding, setHolding] = useState(false);
  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const price = toNumber(precheck.tariffPrice);

  return (
    <Pressable
      style={styles.pressable}
      disabled={busy}
      delayLongPress={HOLD_MS}
      onPressIn={() => {
        haptic.light();
        setHolding(true);
        progress.set(withTiming(1, { duration: HOLD_MS, easing: Easing.linear }));
      }}
      onPressOut={() => {
        setHolding(false);
        cancelAnimation(progress);
        progress.set(withTiming(0, { duration: 150 }));
      }}
      onLongPress={() => {
        haptic.success();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Предчек: ${precheck.nickname}, ${precheck.tariffName ?? 'тариф'}. Удерживайте, чтобы открыть чек`}>
      <GlassView isInteractive refreshKey={glassKey} glassEffectStyle="regular" tintColor={TAI_TINT} style={styles.card}>
        <View style={styles.header}>
          <Avatar name={precheck.nickname} photoUrl={precheck.photoUrl} size={34} />
          <View style={styles.titles}>
            <Text style={[type.headline, styles.label]} numberOfLines={1}>
              {precheck.nickname}
            </Text>
            <Text style={[type.footnote, styles.accent]} numberOfLines={1}>
              {precheck.vote === 'опоздаю' ? 'Опоздает' : 'Придёт'} · предчек
            </Text>
          </View>
          <SymbolView name="sparkles" size={18} tintColor={colors.accent} animationSpec={{ effect: { type: 'pulse' }, repeating: true }} />
        </View>

        <View style={styles.lines}>
          <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
            {`• ${precheck.tariffName ?? 'Без тарифа'}`}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={[type.caption1, styles.accent]}>{busy ? 'Открываем…' : 'Удерживайте'}</Text>
          <Text style={[type.title3, type.amount, styles.label]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(price)}
          </Text>
        </View>

        {(holding || busy) && <Animated.View pointerEvents="none" style={[styles.progress, progressStyle]} />}
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  card: {
    flex: 1,
    minHeight: 172,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titles: { flex: 1, gap: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  accent: { color: colors.accent, fontWeight: '600' },
  lines: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: colors.accent },
});
