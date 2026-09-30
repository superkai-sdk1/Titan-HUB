import { Stack } from 'expo-router';

import { formHeader, stackHeaderOptions } from '@/components/header-glass';
import { sheetLayout } from '@/components/sheet-grabber';

/** Карточка чека и выбор периода — модальные формы с кнопками в шапке, как системные. */
const modalForm = { presentation: 'modal' as const, ...formHeader() };

export default function AnalyticsLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', ...stackHeaderOptions }} screenLayout={sheetLayout}>
      {/* Корень — нативная форма с крупным заголовком в шапке Liquid Glass. */}
      <Stack.Screen name="index" options={formHeader({ title: 'Аналитика', headerLargeTitle: true })} />
      <Stack.Screen name="checks" options={formHeader({ title: 'Чеки' })} />
      <Stack.Screen name="products" options={formHeader({ title: 'Бар и товары' })} />
      <Stack.Screen name="players" options={formHeader({ title: 'Игроки' })} />
      <Stack.Screen name="segment" options={formHeader()} />
      <Stack.Screen name="player/[playerId]" options={formHeader()} />
      <Stack.Screen name="events" options={formHeader({ title: 'Мероприятия' })} />
      <Stack.Screen name="tariffs" options={formHeader({ title: 'Игры и тарифы' })} />
      <Stack.Screen name="staff" options={formHeader({ title: 'Персонал' })} />
      <Stack.Screen name="check/[checkId]" options={modalForm} />
      <Stack.Screen name="period" options={modalForm} />
    </Stack>
  );
}
