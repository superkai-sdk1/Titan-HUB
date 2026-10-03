import { Button, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit } from '@expo/ui/swift-ui/modifiers';

import { primary, secondary } from '@/components/native-form';
import type { AdminMenuItem } from '@/lib/catalog-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { MenuCategory } from '@/lib/pos-api';
import { colors } from '@/lib/theme';

/**
 * Позиция меню в нативном списке: название, признаки одной строкой (скрыта, хит, услуга,
 * остаток, Titan Home, категория), справа цена и маржа.
 */
export function MenuItemLine({ item, category, onPress }: { item: AdminMenuItem; category?: MenuCategory; onPress: () => void }) {
  const price = toNumber(item.price);
  const cost = toNumber(item.costPrice);
  const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null;
  const stock = item.stockQuantity;
  const tags = [
    !item.isActive ? 'скрыта' : null,
    item.isTop ? 'хит' : null,
    item.isService ? 'услуга' : null,
    item.trackStock ? (stock <= 0 ? 'нет на складе' : `${stock} шт`) : null,
    item.isTabletVisible ? 'в Titan Home' : null,
    category?.name ?? null,
  ].filter(Boolean);

  return (
    <Button
      onPress={() => {
        haptic.selection();
        onPress();
      }}>
      <HStack spacing={10}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[item.isActive ? primary : secondary, lineLimit(1)]}>{item.name}</Text>
          {tags.length > 0 ? (
            <Text modifiers={[font({ textStyle: 'footnote' }), item.trackStock && stock <= 0 ? foregroundStyle(colors.red) : secondary, lineLimit(1)]}>{tags.join(' · ')}</Text>
          ) : null}
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={1}>
          <Text modifiers={[primary, font({ weight: 'semibold' }), monospacedDigit()]}>{formatMoney(price, { kopecks: 'auto' })}</Text>
          {margin !== null ? <Text modifiers={[font({ textStyle: 'caption' }), margin < 0 ? foregroundStyle(colors.red) : secondary]}>{`маржа ${margin}%`}</Text> : null}
        </VStack>
      </HStack>
    </Button>
  );
}
