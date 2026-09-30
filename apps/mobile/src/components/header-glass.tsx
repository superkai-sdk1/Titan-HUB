import { BlurView } from 'expo-blur';
import { useNavigation } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { Platform, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';

import { backdropGradient } from '@/components/ambient-backdrop';
import { ToolbarCircleButton } from '@/components/toolbar-circle-button';
import { useMaterialIcon } from '@/components/toolbar';
import { useBlurTargets } from '@/lib/blur-targets';
import { colors } from '@/lib/theme';

/**
 * Опции экрана-раздела: прозрачная шапка и НАТИВНОЕ размытие контента у верхнего края.
 *
 * iOS 26 сам размывает содержимое, уезжающее под шапку (UIScrollEdgeEffect): размытие
 * нарастает по мере прокрутки, а у верхнего края его нет. Постоянная подложка-BlurView
 * выглядела как всегда матовая полоса — это не то поведение.
 *
 * ВАЖНО: эффект вешается на ScrollView, который react-native-screens ищет строго по
 * ПЕРВОЙ ветке подпредставлений экрана. Поэтому фирменный фон — это корневой контейнер
 * экрана (`AmbientBackdrop`), а не первый слой рядом со списком: слой обрывал поиск,
 * и контент шёл под шапку без размытия.
 *
 * Android: ни Liquid Glass, ни scroll edge effects там нет. Раньше шапка была плоской
 * серой полосой Material, обрубавшей фирменный градиент. Теперь она тоже прозрачная,
 * а её фон — продолжение того же градиента в координатах окна (HeaderBackdrop): у верхнего
 * края шва не видно, а уехавший под шапку контент она аккуратно закрывает. Отступ под
 * шапку контенту даёт usePageGutter (lib/layout.ts). Заголовок по центру и круглые кнопки —
 * как в шапке iPhone.
 */

/** Запасной фон шапки Android — градиент экрана, если размывать нечего. */
function HeaderBackdrop() {
  const dark = useColorScheme() === 'dark';
  const { height } = useWindowDimensions();
  return (
    <View style={styles.backdropClip}>
      <View style={[styles.layer, { height }, dark ? backdropGradient.dark : backdropGradient.light]} />
    </View>
  );
}

/**
 * Радиусы размытия шапки сверху вниз: плотная часть, затем ступени полосы перехода, где
 * размытие сходит на нет. Шаг мелкий — ступени не читаются.
 */
const SOLID_RADIUS = 22;
const FADE_RADII = [17, 13, 9.5, 6.5, 4, 2];
/** Высота полосы перехода у нижнего края шапки. */
const FADE = 48;
/**
 * expo-blur на Android кладёт поверх размытия белую плёнку с прозрачностью ∝ intensity
 * (0.44·intensity%), а радиус считает как intensity / blurReductionFactor. Малый intensity
 * с малым делителем даёт полноценный радиус почти без плёнки — иначе шапка светлела.
 */
const REDUCTION = 0.25;

/**
 * Шапка Android как UIScrollEdgeEffect iOS 26: уехавший под неё контент размыт, а к нижнему
 * краю размытие плавно ослабевает — без жёсткой границы и без «полосы» в покое.
 *
 * Размывается содержимое своего экрана (AmbientBackdrop регистрирует его как цель по ключу
 * маршрута). У цели непрозрачный фон страницы, поэтому в покое размытый градиент совпадает
 * с самим градиентом и шапка неотличима от экрана. Сверху — лёгкая вуаль цвета страницы,
 * тающая к краю: заголовок читается и над пёстрым контентом.
 */
function HeaderBlur({ routeKey }: { routeKey: string }) {
  const target = useBlurTargets((s) => s.targets[routeKey]);
  const dark = useColorScheme() === 'dark';
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  if (!target || headerHeight <= 0) return <HeaderBackdrop />;

  const solid = Math.max(0, headerHeight - FADE);
  const step = FADE / FADE_RADII.length;
  const fadeStart = Math.round((solid / headerHeight) * 100);
  const veil = dark ? '0,0,0' : '242,242,247';

  return (
    <View style={styles.clip} pointerEvents="none">
      <BlurView
        blurTarget={target}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={SOLID_RADIUS * REDUCTION}
        blurReductionFactor={REDUCTION}
        style={[styles.band, { top: 0, height: solid + 0.5 }]}
      />
      {FADE_RADII.map((radius, index) => (
        <BlurView
          key={radius}
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={radius * REDUCTION}
          blurReductionFactor={REDUCTION}
          style={[styles.band, { top: solid + index * step, height: step + 0.5 }]}
        />
      ))}
      <View
        style={[
          styles.fill,
          { experimental_backgroundImage: `linear-gradient(to bottom, rgba(${veil},0.34) 0%, rgba(${veil},0.18) ${fadeStart}%, rgba(${veil},0) 100%)` },
        ]}
      />
    </View>
  );
}

/** «Назад» — круглая кнопка, как в шапке iOS 26, а не голая стрелка Material. */
function HeaderBackButton() {
  const navigation = useNavigation();
  const icon = useMaterialIcon('chevron.left');
  return <ToolbarCircleButton standalone source={icon} label="Назад" onPress={() => navigation.goBack()} />;
}

const androidHeader = {
  headerTitleAlign: 'center' as const,
  headerTitleStyle: { fontSize: 18, fontWeight: '600' as const, color: colors.label },
  headerShadowVisible: false,
  headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => (canGoBack ? <HeaderBackButton /> : null),
};

/** Общий вид шапок Android для всех стеков (заголовок по центру, круглая «назад»). На iOS — ничего. */
export const stackHeaderOptions: Partial<typeof androidHeader> = Platform.OS === 'android' ? androidHeader : {};

/**
 * Опции экрана-раздела. Функция от маршрута: шапке Android нужно знать ключ своего экрана,
 * чтобы размывать именно его. `extra` — заголовок и прочие опции экрана.
 */
export function glassHeader(extra: Record<string, unknown> = {}) {
  if (Platform.OS === 'ios') {
    return { headerTransparent: true, scrollEdgeEffects: { top: 'automatic' as const }, ...extra };
  }
  return ({ route }: { route: { key: string } }) => ({
    ...androidHeader,
    headerTransparent: true,
    headerStyle: { backgroundColor: 'transparent' },
    headerBackground: () => <HeaderBlur routeKey={route.key} />,
    ...extra,
  });
}

/**
 * Опции экрана с нативной формой (SwiftUI Form/List, components/native-form.tsx).
 * iOS: системная шапка Liquid Glass — форма уходит под неё, край размывается сам,
 * крупный заголовок сворачивается при прокрутке. Android: слой совместимости рисует
 * форму обычным списком, поэтому шапка непрозрачная, в цвет сгруппированного фона.
 */
export function formHeader(extra: Record<string, unknown> = {}) {
  if (Platform.OS === 'ios') {
    return { headerTransparent: true, scrollEdgeEffects: { top: 'automatic' as const }, ...extra };
  }
  return {
    ...androidHeader,
    headerTransparent: false,
    headerStyle: { backgroundColor: colors.groupedBackground },
    contentStyle: { backgroundColor: colors.groupedBackground },
    ...extra,
  };
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  band: { position: 'absolute', left: 0, right: 0 },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  backdropClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: colors.groupedBackground },
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
});
