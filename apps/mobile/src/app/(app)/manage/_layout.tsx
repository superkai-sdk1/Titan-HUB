import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';
import { sheetOptions } from '@/lib/sheet';

import { formHeader, glassHeader, stackHeaderOptions } from '@/components/header-glass';
import { sheetLayout } from '@/components/sheet-grabber';

/** Контент шторок без фона — под ним системное стекло шторки iOS 26. */
const tallSheet = {
  presentation: 'formSheet' as const,
  ...sheetOptions,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: colors.sheetBackground },
};

const compactSheet = {
  presentation: 'formSheet' as const,
  ...sheetOptions,
  sheetAllowedDetents: 'fitToContents' as const,
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: colors.sheetBackground },
};

/**
 * Редактор-форма (SwiftUI Form) с «Отмена» и «Сохранить» в шапке, как системные формы iOS:
 * на iPhone — карточка поверх раздела, на Android — полноэкранная форма. В отличие от
 * шторки по высоте содержимого, форма прокручивается и сама уходит от клавиатуры.
 */
const editorModal = { presentation: 'modal' as const, ...formHeader() };

export default function ManageLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', ...stackHeaderOptions }} screenLayout={sheetLayout}>
      {/* Корень — нативная форма, как «Настройки» iOS: крупный заголовок в шапке Liquid Glass. */}
      <Stack.Screen name="index" options={formHeader({ title: 'Управление', headerLargeTitle: true })} />

      <Stack.Screen name="menu/index" options={formHeader({ title: 'Меню' })} />
      <Stack.Screen name="menu/[categoryId]" options={formHeader()} />
      <Stack.Screen name="menu/item" options={editorModal} />
      <Stack.Screen name="menu/category" options={editorModal} />
      <Stack.Screen name="menu/reorder" options={editorModal} />

      <Stack.Screen name="pricing/index" options={formHeader({ title: 'Тарифы и аренда' })} />
      <Stack.Screen name="pricing/tariff" options={editorModal} />
      <Stack.Screen name="pricing/evening" options={editorModal} />
      <Stack.Screen name="pricing/space" options={editorModal} />
      <Stack.Screen name="pricing/rate" options={editorModal} />

      <Stack.Screen name="inventory/index" options={glassHeader({ title: 'Склад' })} />
      <Stack.Screen name="inventory/[itemId]" options={glassHeader()} />
      <Stack.Screen name="inventory/stock-action" options={compactSheet} />
      <Stack.Screen name="inventory/supply/[supplyId]" options={glassHeader()} />
      <Stack.Screen name="inventory/supply-editor" options={glassHeader()} />
      <Stack.Screen name="inventory/revision/[revisionId]" options={glassHeader()} />
      <Stack.Screen name="inventory/revision-editor" options={glassHeader()} />
      <Stack.Screen name="inventory/expense-new" options={tallSheet} />

      <Stack.Screen name="salary/index" options={formHeader({ title: 'Зарплата' })} />

      <Stack.Screen name="shifts/index" options={formHeader({ title: 'Смены' })} />
      <Stack.Screen name="shifts/[shiftId]" options={formHeader({ title: 'Отчёт смены' })} />

      <Stack.Screen name="clients/index" options={glassHeader({ title: 'Клиенты' })} />
      <Stack.Screen name="clients/[clientId]" options={glassHeader()} />
      <Stack.Screen name="clients/edit" options={tallSheet} />
      <Stack.Screen name="clients/adjust" options={compactSheet} />
      <Stack.Screen name="clients/telegram" options={tallSheet} />
      <Stack.Screen name="clients/tg-roster" options={tallSheet} />

      <Stack.Screen name="balances/index" options={formHeader({ title: 'Депозиты и долги' })} />
      <Stack.Screen name="balances/find" options={compactSheet} />

      <Stack.Screen name="customers/index" options={formHeader({ title: 'Заказчики' })} />
      <Stack.Screen name="customers/edit" options={editorModal} />

      <Stack.Screen name="collections/index" options={formHeader({ title: 'Сбор средств' })} />
      <Stack.Screen name="collections/[collectionId]" options={formHeader()} />
      <Stack.Screen name="collections/edit" options={editorModal} />
      <Stack.Screen name="collections/pay" options={compactSheet} />
      <Stack.Screen name="collections/member" options={editorModal} />

      <Stack.Screen name="loyalty/index" options={formHeader({ title: 'Лояльность' })} />
      <Stack.Screen name="loyalty/bonus" options={formHeader({ title: 'Бонусная программа' })} />
      <Stack.Screen name="loyalty/certificates" options={formHeader({ title: 'Сертификаты' })} />
      <Stack.Screen name="loyalty/discount" options={editorModal} />
      <Stack.Screen name="loyalty/tier-rule" options={editorModal} />

      <Stack.Screen name="staff/index" options={formHeader({ title: 'Сотрудники' })} />
      <Stack.Screen name="staff/[staffId]" options={formHeader()} />
      <Stack.Screen name="staff/me" options={formHeader({ title: 'Мой профиль' })} />
      <Stack.Screen name="staff/notifications" options={formHeader({ title: 'Уведомления' })} />
      <Stack.Screen name="staff/new" options={editorModal} />

      <Stack.Screen name="settings/index" options={formHeader({ title: 'Настройки клуба' })} />
      <Stack.Screen name="settings/payment" options={formHeader({ title: 'Оплата и чеки' })} />
      <Stack.Screen name="settings/booking" options={formHeader({ title: 'Онлайн-бронирование' })} />
      <Stack.Screen name="settings/reviews" options={formHeader({ title: 'Отзывы гостей' })} />
      <Stack.Screen name="settings/integrations" options={formHeader({ title: 'Интеграции' })} />

      <Stack.Screen name="polls/index" options={formHeader({ title: 'Опросы' })} />
      <Stack.Screen name="polls/edit" options={editorModal} />

      <Stack.Screen name="about/index" options={formHeader({ title: 'О системе' })} />
    </Stack>
  );
}
