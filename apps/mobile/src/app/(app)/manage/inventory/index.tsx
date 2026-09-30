import { Form, HStack, Host, Picker, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Tile } from '@/components/analytics/native';
import { ExpensesTab } from '@/components/inventory/expenses-tab';
import { ItemsTab, type ItemsFilter } from '@/components/inventory/items-tab';
import { RevisionsTab } from '@/components/inventory/revisions-tab';
import { SuppliesTab } from '@/components/inventory/supplies-tab';
import { LinkRow } from '@/components/native-form';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';
import { formatMoney, plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseStockDate, useInventoryOverview } from '@/lib/inventory-api';
import { queryClient } from '@/lib/query';
import { useClubKey } from '@/lib/queries';

type Tab = 'items' | 'supplies' | 'revisions' | 'expenses';

const TABS: readonly Tab[] = ['items', 'supplies', 'revisions', 'expenses'];

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });

/**
 * «Склад»: стоимость остатков и тревожные позиции сверху, ниже —
 * остатки, закупки, ревизии и расходы клуба одним сегментом, как в веб-кассе.
 */
export default function InventoryScreen() {
  const router = useRouter();
  // `?tab=expenses` — сразу нужная вкладка (ссылка из уведомления или другого раздела).
  const params = useLocalSearchParams<{ tab?: string }>();
  const club = useClubKey();
  const overview = useInventoryOverview();
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t === params.tab) ?? 'items');
  const [filter, setFilter] = useState<ItemsFilter>('all');
  const [query, setQuery] = useState('');
  const data = overview.data;

  const refresh = async () => {
    await queryClient.refetchQueries({ queryKey: [club, 'inventory'], type: 'active' });
  };

  const showFilter = (next: ItemsFilter) => {
    haptic.selection();
    setTab('items');
    setFilter(next);
  };

  const lastSupply = parseStockDate(data?.lastSupplyAt ?? null);
  const lastRevision = parseStockDate(data?.lastRevisionAt ?? null);
  const footer = [
    lastSupply ? `Закупка ${dayMonth.format(lastSupply).replace('.', '')}` : null,
    lastRevision ? `ревизия ${dayMonth.format(lastRevision).replace('.', '')}` : null,
    data && data.deadStockCount > 0 ? `залежалось ${data.deadStockCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Stack.Title>Склад</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="plus" accessibilityLabel="Создать">
          <ToolbarMenuAction icon="shippingbox" onPress={() => router.push('/manage/inventory/supply-editor')}>
            Закупка
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="checklist" onPress={() => router.push('/manage/inventory/revision-editor')}>
            Ревизия
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="banknote" onPress={() => router.push('/manage/inventory/expense-new')}>
            Расход
          </ToolbarMenuAction>
        </ToolbarMenu>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(refresh)]}>
          <Section footer={footer ? <Text>{footer}</Text> : undefined}>
            <HStack spacing={12}>
              <Tile label="Стоимость" value={data ? formatMoney(data.stockValue) : '—'} caption="себестоимость" />
              <Tile label="Мало" value={String(data?.lowStockCount ?? 0)} caption="заканчивается" />
              <Tile label="Нет" value={String(data?.outOfStockCount ?? 0)} caption="закончились" />
            </HStack>
            {data && data.lowStockCount + data.outOfStockCount > 0 ? (
              <LinkRow
                icon="exclamationmark.triangle.fill"
                color="#F97316"
                title="Пора дозаказать"
                subtitle={`${data.lowStockCount + data.outOfStockCount} ${plural(data.lowStockCount + data.outOfStockCount, ['товар', 'товара', 'товаров'])} на исходе или закончились`}
                onPress={() => showFilter('alarm')}
              />
            ) : null}
          </Section>

          <Section>
            <Picker
              selection={tab}
              onSelectionChange={(value) => {
                haptic.selection();
                setTab(value as Tab);
                setQuery('');
              }}
              modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('items')]}>Остатки</Text>
              <Text modifiers={[tag('supplies')]}>Закупки</Text>
              <Text modifiers={[tag('revisions')]}>Ревизия</Text>
              <Text modifiers={[tag('expenses')]}>Расходы</Text>
            </Picker>
          </Section>

          {tab === 'items' && <ItemsTab filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} />}
          {tab === 'supplies' && <SuppliesTab />}
          {tab === 'revisions' && <RevisionsTab />}
          {tab === 'expenses' && <ExpensesTab />}
        </Form>
      </Host>
    </>
  );
}
