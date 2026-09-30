import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { IslandsWarmup } from '@/compat/android/swift-ui/warmup';

/**
 * Прогрев нативных вставок SwiftUI, пока видна заставка. Первый показ календаря и
 * Swift Charts стоит 70–300 мс — загрузка фреймворка и метаданные Swift, — и эта пауза
 * выпадала на первое открытие аналитики или выбора даты. Повторно тот же тип стоит
 * единицы миллисекунд, поэтому один раз рисуем их под заставкой при запуске.
 * На Android вставок нет — прогревать нечего.
 */
export const NEEDS_WARMUP = Platform.OS === 'ios';

/** Кадров на построение, раскладку и первую отрисовку SwiftUI. */
const FRAMES = 6;

export function SwiftUIWarmup({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    let frame = 0;
    let handle = 0;
    const tick = () => {
      frame += 1;
      if (frame >= FRAMES) onDone();
      else handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [onDone]);

  // Заставка — нативный слой поверх приложения: вставки под ней видны системе, но не человеку.
  return (
    <View style={styles.hidden} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <IslandsWarmup />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', top: 120, left: 16, width: 320 },
});
