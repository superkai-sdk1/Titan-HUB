import { ContentUnavailableView, Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { MenuItemLine } from '@/components/menu-item-line';
import { ActionRow, SearchRow } from '@/components/native-form';
import { useDebounced } from '@/components/player-picker';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';
import { deleteCategory, useMenuAdmin } from '@/lib/catalog-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Позиции категории в порядке меню; правка категории, порядок и удаление — в меню шапки. */
export default function MenuCategoryScreen() {
  const { categoryId, name } = useLocalSearchParams<{ categoryId: string; name?: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const menu = useMenuAdmin();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200).trim().toLowerCase();
  const data = menu.data;

  const uncategorized = categoryId === 'none';
  const category = data?.categories.find((c) => c.id === categoryId);
  const ids = new Set((data?.categories ?? []).map((c) => c.id));
  const inCategory = (data?.items ?? []).filter((i) => (uncategorized ? !i.category || !ids.has(i.category) : i.category === categoryId));
  const items = search ? inCategory.filter((i) => i.name.toLowerCase().includes(search) || (i.searchTags ?? []).some((t) => t.toLowerCase().includes(search))) : inCategory;

  const removeCategory = () =>
    category &&
    Alert.alert(`Удалить категорию «${category.name}»?`, inCategory.length ? `${inCategory.length} ${plural(inCategory.length, ['позиция останется', 'позиции останутся', 'позиций останутся'])} без категории.` : undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteCategory(category.id)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Категория не удалена', errorText(error))),
      },
    ]);

  return (
    <>
      <Stack.Title>{category?.name ?? name ?? 'Категория'}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="ellipsis" accessibilityLabel="Действия с категорией">
          <ToolbarMenuAction icon="arrow.up.arrow.down" onPress={() => router.push({ pathname: '/manage/menu/reorder', params: { scope: 'items', categoryId } })}>
            Порядок позиций
          </ToolbarMenuAction>
          {!uncategorized && (
            <ToolbarMenuAction icon="pencil" onPress={() => router.push({ pathname: '/manage/menu/category', params: { categoryId } })}>
              Изменить категорию
            </ToolbarMenuAction>
          )}
          {!uncategorized && isOwner && (
            <ToolbarMenuAction icon="trash" destructive onPress={removeCategory}>
              Удалить категорию
            </ToolbarMenuAction>
          )}
        </ToolbarMenu>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await menu.refetch()))]}>
          <Section>
            <SearchRow placeholder="Позиция или тег" onChange={setQuery} />
          </Section>
          <Section
            title={data ? `${items.length} ${plural(items.length, ['позиция', 'позиции', 'позиций'])}` : undefined}
            footer={<Text>Удалить позицию или скрыть её из кассы можно в её карточке.</Text>}>
            {!data ? (
              <ProgressView />
            ) : items.length === 0 ? (
              <ContentUnavailableView title={search ? 'Ничего не нашли' : 'Позиций нет'} systemImage={search ? 'magnifyingglass' : 'cup.and.saucer'} />
            ) : (
              items.map((item) => <MenuItemLine key={item.id} item={item} onPress={() => router.push({ pathname: '/manage/menu/item', params: { itemId: item.id } })} />)
            )}
            <ActionRow title="Новая позиция" icon="plus.circle.fill" onPress={() => router.push({ pathname: '/manage/menu/item', params: uncategorized ? {} : { categoryId } })} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
