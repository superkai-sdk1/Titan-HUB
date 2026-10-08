import { ContentUnavailableView, Form, Host, Picker, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { MenuTab } from '@/components/goods/menu-tab';
import { OperationsTab } from '@/components/goods/operations-tab';
import { StockTab, type StockFilter } from '@/components/goods/stock-tab';
import { ToolbarButton, ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';
import { useGoods } from '@/lib/goods-api';
import { haptic } from '@/lib/haptics';
import { queryClient } from '@/lib/query';
import { useClubKey, useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';

type Tab = 'menu' | 'stock' | 'operations';

const TAB_TITLES: Record<Tab, string> = { menu: 'Меню', stock: 'Остатки', operations: 'Операции' };

/**
 * «Товары» — меню, остатки и операции склада одним разделом. Меню — что продаём,
 * Остатки — сколько есть, Операции — что меняет остатки (приход, списание, ревизия).
 * Кнопки шапки зависят от вкладки: на каждое действие — одно место.
 */
export default function GoodsScreen() {
  const router = useRouter();
  const club = useClubKey();
  const params = useLocalSearchParams<{ tab?: string }>();
  const me = useMe();
  const sessionRole = useSession((s) => s.user?.role);
  const role = me.data?.role ?? sessionRole ?? 'staff';
  const permissions = me.data?.permissions ?? null;
  const allowed = (perm: string) => role === 'owner' || permissions?.[perm] !== false;
  const tabs = ([] as Tab[]).concat(allowed('menu') ? ['menu'] : [], allowed('inventory') ? ['stock', 'operations'] : []);

  const [picked, setPicked] = useState<Tab | null>(() => (['menu', 'stock', 'operations'] as Tab[]).find((t) => t === params.tab) ?? null);
  const tab: Tab | undefined = picked && tabs.includes(picked) ? picked : tabs[0];
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<StockFilter>('all');
  const goods = useGoods();

  const refresh = async () => {
    await queryClient.refetchQueries({ queryKey: [club, 'goods'], type: 'active' });
  };

  const newItem = () => router.push({ pathname: '/manage/goods/edit', params: category && category !== 'none' ? { categoryId: category } : {} });

  return (
    <>
      <Stack.Title>Товары</Stack.Title>
      {tab === 'menu' && (
        <Stack.Toolbar placement="right">
          <ToolbarButton icon="folder" accessibilityLabel="Категории" onPress={() => router.push('/manage/goods/categories')} />
          <ToolbarMenu icon="plus" accessibilityLabel="Создать">
            <ToolbarMenuAction icon="cup.and.saucer" onPress={newItem}>
              Позиция
            </ToolbarMenuAction>
            <ToolbarMenuAction icon="folder.badge.plus" onPress={() => router.push('/manage/goods/category')}>
              Категория
            </ToolbarMenuAction>
          </ToolbarMenu>
        </Stack.Toolbar>
      )}
      {tab === 'stock' && (
        <Stack.Toolbar placement="right">
          <ToolbarButton
            icon="plus"
            accessibilityLabel="Новое сырьё"
            onPress={() => router.push({ pathname: '/manage/goods/edit', params: { kind: 'ingredient' } })}
          />
        </Stack.Toolbar>
      )}

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(refresh)]}>
          {tabs.length > 1 && tab && (
            <Section>
              <Picker
                selection={tab}
                onSelectionChange={(value) => {
                  haptic.selection();
                  setPicked(value as Tab);
                  setQuery('');
                }}
                modifiers={[pickerStyle('segmented')]}
              >
                {tabs.map((t) => (
                  <Text key={t} modifiers={[tag(t)]}>
                    {TAB_TITLES[t]}
                  </Text>
                ))}
              </Picker>
            </Section>
          )}

          {!tab ? (
            <Section>
              <ContentUnavailableView title="Нет доступа" systemImage="lock" description="Меню и склад закрыты для вашей роли — попросите владельца." />
            </Section>
          ) : tab === 'operations' ? (
            <OperationsTab />
          ) : !goods.data ? (
            <Section>
              {goods.isError ? (
                <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={goods.error.message} />
              ) : (
                <ProgressView />
              )}
            </Section>
          ) : tab === 'menu' ? (
            <MenuTab catalog={goods.data} query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
          ) : (
            <StockTab catalog={goods.data} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} />
          )}
        </Form>
      </Host>
    </>
  );
}
