import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GlassView } from '@/components/glass';
import { haptic } from '@/lib/haptics';
import { colors, springs } from '@/lib/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const;
export type PinKey = (typeof KEYS)[number];

const KEY_SIZE = 78;

/** Точки PIN: заполняются пружиной, при ошибке экран встряхивается. */
export function PinDots({ length, filled, shakeKey }: { length: number; filled: number; shakeKey: number }) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (shakeKey === 0) return;
    offset.value = withSequence(
      withTiming(-14, { duration: 50 }),
      withTiming(12, { duration: 70 }),
      withTiming(-8, { duration: 70 }),
      withTiming(5, { duration: 60 }),
      withSpring(0, springs.snappy),
    );
  }, [shakeKey, offset]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <Animated.View style={[styles.dots, shake]} accessibilityLabel={`Введено цифр: ${filled} из ${length}`}>
      {Array.from({ length }, (_, i) => (
        <Dot key={i} active={i < filled} />
      ))}
    </Animated.View>
  );
}

function Dot({ active }: { active: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, springs.bouncy));
    }
  }, [active, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <Animated.View style={[styles.dot, active && styles.dotActive, style]} />;
}

/** Цифровая клавиатура из стеклянных клавиш iOS 26. */
export function PinPad({ onKey, disabled, canDelete }: { onKey: (key: PinKey) => void; disabled?: boolean; canDelete: boolean }) {
  return (
    <View style={styles.pad}>
      {KEYS.map((key, index) => {
        if (key === '') return <View key={index} style={styles.cell} />;
        if (key === 'delete') {
          return (
            <Pressable
              key={index}
              style={styles.cell}
              disabled={disabled || !canDelete}
              onPress={() => {
                haptic.selection();
                onKey('delete');
              }}
              accessibilityRole="button"
              accessibilityLabel="Стереть">
              {canDelete && <SymbolView name="delete.left" size={26} tintColor={colors.label} />}
            </Pressable>
          );
        }
        return (
          <View key={index} style={styles.cell}>
            <GlassView isInteractive style={styles.key}>
              <Pressable
                style={styles.keyPress}
                disabled={disabled}
                onPress={() => {
                  haptic.selection();
                  onKey(key);
                }}
                accessibilityRole="button"
                accessibilityLabel={key}>
                <Text style={styles.digit}>{key}</Text>
              </Pressable>
            </GlassView>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 22, justifyContent: 'center', paddingVertical: 8 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.label,
  },
  dotActive: { backgroundColor: colors.label },
  pad: {
    width: KEY_SIZE * 3 + 28 * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 28,
    alignSelf: 'center',
  },
  cell: { width: KEY_SIZE, height: KEY_SIZE, alignItems: 'center', justifyContent: 'center' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, overflow: 'hidden' },
  keyPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 34, fontWeight: '400', color: colors.label, fontVariant: ['tabular-nums'] },
});
