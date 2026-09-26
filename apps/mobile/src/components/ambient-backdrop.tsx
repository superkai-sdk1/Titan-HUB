import { BlurTargetView } from 'expo-blur';
import { NavigationRouteContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useBlurTargets } from '@/lib/blur-targets';
import { colors } from '@/lib/theme';

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
  if (Platform.OS === 'android') return <AndroidBackdrop style={style} onLayout={onLayout} dark={dark}>{children}</AndroidBackdrop>;
  return (
    <View style={[styles.fill, dark ? backdropGradient.dark : backdropGradient.light, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

/**
 * Android: фон экрана — ещё и цель размытия для прозрачной шапки (components/header-glass).
 * Шапка размывает уехавший под неё контент, как UIScrollEdgeEffect на iOS.
 */
function AndroidBackdrop({
  children,
  style,
  onLayout,
  dark,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  dark: boolean;
}) {
  const route = useContext(NavigationRouteContext);
  const target = useRef<View>(null);
  const key = route?.key;

  useEffect(() => {
    if (!key) return;
    const { register, unregister } = useBlurTargets.getState();
    register(key, target);
    return () => unregister(key, target);
  }, [key]);

  return (
    // Фон страницы — внутри цели: движок размытия не видит фон окна под ней и подставил бы
    // серый, отчего шапка светлела и «отрывалась» от экрана.
    <BlurTargetView ref={target} style={[styles.fill, styles.page]}>
      <View style={[styles.fill, dark ? backdropGradient.dark : backdropGradient.light, style]} onLayout={onLayout}>
        {children}
      </View>
    </BlurTargetView>
  );
}

/** Градиент фона. Его же рисует шапка Android (components/header-glass) — шапка продолжает фон экрана. */
export const backdropGradient = StyleSheet.create({
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { backgroundColor: colors.groupedBackground },
});
