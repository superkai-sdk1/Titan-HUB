import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

import { glassHeaderOptions } from '@/components/header-glass';

/**
 * Шапка раздела: прозрачная, со стеклянной подложкой (см. components/header-glass).
 */
const glassHeader = glassHeaderOptions;

/** Контент шторок без фона — под ним системное стекло шторки iOS 26. */
const tallSheet = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: colors.sheetBackground },
};

const compactSheet = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: 'fitToContents' as const,
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: colors.sheetBackground },
};

export default function ManageLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      {/* Заголовок «Управление» рисуется в самом экране — как в кассе и событиях. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Управление' }} />

      <Stack.Screen name="menu/index" options={{ ...glassHeader, title: 'Меню' }} />
      <Stack.Screen name="menu/[categoryId]" options={glassHeader} />
      <Stack.Screen name="menu/item" options={tallSheet} />
      <Stack.Screen name="menu/category" options={tallSheet} />
      <Stack.Screen name="menu/reorder" options={tallSheet} />

      <Stack.Screen name="pricing/index" options={{ ...glassHeader, title: 'Тарифы и аренда' }} />
      <Stack.Screen name="pricing/tariff" options={compactSheet} />
      <Stack.Screen name="pricing/evening" options={compactSheet} />
      <Stack.Screen name="pricing/space" options={tallSheet} />

      <Stack.Screen name="inventory/index" options={{ ...glassHeader, title: 'Склад' }} />
      <Stack.Screen name="inventory/[itemId]" options={glassHeader} />
      <Stack.Screen name="inventory/stock-action" options={compactSheet} />
      <Stack.Screen name="inventory/supply/[supplyId]" options={glassHeader} />
      <Stack.Screen name="inventory/supply-editor" options={glassHeader} />
      <Stack.Screen name="inventory/revision/[revisionId]" options={glassHeader} />
      <Stack.Screen name="inventory/revision-editor" options={glassHeader} />
      <Stack.Screen name="inventory/expense-new" options={tallSheet} />

      <Stack.Screen name="salary/index" options={{ ...glassHeader, title: 'Зарплата' }} />

      <Stack.Screen name="shifts/index" options={{ ...glassHeader, title: 'Смены' }} />
      <Stack.Screen name="shifts/[shiftId]" options={{ ...glassHeader, title: 'Отчёт смены' }} />

      <Stack.Screen name="clients/index" options={{ ...glassHeader, title: 'Клиенты' }} />
      <Stack.Screen name="clients/[clientId]" options={glassHeader} />
      <Stack.Screen name="clients/edit" options={tallSheet} />
      <Stack.Screen name="clients/adjust" options={compactSheet} />
      <Stack.Screen name="clients/telegram" options={tallSheet} />
      <Stack.Screen name="clients/tg-roster" options={tallSheet} />

      <Stack.Screen name="balances/index" options={{ ...glassHeader, title: 'Депозиты и долги' }} />
      <Stack.Screen name="balances/find" options={compactSheet} />

      <Stack.Screen name="customers/index" options={{ ...glassHeader, title: 'Заказчики' }} />
      <Stack.Screen name="customers/edit" options={compactSheet} />

      <Stack.Screen name="collections/index" options={{ ...glassHeader, title: 'Сбор средств' }} />
      <Stack.Screen name="collections/[collectionId]" options={glassHeader} />
      <Stack.Screen name="collections/edit" options={tallSheet} />
      <Stack.Screen name="collections/pay" options={compactSheet} />
      <Stack.Screen name="collections/member" options={compactSheet} />

      <Stack.Screen name="loyalty/index" options={{ ...glassHeader, title: 'Лояльность' }} />
      <Stack.Screen name="loyalty/discount" options={tallSheet} />
      <Stack.Screen name="loyalty/tier-rule" options={compactSheet} />

      <Stack.Screen name="staff/index" options={{ ...glassHeader, title: 'Пользователи' }} />
      <Stack.Screen name="staff/[staffId]" options={glassHeader} />
      <Stack.Screen name="staff/me" options={{ ...glassHeader, title: 'Мой профиль' }} />
      <Stack.Screen name="staff/notifications" options={{ ...glassHeader, title: 'Уведомления' }} />
      <Stack.Screen name="staff/new" options={tallSheet} />

      <Stack.Screen name="settings/index" options={{ ...glassHeader, title: 'Настройки' }} />

      <Stack.Screen name="polls/index" options={{ ...glassHeader, title: 'Опросы' }} />
      <Stack.Screen name="polls/edit" options={tallSheet} />

      <Stack.Screen name="about/index" options={{ ...glassHeader, title: 'О системе' }} />
    </Stack>
  );
}
