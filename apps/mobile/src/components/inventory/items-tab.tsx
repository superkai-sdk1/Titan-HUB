import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassCard, GlassChip, sheetStyles } from '@/components/new-check-parts';
import { haptic } from '@/lib/haptics';
import { isPhysical, STOCK_LOOK, stockLevel, thresholdOf, useInventory, useMenuCategories, type InventoryItem } from '@/lib/inventory-api';
import { colors, space, type } from '@/lib/theme';

export type ItemsFilter = 'all' | 'low' | 'out' | 'untracked';

/**
 * Остатки товаров по категориям меню: поиск, фильтры «мало / нет / без учёта», у каждой
 * позиции — остаток, статус и полоса заполнения. Тап открывает карточку товара.
 */
export function ItemsTab({ filter, onFilter, query }: { filter: ItemsFilter; onFilter: (filter: ItemsFilter) => void; query: string }) {
  const router = useRouter();
  const inventory = useInventory();
  const categories = useMenuCategories();

  const goods = useMemo(() => (inventory.data ?? []).filter((item) => isPhysical(item, categories.data)), [inventory.data, categories.data]);
  const counts = useMemo(
    () => ({
      all: goods.length,
      low: goods.filter((i) => stockLevel(i) === 'low').length,
      out: goods.filter((i) => stockLevel(i) === 'out').length,
      untracked: goods.filter((i) => !i.trackStock).length,
    }),
    [goods],
  );

  const q = query.trim().toLowerCase();
  const visible = goods.filter((item) => {
    const level = stockLevel(item);
    if (filter === 'low' && level !== 'low') return false;
    if (filter === 'out' && level !== 'out') return false;
    if (filter === 'untracked' && item.trackStock) return false;
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || (item.searchTags ?? []).some((t) => t.toLowerCase().includes(q));
  });
  const maxStock = Math.max(1, ...visible.filter((i) => i.trackStock).map((i) => i.stockQuantity));

  const groups = useMemo(() => {
    const order = new Map((categories.data ?? []).map((c, index) => [c.id, { name: c.name, index }]));
    const map = new Map<string, InventoryItem[]>();
    for (const item of visible) {
      const key = item.category && order.has(item.category) ? item.category : 'none';
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .map(([key, items]) => ({ key, title: order.get(key)?.name ?? 'Без категории', index: order.get(key)?.index ?? 999, items }))
      .sort((a, b) => a.index - b.index);
  }, [visible, categories.data]);

  const chips: { key: ItemsFilter; label: string; tint?: string }[] = [
    { key: 'all', label: `Все · ${counts.all}` },
    { key: 'low', label: `Мало · ${counts.low}`, tint: STOCK_LOOK.low.color },
    { key: 'out', label: `Нет · ${counts.out}`, tint: STOCK_LOOK.out.color },
    { key: 'untracked', label: `Без учёта · ${counts.untracked}`, tint: STOCK_LOOK.untracked.color },
  ];

  return (
    <View style={styles.tab}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
        {chips.map((chip) => (
          <GlassChip
            key={chip.key}
            label={chip.label}
            tint={chip.tint ?? colors.accent}
            active={filter === chip.key}
            onPress={() => {
              haptic.selection();
              onFilter(chip.key);
            }}
          />
        ))}
      </ScrollView>

      {inventory.isLoading ? (
        <ActivityIndicator style={styles.state} />
      ) : groups.length === 0 ? (
        <Text style={[type.subhead, styles.secondary, styles.empty]}>{q || filter !== 'all' ? 'Ничего не нашли' : 'Товаров на складе нет'}</Text>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`${group.title.toUpperCase()} · ${group.items.length}`}</Text>
            <GlassCard>
              {group.items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                  <ItemRow
                    item={item}
                    maxStock={maxStock}
                    onPress={() => {
                      haptic.selection();
                      router.push({ pathname: '/manage/inventory/[itemId]', params: { itemId: item.id, name: item.name } });
                    }}
                  />
                </View>
              ))}
            </GlassCard>
          </View>
        ))
      )}
    </View>
  );
}

function ItemRow({ item, maxStock, onPress }: { item: InventoryItem; maxStock: number; onPress: () => void }) {
  const level = stockLevel(item);
  const look = STOCK_LOOK[level];
  const threshold = thresholdOf(item);
  const caption = item.trackStock
    ? [threshold > 0 ? `точка заказа ${threshold}` : null, item.parLevel ? `целевой ${item.parLevel}` : null].filter(Boolean).join(' · ') || 'порог не задан'
    : 'остатки не учитываются';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && sheetStyles.pressedRow]} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.stockQuantity} шт`}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <Text style={[type.body, styles.label, !item.isActive && styles.inactive]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
            {caption}
          </Text>
        </View>
        {item.trackStock ? (
          <View style={styles.qty}>
            <Text style={[type.title3, type.amount, { color: level === 'out' || level === 'low' ? look.color : colors.label }]}>{item.stockQuantity}</Text>
            <Text style={[type.caption1, styles.secondary]}>шт</Text>
          </View>
        ) : null}
        <View style={[styles.badge, { backgroundColor: `${look.color}24` }]}>
          <Text style={[type.caption2, styles.badgeText, { color: look.color }]}>{look.label}</Text>
        </View>
      </View>
      {item.trackStock && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(2, (Math.max(0, item.stockQuantity) / maxStock) * 100)}%`, backgroundColor: look.color }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: { gap: space.md },
  flex: { flex: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  inactive: { color: colors.secondaryLabel },
  chips: { flexGrow: 0, flexShrink: 0, height: 44, marginHorizontal: -space.lg },
  chipsContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  state: { paddingVertical: space.xxl },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  group: { gap: space.sm },
  separator: { marginLeft: space.lg },
  row: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  qty: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, minWidth: 44, alignItems: 'center' },
  badgeText: { fontWeight: '700' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
