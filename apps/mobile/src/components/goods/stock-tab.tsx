import { ContentUnavailableView, Section, Text } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { matches } from '@/components/goods/menu-tab';
import { StockRow } from '@/components/goods/parts';
import { SearchRow } from '@/components/native-form';
import { Text as RNText } from '@/components/text';
import { isTariffCategory } from '@/lib/catalog-api';
import { formatMoney } from '@/lib/format';
import { LEVEL_LOOK, isStockItem, stockLevel, type Catalog, type GoodsItem } from '@/lib/goods-api';
import { haptic } from '@/lib/haptics';
import { FONT_SCALE_MAX } from '@/lib/text-scale';
import { colors, space, type } from '@/lib/theme';

export type StockFilter = 'all' | 'low' | 'out';

const RAW = 'raw';
const NONE = 'none';

/**
 * Вкладка «Остатки»: сколько есть. Сверху — стоимость склада и счётчики «заканчивается» /
 * «нет», они же фильтр (одно место, без дублей). Ниже — штучные товары по категориям и
 * сырьё отдельной группой. Позиции без учёта сюда не попадают — их запас не ведётся.
 */
export function StockTab({
  catalog,
  query,
  onQuery,
  filter,
  onFilter,
}: {
  catalog: Catalog;
  query: string;
  onQuery: (q: string) => void;
  filter: StockFilter;
  onFilter: (f: StockFilter) => void;
}) {
  const router = useRouter();
  const q = query.trim().toLowerCase();
  const stock = useMemo(() => catalog.items.filter(isStockItem), [catalog.items]);

  const summary = useMemo(() => {
    let value = 0;
    let low = 0;
    let out = 0;
    for (const item of stock) {
      value += Math.max(0, item.stockQuantity) * item.costPrice;
      const level = stockLevel(item);
      if (level === 'low') low++;
      if (level === 'out') out++;
    }
    return { value, low, out };
  }, [stock]);

  // Сколько позиций меню собираются из каждого сырья — подпись «в 3 позициях».
  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of catalog.items) for (const line of item.recipe) map.set(line.componentId, (map.get(line.componentId) ?? 0) + 1);
    return map;
  }, [catalog.items]);

  const groups = useMemo(() => {
    const visible = stock.filter((item) => matches(item, q) && (filter === 'all' || stockLevel(item) === filter));
    const categories = catalog.categories.filter((c) => !isTariffCategory(c));
    const known = new Set(categories.map((c) => c.id));
    const keyOf = (item: GoodsItem) => (item.kind === 'ingredient' ? RAW : item.category && known.has(item.category) ? item.category : NONE);
    const order = [...categories.map((c) => ({ id: c.id, title: c.name })), { id: NONE, title: 'Без категории' }, { id: RAW, title: 'Сырьё' }];
    return order.map((g) => ({ ...g, items: visible.filter((i) => keyOf(i) === g.id) })).filter((g) => g.items.length > 0);
  }, [stock, q, filter, catalog.categories]);

  const open = (item: GoodsItem) => router.push({ pathname: '/manage/goods/[itemId]', params: { itemId: item.id, name: item.name } });
  const toggle = (next: StockFilter) => {
    haptic.selection();
    onFilter(filter === next ? 'all' : next);
  };

  if (stock.length === 0) {
    return (
      <Section>
        <ContentUnavailableView
          title="Остатки не ведутся"
          systemImage="shippingbox"
          description="Включите учёт штуками или по составу в карточке позиции меню, а сырьё (зёрна, молоко, табак) добавьте кнопкой «+»."
        />
      </Section>
    );
  }

  return (
    <>
      <Section>
        <View style={styles.summary}>
          <View>
            <RNText style={[type.footnote, styles.secondary]}>На складе по себестоимости</RNText>
            <RNText style={[type.title2, type.amount, styles.label]} maxFontSizeMultiplier={FONT_SCALE_MAX.display}>
              {formatMoney(summary.value)}
            </RNText>
          </View>
          <View style={styles.counters}>
            <Counter label="Заканчивается" value={summary.low} color={LEVEL_LOOK.low.color} active={filter === 'low'} onPress={() => toggle('low')} />
            <Counter label="Нет" value={summary.out} color={LEVEL_LOOK.out.color} active={filter === 'out'} onPress={() => toggle('out')} />
          </View>
        </View>
      </Section>

      <Section>
        <SearchRow placeholder="Товар или сырьё" onChange={onQuery} />
      </Section>

      {groups.length === 0 ? (
        <Section>
          <ContentUnavailableView
            title={q ? 'Ничего не нашли' : 'Всё в порядке'}
            systemImage={q ? 'magnifyingglass' : 'checkmark.seal'}
            description={q ? 'Измените запрос.' : filter === 'out' ? 'Закончившихся позиций нет.' : 'Ничего не заканчивается.'}
          />
        </Section>
      ) : (
        groups.map((group) => (
          <Section key={group.id} title={`${group.title} · ${group.items.length}`}>
            {group.items.map((item) => (
              <StockRow key={item.id} item={item} usedIn={usage.get(item.id)} onPress={() => open(item)} />
            ))}
          </Section>
        ))
      )}

      <Section
        footer={
          <Text>
            Когда остаток дойдёт до точки заказа, позиция попадёт в «Заканчивается» и сотрудникам придёт уведомление. Заказать всё заканчивающееся — в приходе,
            кнопкой «Добавить заканчивающиеся».
          </Text>
        }
      >
        {null}
      </Section>
    </>
  );
}

/** Счётчик-фильтр в сводке: число цветом статуса, нажатие — показать только эти позиции. */
function Counter({ label, value, color, active, onPress }: { label: string; value: number; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.counter, active && { backgroundColor: color }, pressed && styles.pressed]}
    >
      <RNText
        style={[type.title3, type.amount, { color: active ? 'white' : value > 0 ? color : colors.secondaryLabel }]}
        maxFontSizeMultiplier={FONT_SCALE_MAX.display}
      >
        {String(value)}
      </RNText>
      <RNText style={[type.caption1, active ? styles.white : styles.secondary]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE_MAX.compact}>
        {label}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.md },
  counters: { flexDirection: 'row', gap: space.sm },
  counter: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.fill,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  white: { color: 'white' },
});
