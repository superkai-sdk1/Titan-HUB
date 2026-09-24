import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, BalanceChips } from '@/components/new-check-parts';
import { clientPhoto, tierLook, type Client, type ClientTierRow } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { colors, space, type } from '@/lib/theme';

/** Строка клиента — интерактивное стекло: фото, ник со статусом, контакт; справа баланс и бонусы. */
export function ClientRow({
  client,
  tiers,
  onPress,
  trailing,
}: {
  client: Client;
  tiers: ClientTierRow[] | undefined;
  onPress: () => void;
  /** Своя правая часть вместо депозита и бонусов. */
  trailing?: ReactNode;
}) {
  const tier = tierLook(client.clientTier, tiers);
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${client.nickname}, ${tier.label}`}>
      <GlassView isInteractive style={[styles.row, client.deletedAt && styles.archived]}>
        <Avatar name={client.nickname} photoUrl={clientPhoto(client)} size={44} />
        <View style={styles.titles}>
          <View style={styles.titleRow}>
            <Text style={[type.headline, styles.label, styles.shrink]} numberOfLines={1}>
              {client.nickname}
            </Text>
            <TierBadge label={tier.label} color={tier.color} />
          </View>
          <Text style={[type.subhead, styles.secondary]} numberOfLines={1}>
            {client.phone || client.fullName || 'Нет телефона'}
          </Text>
        </View>
        {trailing ?? <BalanceChips balance={client.balance} bonusPoints={client.bonusPoints} />}
      </GlassView>
    </Pressable>
  );
}

export function TierBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}26` }]}>
      <Text style={[type.caption1, styles.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  archived: { opacity: 0.6 },
  titles: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shrink: { flexShrink: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontWeight: '600' },
});
