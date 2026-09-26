// «История» — все операции: деньги и бонусы, по дням, с догрузкой при прокрутке.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedRow } from '@/components/feed-row';
import { ScreenHeader, useManualRefresh } from '@/components/screen';
import { useTabClearance } from '@/components/tab-bar';
import { Button, Divider, EmptyState, Segmented, Skeleton } from '@/components/ui';
import { errorText } from '@/lib/api';
import { dayKey, dayTitle } from '@/lib/format';
import { type FeedKind, useFeed } from '@/lib/queries';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';
import type { FeedItem } from '@/lib/types';

const FILTERS: { key: FeedKind; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'money', label: 'Деньги' },
  { key: 'bonus', label: 'Бонусы' },
];

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useTabClearance();
  const [kind, setKind] = useState<FeedKind>('all');
  const feed = useFeed(kind);
  const refresh = useManualRefresh(() => feed.refetch());

  const sections = useMemo(() => {
    const out: { key: string; title: string; data: FeedItem[] }[] = [];
    for (const page of feed.data?.pages ?? []) {
      for (const item of page.items) {
        const k = dayKey(item.createdAt);
        const last = out[out.length - 1];
        if (last && last.key === k) last.data.push(item);
        else out.push({ key: k, title: dayTitle(item.createdAt), data: [item] });
      }
    }
    return out;
  }, [feed.data]);

  const openCheck = (id: string) => router.push({ pathname: '/check/[id]', params: { id } });

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: clearance, paddingHorizontal: GUTTER }}
      sections={sections}
      keyExtractor={(it) => it.id}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} tintColor={colors.violetLight}
          colors={[colors.violet]} progressBackgroundColor={colors.surface} progressViewOffset={insets.top} />
      }
      ListHeaderComponent={
        <View style={styles.column}>
          <ScreenHeader title="История" subtitle="Оплаты, пополнения и бонусы" />
          <Segmented options={FILTERS} value={kind} onChange={setKind} />
          <View style={{ height: space.lg }} />
          {feed.isLoading ? (
            <View style={{ gap: space.md }}>
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} height={52} />)}
            </View>
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={[styles.column, styles.dayHeader]}>
          <Text style={type.overline}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <View style={[
          styles.column, styles.rowWrap,
          index === 0 && styles.first,
          index === section.data.length - 1 && styles.last,
        ]}>
          {index > 0 ? <Divider inset={68} /> : null}
          <FeedRow item={item} onOpenCheck={openCheck} />
        </View>
      )}
      renderSectionFooter={() => <View style={{ height: space.lg }} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage(); }}
      ListEmptyComponent={
        feed.isLoading ? null : feed.isError ? (
          <EmptyState icon="cloud-offline" title="Не удалось загрузить" text={errorText(feed.error)}>
            <Button title="Повторить" variant="secondary" onPress={() => void feed.refetch()} />
          </EmptyState>
        ) : (
          <EmptyState
            icon={kind === 'bonus' ? 'star-outline' : 'receipt-outline'}
            title={kind === 'bonus' ? 'Бонусов пока нет' : 'Операций пока нет'}
            text="Всё, что происходит с вашим балансом в клубе, появится здесь"
          />
        )
      }
      ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={colors.violetLight} style={{ marginVertical: space.lg }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  dayHeader: { paddingHorizontal: space.xs, paddingBottom: space.sm },
  rowWrap: { backgroundColor: colors.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(139,92,246,0.15)' },
  first: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden' },
});
