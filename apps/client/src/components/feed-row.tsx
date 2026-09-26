// Строка ленты операций: деньги (₽) и бонусы (⭐) в одном списке.
import { StyleSheet, Text, View } from 'react-native';

import { bonus, clock, money, relative } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { FeedItem } from '@/lib/types';

import { Icon, IconBubble, type IconName, Tap } from './ui';

const LOOK: Record<string, { icon: IconName; color: string }> = {
  deposit: { icon: 'arrow-down-circle', color: colors.green },
  payment: { icon: 'receipt', color: colors.violetLight },
  withdrawal: { icon: 'arrow-up-circle', color: colors.amber },
  refund: { icon: 'return-down-back', color: colors.cyan },
  bonus_accrual: { icon: 'star', color: '#FACC15' },
  bonus_spend: { icon: 'sparkles', color: colors.pink },
};

export function feedLook(item: Pick<FeedItem, 'type'>) {
  return LOOK[item.type] ?? { icon: 'wallet' as IconName, color: colors.textSecondary };
}

/** dated — показать относительную дату («вчера, 14:32»): для списков без группировки по дням. */
export function FeedRow({ item, onOpenCheck, dated }: { item: FeedItem; onOpenCheck?: (checkId: string) => void; dated?: boolean }) {
  const look = feedLook(item);
  const positive = item.sign > 0;
  const amountText = item.unit === 'bonus'
    ? `${positive ? '+' : '−'}${bonus(item.amount)} ⭐`
    : money(item.sign * item.amount, true);
  const clickable = !!item.checkId && !!onOpenCheck;
  const body = (
    <View style={styles.row}>
      <IconBubble name={look.icon} color={look.color} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.sub}>{dated ? relative(item.createdAt) : clock(item.createdAt)}{clickable ? ' · чек' : ''}</Text>
      </View>
      <Text style={[styles.amount, { color: positive ? colors.greenBright : item.unit === 'bonus' ? colors.pink : colors.text }]}>
        {amountText}
      </Text>
      {clickable ? <Icon name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </View>
  );
  if (!clickable) return body;
  return (
    <Tap onPress={() => onOpenCheck!(item.checkId!)} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`${item.title}, ${amountText}. Открыть чек`}>
      {body}
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.textBody, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
