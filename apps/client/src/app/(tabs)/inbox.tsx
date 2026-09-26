// «Входящие» — лента уведомлений: операции по балансу, оплаты, статус, новости клуба.
// Открыли экран — непрочитанные помечаются прочитанными на сервере, но подсветка
// «новое» остаётся до ухода с экрана, чтобы было видно, что именно пришло.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, useManualRefresh } from '@/components/screen';
import { useTabClearance } from '@/components/tab-bar';
import { Button, EmptyState, IconBubble, type IconName, Skeleton, Tap } from '@/components/ui';
import { errorText } from '@/lib/api';
import { relative } from '@/lib/format';
import { openFromNotificationData, setBadge } from '@/lib/push';
import { useMarkRead, useNotifications } from '@/lib/queries';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';
import type { ClientNotification, NotificationKind } from '@/lib/types';

const LOOK: Record<NotificationKind, { icon: IconName; color: string }> = {
  bonus: { icon: 'star', color: '#FACC15' },
  deposit: { icon: 'wallet', color: colors.green },
  debt: { icon: 'alert-circle', color: colors.red },
  payment: { icon: 'checkmark-circle', color: colors.greenBright },
  tier: { icon: 'trophy', color: colors.violetLight },
  fund: { icon: 'people', color: colors.cyan },
  news: { icon: 'megaphone', color: colors.pink },
  system: { icon: 'notifications', color: colors.violetLight },
};

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const clearance = useTabClearance();
  const list = useNotifications();
  const markRead = useMarkRead();
  const refresh = useManualRefresh(() => list.refetch());
  // id, которые были непрочитанными при входе на экран (подсветка до ухода).
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(false);
  const marked = useRef(false);

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const unread = list.data?.pages[0]?.unread ?? 0;

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => {
      setFocused(false);
      setFresh(new Set());
      marked.current = false;
    };
  }, []));

  // Лента загрузилась на открытом экране — отмечаем прочитанным (один раз за визит).
  const markVisible = useEffectEvent(() => {
    if (marked.current) return;
    marked.current = true;
    setFresh(new Set(items.filter((n) => !n.isRead).map((n) => n.id)));
    markRead.mutate(undefined, { onSuccess: () => void setBadge(0) });
  });
  useEffect(() => {
    if (focused && unread > 0) markVisible();
  }, [focused, unread]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: clearance, paddingHorizontal: GUTTER, gap: space.md }}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} tintColor={colors.violetLight}
          colors={[colors.violet]} progressBackgroundColor={colors.surface} progressViewOffset={insets.top} />
      }
      ListHeaderComponent={
        <View style={styles.column}>
          <ScreenHeader title="Входящие" subtitle="Операции, оплаты и новости клуба" />
          {list.isLoading ? <View style={{ gap: space.md }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} />)}</View> : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={index < 12 ? FadeInDown.delay(index * 35).duration(320) : undefined} style={styles.column}>
          <NotificationCard n={item} highlighted={!item.isRead || fresh.has(item.id)} />
        </Animated.View>
      )}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
      ListEmptyComponent={
        list.isLoading ? null : list.isError ? (
          <EmptyState icon="cloud-offline" title="Не удалось загрузить" text={errorText(list.error)}>
            <Button title="Повторить" variant="secondary" onPress={() => void list.refetch()} />
          </EmptyState>
        ) : (
          <EmptyState icon="notifications-outline" title="Пока тихо" text="Здесь появятся начисления бонусов, оплаты и новости клуба" />
        )
      }
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.violetLight} style={{ marginVertical: space.lg }} /> : null}
    />
  );
}

function NotificationCard({ n, highlighted }: { n: ClientNotification; highlighted: boolean }) {
  const look = LOOK[n.kind] ?? LOOK.system;
  const screen = typeof n.meta.screen === 'string' ? n.meta.screen : null;
  const actionable = !!screen && screen !== 'notifications';
  const body = (
    <View style={[styles.card, highlighted && styles.cardNew]}>
      <IconBubble name={look.icon} color={look.color} size={42} />
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[type.headline, { flex: 1 }]} numberOfLines={2}>{n.title}</Text>
          <Text style={styles.time}>{relative(n.createdAt)}</Text>
        </View>
        <Text style={[type.callout, { color: colors.textSecondary, marginTop: 3 }]}>{n.body}</Text>
      </View>
      {highlighted ? <View style={styles.dot} /> : null}
    </View>
  );
  if (!actionable) return body;
  return (
    <Tap onPress={() => openFromNotificationData(n.meta)} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.body}`}>
      {body}
    </Tap>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  card: {
    flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: 18,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  cardNew: { borderColor: colors.borderViolet, backgroundColor: '#211b2d' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  time: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  dot: { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink },
});
