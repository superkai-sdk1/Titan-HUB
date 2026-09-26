import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { colors } from '@/lib/theme';

import { glassHeaderOptions } from '@/components/header-glass';

/**
 * Шапка раздела: прозрачная, со стеклянной подложкой (см. components/header-glass).
 */
const glassHeader = glassHeaderOptions;

/**
 * Короткие действия с чеком — шторки по высоте содержимого, как «Новый чек».
 * Контент без собственного фона: iOS 26 рисует под ним Liquid Glass шторки.
 */
const compactSheet = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: colors.sheetBackground },
} as const;

export default function PosLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      {/* Заголовок «Касса» рисуется в самом экране — в одну строку с колокольчиком, как в App Store. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Касса' }} />
      {/* Прозрачная шапка: фирменный фон и стеклянные карточки чека видны и под ней. */}
      <Stack.Screen name="[checkId]" options={glassHeader} />
      <Stack.Screen
        name="menu"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.62, 1],
          sheetGrabberVisible: true,
          sheetLargestUndimmedDetentIndex: 0,
          headerShown: false,
          contentStyle: { backgroundColor: colors.sheetBackground },
        }}
      />
      <Stack.Screen
        name="chat"
        options={{
          presentation: 'formSheet',
          // Android раскладывает шторку на полную высоту и на средней высоте прячет низ —
          // поле ввода и быстрые ответы оказывались за экраном. Там шторка сразу во весь рост.
          sheetAllowedDetents: Platform.OS === 'android' ? [1] : [0.6, 1],
          sheetGrabberVisible: true,
          sheetLargestUndimmedDetentIndex: Platform.OS === 'android' ? 'none' : 0,
          headerShown: true,
          // Без отступа под статус-бар в шапке шторки (см. app/shift/_layout.tsx).
          ...(Platform.OS === 'android' ? { statusBarTranslucent: false } : {}),
          title: 'Чат с кабинкой',
        }}
      />
      <Stack.Screen name="refunds" options={{ ...glassHeader, title: 'Возвраты' }} />
      <Stack.Screen
        name="refund"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: colors.sheetBackground },
        }}
      />
      <Stack.Screen name="player" options={compactSheet} />
      <Stack.Screen name="discount" options={compactSheet} />
      <Stack.Screen name="rental" options={compactSheet} />
    </Stack>
  );
}
