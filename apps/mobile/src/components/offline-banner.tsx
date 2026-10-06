import { onlineManager } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, Platform } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, space, type } from '@/lib/theme';

/** systemChromeMaterial — тинт UIKit: на Android expo-blur его не знает и подложка выходит пустой. */
const BLUR_TINT = Platform.OS === 'ios' ? 'systemChromeMaterial' : 'dark';

/**
 * Полоска «нет сети» под статус-баром. Касса продолжает работать на сохранённых данных,
 * но деньги офлайн не проводятся — об этом честно предупреждаем, а не молчим.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => onlineManager.subscribe(setOnline), []);

  if (online) return null;
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)} pointerEvents="none" style={[styles.wrap, { top: insets.top + space.xs }]}>
      <BlurView tint={BLUR_TINT} intensity={80} style={styles.pill}>
        <SymbolView name="wifi.slash" size={14} weight="semibold" tintColor={colors.orange} />
        <Text style={[type.footnote, styles.text]}>Нет сети — данные из памяти, оплата недоступна</Text>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center', zIndex: 20 },
  // Высота минимальная: на «Увеличенном» виде и с крупным текстом фраза переносится на вторую строку.
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 7, minHeight: 34, borderRadius: 17, overflow: 'hidden' },
  text: { flexShrink: 1, color: colors.label, fontWeight: '600', textAlign: 'center' },
});
