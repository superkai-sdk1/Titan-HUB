import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sheetStyles } from '@/components/new-check-parts';
import type { AdminMenuItem } from '@/lib/catalog-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { MenuCategory } from '@/lib/pos-api';
import { colors, space, type } from '@/lib/theme';

/** Строка позиции меню: название и признаки, цена и маржа, остаток при учёте. */
export function MenuItemRow({ item, category, onPress }: { item: AdminMenuItem; category?: MenuCategory; onPress: () => void }) {
  const price = toNumber(item.price);
  const cost = toNumber(item.costPrice);
  const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null;
  const stock = item.stockQuantity;

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.row, !item.isActive && styles.inactive, pressed && sheetStyles.pressedRow]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatMoney(price)}`}>
      <View style={styles.flex}>
        <Text style={[type.body, styles.label]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.badges}>
          {!item.isActive && <Badge text="скрыта" color="#94A3B8" />}
          {item.isTop && <Badge text="хит" color="#F59E0B" />}
          {item.isService && <Badge text="услуга" color="#06B6D4" />}
          {item.trackStock && <Badge text={stock <= 0 ? 'нет на складе' : `${stock} шт`} color={stock <= 0 ? '#F43F5E' : '#10B981'} />}
          {item.isTabletVisible && <Badge text="планшет" color="#8B5CF6" />}
          {category && <Text style={[type.caption1, styles.secondary]}>{category.name}</Text>}
        </View>
      </View>
      <View style={styles.price}>
        <Text style={[type.headline, type.amount, styles.label]}>{formatMoney(price, { kopecks: 'auto' })}</Text>
        {margin !== null && <Text style={[type.caption1, margin < 0 ? styles.red : styles.secondary]}>{`маржа ${margin}%`}</Text>}
      </View>
    </Pressable>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
      <Text style={[type.caption2, styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  inactive: { opacity: 0.6 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  red: { color: colors.red },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 3 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  badgeText: { fontWeight: '700' },
  price: { alignItems: 'flex-end' },
});
