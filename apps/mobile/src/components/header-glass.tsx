import { Platform } from 'react-native';

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
 * На Android ни Liquid Glass, ни scroll edge effects нет, а отступ под прозрачную шапку
 * там некому добрать: contentInsetAdjustmentBehavior — механика UIScrollView, и содержимое
 * налезает на заголовок. Поэтому шапка занимает своё место, оставаясь без фона —
 * фирменный градиент экрана виден и под ней.
 */
export const glassHeaderOptions = Platform.select({
  ios: {
    headerTransparent: true,
    scrollEdgeEffects: { top: 'automatic' as const },
  },
  default: {
    headerTransparent: false,
    headerStyle: { backgroundColor: 'transparent' },
    headerShadowVisible: false,
  },
});
