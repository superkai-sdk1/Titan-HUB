// PIN сотрудника: 4 точки и крупная цифровая клавиатура (своя — системная
// клавиатура на киоске не нужна и перекрывала бы экран).
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

import { Icon } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/**
 * onSubmit вызывается на 4-й цифре; вернуть строку ошибки — точки потрясутся и
 * сбросятся, null — успех (экран уйдёт сам).
 */
export function PinPad({ onSubmit, disabled }: { onSubmit: (pin: string) => Promise<string | null>; disabled?: boolean }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const press = async (key: string) => {
    if (busy || disabled) return;
    haptic.tap();
    setError(null);
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length < 4) return;
    setBusy(true);
    const err = await onSubmit(next);
    setBusy(false);
    if (err) {
      haptic.error();
      setError(err);
      setPin('');
      shake.set(withSequence(
        withTiming(-14, { duration: 50 }), withTiming(14, { duration: 50 }),
        withTiming(-9, { duration: 50 }), withTiming(9, { duration: 50 }), withTiming(0, { duration: 50 }),
      ));
    }
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dots, shakeStyle]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </Animated.View>
      <View style={styles.message}>
        {busy ? <ActivityIndicator color={colors.violetLight} /> : error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              onPress={() => void press(k)}
              disabled={busy || disabled}
              style={({ pressed }) => [styles.key, styles.keyFace, pressed && styles.keyPressed]}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Стереть' : k}
            >
              {k === 'del' ? <Icon name="backspace-outline" size={30} color={colors.textBody} /> : <Text style={styles.keyText}>{k}</Text>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 18, height: 22, alignItems: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  dotFilled: { borderWidth: 0, experimental_backgroundImage: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)' },
  message: { height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.red, fontSize: 15, fontWeight: '700' },
  grid: { width: 3 * 92 + 2 * 16, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  key: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  keyFace: { borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border },
  keyPressed: { backgroundColor: 'rgba(139,92,246,0.22)', borderColor: colors.borderViolet },
  keyText: { color: colors.text, fontSize: 34, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
