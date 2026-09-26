import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AppRefreshControl } from '@/components/refresh-control';
import { useDebounced } from '@/components/player-picker';
import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { MenuItemRow } from '@/components/menu-item-row';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { Unavailable } from '@/components/unavailable';
import { deleteCategory, deleteMenuItem, useMenuAdmin, type AdminMenuItem } from '@/lib/catalog-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton, ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

const rowLayout = LinearTransition.springify().damping(22).stiffness(220);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Позиции категории в порядке меню; правка категории, порядок перетаскиванием и удаление — в меню шапки. */
export default function MenuCategoryScreen() {
  const gutter = usePageGutter();
  const { categoryId, name } = useLocalSearchParams<{ categoryId: string; name?: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const menu = useMenuAdmin();
  const [pulling, setPulling] = useState(false);
  const [query, setQuery] = useState('');
  const searchClearance = useSearchClearance();
  const search = useDebounced(query, 200).trim().toLowerCase();
  const data = menu.data;

  const uncategorized = categoryId === 'none';
  const category = data?.categories.find((c) => c.id === categoryId);
  const ids = new Set((data?.categories ?? []).map((c) => c.id));
  const inCategory = (data?.items ?? []).filter((i) => (uncategorized ? !i.category || !ids.has(i.category) : i.category === categoryId));
  const items = search
    ? inCategory.filter((i) => i.name.toLowerCase().includes(search) || (i.searchTags ?? []).some((t) => t.toLowerCase().includes(search)))
    : inCategory;

  const refresh = async () => {
    setPulling(true);
    await menu.refetch();
    setPulling(false);
  };

  const removeItem = (item: AdminMenuItem) =>
    Alert.alert(`Удалить «${item.name}»?`, 'Позиция исчезнет из меню и кассы. Прошлые чеки сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteMenuItem(item.id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Позиция не удалена', errorText(error))),
      },
    ]);

  const removeCategory = () =>
    category &&
    Alert.alert(`Удалить категорию «${category.name}»?`, items.length ? `${items.length} ${plural(items.length, ['позиция останется', 'позиции останутся', 'позиций останутся'])} без категории.` : undefined, [
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
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{category?.name ?? name ?? 'Категория'}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton
          icon="plus"
          accessibilityLabel="Новая позиция"
          onPress={() => router.push({ pathname: '/manage/menu/item', params: uncategorized ? {} : { categoryId } })}
        />
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

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, { paddingBottom: searchClearance }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        {!data ? (
          <ActivityIndicator style={styles.loading} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable
              title={search ? 'Ничего не нашли' : 'Позиций нет'}
              systemImage={search ? 'magnifyingglass' : 'cup.and.saucer'}
              description={search ? 'Измените запрос.' : 'Добавьте позицию кнопкой «+».'}
            />
          </View>
        ) : (
          <>
            <Text style={[type.footnote, styles.caption]}>{`${items.length} ${plural(items.length, ['позиция', 'позиции', 'позиций'])}${isOwner ? ' · свайп влево — удалить' : ''}`}</Text>
            <LayoutAnimationConfig skipEntering>
              <GlassCard>
                {items.map((item, index) => (
                  <Animated.View key={item.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                    <SwipeToDelete enabled={isOwner} label="Удалить" onDelete={() => removeItem(item)}>
                      <MenuItemRow item={item} onPress={() => router.push({ pathname: '/manage/menu/item', params: { itemId: item.id } })} />
                    </SwipeToDelete>
                  </Animated.View>
                ))}
              </GlassCard>
            </LayoutAnimationConfig>
          </>
        )}
      </ScrollView>
      <BottomSearch value={query} onChange={setQuery} placeholder="Позиция или тег" />
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  loading: { paddingTop: 60 },
  empty: { height: 360 },
  separator: { marginLeft: space.lg },
});
