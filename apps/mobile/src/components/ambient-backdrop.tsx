import type { ReactNode } from 'react';
import { StyleSheet, useColorScheme, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Фирменный фон под стеклянными карточками — и одновременно корневой контейнер экрана.
 *
 * Именно контейнер, а не отдельный слой: iOS 26 вешает прогрессивное размытие у краёв
 * прокрутки (UIScrollEdgeEffect) на ScrollView, который ищет строго по первой ветке
 * подпредставлений экрана (RNSScrollViewFinder). Фоновый слой первым ребёнком обрывал
 * этот поиск — и контент уходил под шапку без всякого размытия.
 *
 * Фон статичный: под десятками стёкол анимация заставляла бы их перерисовываться каждый кадр.
 */
export function AmbientBackdrop({
  children,
  style,
  onLayout,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={[styles.fill, dark ? styles.dark : styles.light, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  light: {
    experimental_backgroundImage:
      'radial-gradient(circle at 8% 4%, rgba(139,92,246,0.30) 0%, rgba(139,92,246,0) 42%), ' +
      'radial-gradient(circle at 96% 26%, rgba(76,215,246,0.26) 0%, rgba(76,215,246,0) 38%), ' +
      'radial-gradient(circle at 18% 70%, rgba(167,139,250,0.24) 0%, rgba(167,139,250,0) 40%), ' +
      'radial-gradient(circle at 88% 92%, rgba(56,189,248,0.20) 0%, rgba(56,189,248,0) 36%)',
  },
  dark: {
    experimental_backgroundImage:
      'radial-gradient(circle at 8% 4%, rgba(124,58,237,0.42) 0%, rgba(124,58,237,0) 44%), ' +
      'radial-gradient(circle at 96% 26%, rgba(34,211,238,0.24) 0%, rgba(34,211,238,0) 38%), ' +
      'radial-gradient(circle at 18% 70%, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0) 40%), ' +
      'radial-gradient(circle at 88% 92%, rgba(56,189,248,0.20) 0%, rgba(56,189,248,0) 36%)',
  },
});
