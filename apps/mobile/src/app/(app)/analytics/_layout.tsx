import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';
import { sheetOptions } from '@/lib/sheet';

import { glassHeader, stackHeaderOptions } from '@/components/header-glass';
import { sheetLayout } from '@/components/sheet-grabber';

export default function AnalyticsLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', ...stackHeaderOptions }} screenLayout={sheetLayout}>
      {/* Заголовок «Аналитика» рисуется в самом экране — как в кассе и событиях. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Аналитика' }} />
      <Stack.Screen name="checks" options={glassHeader({ title: 'Чеки' })} />
      <Stack.Screen name="products" options={glassHeader({ title: 'Бар и товары' })} />
      <Stack.Screen name="players" options={glassHeader({ title: 'Игроки' })} />
      <Stack.Screen name="segment" options={glassHeader()} />
      <Stack.Screen name="player/[playerId]" options={glassHeader()} />
      <Stack.Screen name="events" options={glassHeader({ title: 'Мероприятия' })} />
      <Stack.Screen name="tariffs" options={glassHeader({ title: 'Игры и тарифы' })} />
      <Stack.Screen name="staff" options={glassHeader({ title: 'Персонал' })} />
      <Stack.Screen
        name="check/[checkId]"
        options={{
          presentation: 'formSheet',
          ...sheetOptions,
          sheetAllowedDetents: [0.7, 1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: colors.sheetBackground },
        }}
      />
      <Stack.Screen
        name="period"
        options={{
          presentation: 'formSheet',
          ...sheetOptions,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: colors.sheetBackground },
        }}
      />
    </Stack>
  );
}
