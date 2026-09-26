import { useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppRefreshControl } from '@/components/refresh-control';
import { money, QueryState } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { TierBadge } from '@/components/client-row';
import { Avatar, GlassCard } from '@/components/new-check-parts';
import { useSegmentMembers, type SegmentKey } from '@/lib/analytics-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseStockDate } from '@/lib/inventory-api';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

const TITLES: Record<SegmentKey, { title: string; caption: string }> = {
  new: { title: 'Новые', caption: 'Клиенты, заведённые за последние 30 дней и ещё без закрытых чеков.' },
  active: { title: 'Активные', caption: 'Последний визит меньше 14 дней назад. Траты — за 90 дней.' },
  sleeping: { title: 'Спящие', caption: 'Не приходили 14 дней и больше, но были за последние 90. Стоит позвать обратно.' },
};

const lastVisitFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });

/** Игроки сегмента; тап открывает карточку игрока. */
export default function SegmentScreen() {
  const gutter = usePageGutter();
  const [pulling, setPulling] = useState(false);
  const { segment } = useLocalSearchParams<{ segment: SegmentKey }>();
  const router = useRouter();
  const key: SegmentKey = segment === 'active' || segment === 'sleeping' ? segment : 'new';
  const members = useSegmentMembers(key);
  const tiers = useClientTiers();
  // Сервер группирует и обезличенные чеки — строку без игрока не показываем.
  const list = (members.data?.players ?? []).filter((p) => p.playerId);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([members.refetch()]);
    setPulling(false);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{TITLES[key].title}</Stack.Title>
      <FlashList
        data={members.data ? list : []}
        keyExtractor={(p) => p.playerId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[type.subhead, styles.secondary]}>{TITLES[key].caption}</Text>
            <QueryState loading={!members.data} error={members.error}>
              <Text style={[type.footnote, styles.tertiary]}>{`${list.length} ${plural(list.length, ['игрок', 'игрока', 'игроков'])}`}</Text>
            </QueryState>
          </View>
        }
        ListEmptyComponent={members.data ? <Text style={[type.subhead, styles.secondary, styles.empty]}>В сегменте пока никого</Text> : null}
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => {
          const look = tierLook(item.clientTier ?? 'guest', tiers.data);
          const last = item.lastVisit ? parseStockDate(item.lastVisit) : null;
          return (
            <Pressable
              onPress={() => {
                haptic.selection();
                router.push({ pathname: '/analytics/player/[playerId]', params: { playerId: item.playerId, ...(item.photoUrl ? { photo: item.photoUrl } : {}) } });
              }}
              accessibilityRole="button">
              <GlassCard style={styles.row}>
                <Avatar name={item.nickname ?? '··'} photoUrl={item.photoUrl} size={40} />
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={[type.body, styles.label, styles.shrink]} numberOfLines={1}>
                      {item.nickname ?? 'Игрок'}
                    </Text>
                    {item.clientTier && <TierBadge label={look.label} color={look.color} />}
                  </View>
                  <Text style={[type.footnote, styles.secondary]}>
                    {key === 'new' ? 'ещё не приходил' : `${item.visits} ${plural(item.visits, ['чек', 'чека', 'чеков'])}${last ? ` · был ${lastVisitFormat.format(last).replace('.', '')}` : ''}`}
                  </Text>
                </View>
                {key !== 'new' && <Text style={[type.body, type.amount, styles.label]}>{money(item.total)}</Text>}
              </GlassCard>
            </Pressable>
          );
        }}
      />
    </AmbientBackdrop>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140 },
  header: { gap: space.xs, paddingBottom: space.md, paddingHorizontal: space.xs },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gap: { height: space.sm },
});
