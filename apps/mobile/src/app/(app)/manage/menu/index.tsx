import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { MenuItemRow } from '@/components/menu-item-row';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { useDebounced } from '@/components/player-picker';
import { Unavailable } from '@/components/unavailable';
import { categoryHex, categorySymbol, useMenuAdmin } from '@/lib/catalog-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton, ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

/**
 * Меню клуба: категории папками (тап — позиции), поиск по всем позициям в шапке,
 * новая позиция или категория — «+», порядок категорий — перетаскиванием.
 */
export default function MenuAdminScreen() {
  const gutter = usePageGutter();
  const searchClearance = useSearchClearance();
  const router = useRouter();
  const menu = useMenuAdmin();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200).trim().toLowerCase();
  const [pulling, setPulling] = useState(false);
  const data = menu.data;

  const refresh = async () => {
    setPulling(true);
    await menu.refetch();
    setPulling(false);
  };

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

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Меню</Stack.Title>
      <Stack.SearchBar placement="integrated" placeholder="Название или тег позиции" onChangeText={(event) => setQuery(event.nativeEvent.text)} onCancelButtonPress={() => setQuery('')} />
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

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, { paddingBottom: searchClearance }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        {!data ? (
          menu.isError ? (
            <View style={styles.empty}>
              <Unavailable title="Меню не загрузилось" systemImage="wifi.exclamationmark" description={menu.error.message} />
            </View>
          ) : (
            <ActivityIndicator style={styles.loading} />
          )
        ) : search ? (
          <>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`НАЙДЕНО · ${found.length}`}</Text>
            {found.length === 0 ? (
              <Text style={[type.subhead, styles.secondary, styles.centered]}>Ничего не нашли</Text>
            ) : (
              <GlassCard>
                {found.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.itemSeparator]} />}
                    <MenuItemRow item={item} category={data.categories.find((c) => c.id === item.category)} onPress={() => router.push({ pathname: '/manage/menu/item', params: { itemId: item.id } })} />
                  </View>
                ))}
              </GlassCard>
            )}
          </>
        ) : (
          <>
            <Text style={[type.footnote, styles.caption]}>
              {`${data.categories.length} ${plural(data.categories.length, ['категория', 'категории', 'категорий'])} · ${data.items.length} ${plural(data.items.length, ['позиция', 'позиции', 'позиций'])}. Тарифы настраиваются в «Тарифах и аренде».`}
            </Text>
            {data.categories.length === 0 ? (
              <View style={styles.empty}>
                <Unavailable title="Категорий нет" systemImage="folder" description="Создайте первую категорию кнопкой «+»." />
              </View>
            ) : (
              <GlassCard>
                {[...data.categories, ...((counts.get('none') ?? 0) > 0 ? [{ id: 'none', name: 'Без категории', icon: 'other', color: '#94A3B8', isTabletVisible: true }] : [])].map((category, index) => {
                  const color = categoryHex(category.color);
                  const count = counts.get(category.id) ?? 0;
                  return (
                    <View key={category.id}>
                      {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                      <Pressable
                        onPress={() => {
                          haptic.selection();
                          router.push({ pathname: '/manage/menu/[categoryId]', params: { categoryId: category.id, name: category.name } });
                        }}
                        style={({ pressed }) => [styles.row, pressed && sheetStyles.pressedRow]}
                        accessibilityRole="button">
                        <View style={[styles.icon, { backgroundColor: color }]}>
                          <SymbolView name={categorySymbol(category.icon)} size={17} weight="semibold" tintColor="white" />
                        </View>
                        <View style={styles.flex}>
                          <Text style={[type.body, styles.label]} numberOfLines={1}>
                            {category.name}
                          </Text>
                          {category.id !== 'none' && category.isTabletVisible === false && <Text style={[type.caption1, styles.secondary]}>скрыта с планшета</Text>}
                        </View>
                        <Text style={[type.subhead, styles.secondary]}>{count}</Text>
                        <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
                      </Pressable>
                    </View>
                  );
                })}
              </GlassCard>
            )}
          </>
        )}
      </ScrollView>
      <BottomSearch value={query} onChange={setQuery} placeholder="Название или тег позиции" />
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center', paddingVertical: space.xl },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  loading: { paddingTop: 60 },
  empty: { height: 360 },
  separator: { marginLeft: 62 },
  itemSeparator: { marginLeft: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
  icon: { width: 34, height: 34, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
});
