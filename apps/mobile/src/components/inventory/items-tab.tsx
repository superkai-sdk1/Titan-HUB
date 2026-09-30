import { Button, ContentUnavailableView, HStack, Image, Picker, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { footnote, primary, SearchRow, secondary, tertiary } from '@/components/native-form';
import { haptic } from '@/lib/haptics';
import { isPhysical, STOCK_LOOK, stockLevel, thresholdOf, useInventory, useMenuCategories, type InventoryItem } from '@/lib/inventory-api';

export type ItemsFilter = 'all' | 'alarm' | 'low' | 'out' | 'untracked';

const FILTERS: { key: ItemsFilter; label: string }[] = [
  { key: 'all', label: 'Все товары' },
  { key: 'alarm', label: 'Пора дозаказать' },
  { key: 'low', label: 'Заканчивается' },
  { key: 'out', label: 'Нет в наличии' },
  { key: 'untracked', label: 'Без учёта' },
];

/**
 * Остатки товаров по категориям меню: поиск строкой, фильтр «заканчивается / нет / без
 * учёта» системным меню. У позиции — остаток цветом статуса; тап открывает карточку товара.
 */
export function ItemsTab({ filter, onFilter, onQuery, query }: { filter: ItemsFilter; onFilter: (filter: ItemsFilter) => void; onQuery: (query: string) => void; query: string }) {
  const router = useRouter();
  const inventory = useInventory();
  const categories = useMenuCategories();

  const goods = useMemo(() => (inventory.data ?? []).filter((item) => isPhysical(item, categories.data)), [inventory.data, categories.data]);
  const counts: Record<ItemsFilter, number> = useMemo(
    () => ({
      all: goods.length,
      alarm: goods.filter((i) => stockLevel(i) === 'low' || stockLevel(i) === 'out').length,
      low: goods.filter((i) => stockLevel(i) === 'low').length,
      out: goods.filter((i) => stockLevel(i) === 'out').length,
      untracked: goods.filter((i) => !i.trackStock).length,
    }),
    [goods],
  );

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = goods.filter((item) => {
      const level = stockLevel(item);
      if (filter === 'alarm' && level !== 'low' && level !== 'out') return false;
      if (filter === 'low' && level !== 'low') return false;
      if (filter === 'out' && level !== 'out') return false;
      if (filter === 'untracked' && item.trackStock) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || (item.searchTags ?? []).some((t) => t.toLowerCase().includes(q));
    });
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
  }, [goods, filter, q, categories.data]);

  return (
    <>
      <Section>
        <SearchRow placeholder="Название или тег" onChange={onQuery} />
        <Picker
          label="Показать"
          selection={filter}
          onSelectionChange={(value) => {
            haptic.selection();
            onFilter(value as ItemsFilter);
          }}
          modifiers={[pickerStyle('menu')]}>
          {FILTERS.map((f) => (
            <Text key={f.key} modifiers={[tag(f.key)]}>
              {`${f.label} · ${counts[f.key]}`}
            </Text>
          ))}
        </Picker>
      </Section>

      {inventory.isLoading ? (
        <Section>
          <ProgressView />
        </Section>
      ) : groups.length === 0 ? (
        <Section>
          {inventory.isError ? (
            <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={inventory.error.message} />
          ) : (
            <ContentUnavailableView
              title={q || filter !== 'all' ? 'Ничего не нашли' : 'Товаров на складе нет'}
              systemImage={q ? 'magnifyingglass' : filter === 'all' ? 'shippingbox' : 'checkmark.seal'}
              description={q || filter !== 'all' ? 'Измените запрос или фильтр.' : 'Товары — это позиции меню, кроме услуг, тарифов и аренды.'}
            />
          )}
        </Section>
      ) : (
        groups.map((group) => (
          <Section key={group.key} title={`${group.title} · ${group.items.length}`}>
            {group.items.map((item) => (
              <ItemLine
                key={item.id}
                item={item}
                onPress={() => router.push({ pathname: '/manage/inventory/[itemId]', params: { itemId: item.id, name: item.name } })}
              />
            ))}
          </Section>
        ))
      )}
    </>
  );
}

/** Строка товара: название, пороги, остаток цветом статуса и шеврон. */
function ItemLine({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const level = stockLevel(item);
  const look = STOCK_LOOK[level];
  const threshold = thresholdOf(item);
  const caption = item.trackStock
    ? [threshold > 0 ? `точка заказа ${threshold}` : null, item.parLevel ? `целевой ${item.parLevel}` : null].filter(Boolean).join(' · ') || 'порог не задан'
    : 'остатки не учитываются';
  const alarm = level === 'out' || level === 'low';

  return (
    <Button
      onPress={() => {
        haptic.selection();
        onPress();
      }}>
      <HStack spacing={12}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[item.isActive ? primary : secondary, lineLimit(1)]}>{item.name}</Text>
          <Text modifiers={[footnote, secondary, lineLimit(1)]}>{caption}</Text>
        </VStack>
        <Spacer />
        {item.trackStock ? (
          <VStack alignment="trailing" spacing={1}>
            <Text modifiers={[font({ weight: 'semibold', design: 'rounded' }), monospacedDigit(), alarm ? foregroundStyle(look.color) : primary]}>{`${item.stockQuantity} шт`}</Text>
            <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), foregroundStyle(look.color)]}>{look.label}</Text>
          </VStack>
        ) : (
          <Text modifiers={[footnote, foregroundStyle(look.color)]}>{look.label}</Text>
        )}
        <Image systemName="chevron.right" size={13} modifiers={[tertiary, font({ weight: 'semibold' })]} />
      </HStack>
    </Button>
  );
}
