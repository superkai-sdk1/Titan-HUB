import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

import { glassHeaderOptions } from '@/components/header-glass';

/**
 * Шапка раздела: прозрачная, со стеклянной подложкой (см. components/header-glass).
 */
const glassHeader = glassHeaderOptions;

/** Шторки форм на всю высоту; контент без фона — под ним системное стекло шторки iOS 26. */
const formSheet = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: colors.sheetBackground },
};

export default function EventsLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      {/* Заголовок «События» рисуется в самом экране — как в кассе. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'События' }} />
      {/* Прозрачная шапка над фирменным фоном; открывается зумом из карточки. */}
      <Stack.Screen name="[eventId]" options={glassHeader} />
      <Stack.Screen name="edit" options={formSheet} />
      <Stack.Screen name="minicap" options={formSheet} />
      <Stack.Screen name="participants" options={formSheet} />
    </Stack>
  );
}
