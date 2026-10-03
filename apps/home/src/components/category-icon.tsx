// Иконки и цвета категорий меню — пресеты веб-кассы (apps/web/src/components/CategoryIcon.tsx)
// в MaterialCommunityIcons, цвета как в Titan HUB (catalog-api.ts).
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './ui';

const PRESETS: Record<string, { icon: IconName; color: string }> = {
  cold_drinks: { icon: 'bottle-soda-classic-outline', color: '#06B6D4' },
  hot_drinks: { icon: 'coffee-outline', color: '#F97316' },
  snacks: { icon: 'popcorn', color: '#F59E0B' },
  tariffs: { icon: 'ticket-outline', color: '#8B5CF6' },
  food: { icon: 'silverware-fork-knife', color: '#10B981' },
  hookah: { icon: 'smoke', color: '#F43F5E' },
  desserts: { icon: 'cake-variant-outline', color: '#EC4899' },
  cocktails: { icon: 'glass-cocktail', color: '#6366F1' },
  beer: { icon: 'glass-mug-variant', color: '#D97706' },
  lemonade: { icon: 'cup-outline', color: '#65A30D' },
  coffee: { icon: 'coffee', color: '#C2410C' },
  tea: { icon: 'tea-outline', color: '#0D9488' },
  breakfast: { icon: 'egg-fried', color: '#CA8A04' },
  pizza: { icon: 'pizza', color: '#DC2626' },
  games: { icon: 'dice-multiple-outline', color: '#2563EB' },
  vip: { icon: 'crown-outline', color: '#7C3AED' },
  rental: { icon: 'timer-outline', color: '#64748B' },
  events: { icon: 'party-popper', color: '#A855F7' },
  sweets: { icon: 'candy-outline', color: '#C026D3' },
  other: { icon: 'view-grid-outline', color: '#475569' },
};

const LEGACY_COLORS: Record<string, string> = {
  violet: '#8B5CF6', slate: '#94A3B8', orange: '#F97316', emerald: '#10B981', rose: '#F43F5E',
  amber: '#F59E0B', blue: '#3B82F6', indigo: '#6366F1', pink: '#EC4899', cyan: '#06B6D4',
};

export function categoryLook(icon?: string | null, color?: string | null): { icon: IconName; color: string } {
  const preset = icon ? PRESETS[icon] : undefined;
  const hex = color ? LEGACY_COLORS[color] ?? (/^#[0-9a-f]{6}$/i.test(color) ? color : null) : null;
  return { icon: preset?.icon ?? 'silverware-variant', color: hex ?? preset?.color ?? '#8B5CF6' };
}

/** Квадрат с иконкой категории — вместо фото у позиций без картинки. */
export function CategoryBadge({ icon, color, size = 48 }: { icon?: string | null; color?: string | null; size?: number }) {
  const look = categoryLook(icon, color);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: `${look.color}22` }]}>
      <Icon name={look.icon} size={size * 0.55} color={look.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
