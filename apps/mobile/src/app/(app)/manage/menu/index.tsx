import { ContentUnavailableView, Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { MenuItemLine } from '@/components/menu-item-line';
import { LinkRow, SearchRow } from '@/components/native-form';
import { useDebounced } from '@/components/player-picker';
import { ToolbarButton, ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';
import { categoryHex, categorySymbol, useMenuAdmin } from '@/lib/catalog-api';
import { plural } from '@/lib/format';

/**
 * Меню клуба: категории папками (нажатие — позиции), поиск по всем позициям,
 * новая позиция или категория — «+», порядок категорий — кнопкой в шапке.
 */
export default function MenuAdminScreen() {
  const router = useRouter();
  const menu = useMenuAdmin();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200).trim().toLowerCase();
  const data = menu.data;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const ids = new Set((data?.categories ?? []).map((c) => c.id));
    for (const item of data?.items ?? []) {
      const key = item.category && ids.has(item.category) ? item.category : 'none';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const found = search
    ? (data?.items ?? []).filter((i) => i.name.toLowerCase().includes(search) || (i.searchTags ?? []).some((t) => t.toLowerCase().includes(search)))
    : [];
  const categories = data
    ? [...data.categories, ...((counts.get('none') ?? 0) > 0 ? [{ id: 'none', name: 'Без категории', icon: 'other', color: '#94A3B8', isTabletVisible: true }] : [])]
    : [];

  return (
    <>
      <Stack.Title>Меню</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton icon="arrow.up.arrow.down" accessibilityLabel="Порядок категорий" onPress={() => router.push({ pathname: '/manage/menu/reorder', params: { scope: 'categories' } })} />
        <ToolbarMenu icon="plus" accessibilityLabel="Создать">
          <ToolbarMenuAction icon="cup.and.saucer" onPress={() => router.push('/manage/menu/item')}>
            Позиция
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="folder.badge.plus" onPress={() => router.push('/manage/menu/category')}>
            Категория
          </ToolbarMenuAction>
        </ToolbarMenu>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await menu.refetch()))]}>
          <Section>
            <SearchRow placeholder="Название или тег позиции" onChange={setQuery} />
          </Section>

          {!data ? (
            <Section>{menu.isError ? <ContentUnavailableView title="Меню не загрузилось" systemImage="wifi.exclamationmark" description={menu.error.message} /> : <ProgressView />}</Section>
          ) : search ? (
            <Section title={`Найдено · ${found.length}`}>
              {found.length === 0 ? (
                <ContentUnavailableView title="Ничего не нашли" systemImage="magnifyingglass" />
              ) : (
                found.map((item) => (
                  <MenuItemLine
                    key={item.id}
                    item={item}
                    category={data.categories.find((c) => c.id === item.category)}
                    onPress={() => router.push({ pathname: '/manage/menu/item', params: { itemId: item.id } })}
                  />
                ))
              )}
            </Section>
          ) : (
            <Section
              title="Категории"
              footer={
                <Text>
                  {`${data.categories.length} ${plural(data.categories.length, ['категория', 'категории', 'категорий'])} · ${data.items.length} ${plural(data.items.length, ['позиция', 'позиции', 'позиций'])}. Тарифы настраиваются в «Тарифах и аренде».`}
                </Text>
              }>
              {categories.length === 0 ? (
                <ContentUnavailableView title="Категорий нет" systemImage="folder" description="Создайте первую категорию кнопкой «+»." />
              ) : (
                categories.map((category) => (
                  <LinkRow
                    key={category.id}
                    icon={categorySymbol(category.icon)}
                    color={categoryHex(category.color)}
                    title={category.name}
                    subtitle={category.id !== 'none' && category.isTabletVisible === false ? 'скрыта в Titan Home' : undefined}
                    value={String(counts.get(category.id) ?? 0)}
                    onPress={() => router.push({ pathname: '/manage/menu/[categoryId]', params: { categoryId: category.id, name: category.name } })}
                  />
                ))
              )}
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
