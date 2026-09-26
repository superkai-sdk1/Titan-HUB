import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppRefreshControl } from '@/components/refresh-control';
import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { ClientRow } from '@/components/client-row';
import { GlassChip } from '@/components/new-check-parts';
import { useDebounced } from '@/components/player-picker';
import { Unavailable } from '@/components/unavailable';
import { useClientList, useClientTiers, type Client, type ClientSection, type ClientSort } from '@/lib/clients-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton, ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

const SECTIONS: { key: ClientSection; label: string; icon?: SFSymbol }[] = [
  { key: 'all', label: 'Все' },
  { key: 'resident', label: 'Резиденты' },
  { key: 'student', label: 'Студенты' },
  { key: 'newbie', label: 'Новички' },
  { key: 'guest', label: 'Гости' },
  { key: 'archived', label: 'Архив', icon: 'archivebox' },
];

const SORTS: { key: ClientSort; label: string; icon: SFSymbol }[] = [
  { key: 'last_check', label: 'Активные', icon: 'clock.arrow.circlepath' },
  { key: 'recent', label: 'Новые', icon: 'sparkles' },
  { key: 'name', label: 'По алфавиту', icon: 'textformat.abc' },
  { key: 'balance', label: 'По балансу', icon: 'rublesign.circle' },
  { key: 'bonus', label: 'По бонусам', icon: 'star' },
];

/**
 * Клиенты клуба: поиск в шапке (ник, имя, телефон, теги), разделы по статусу и архив,
 * сортировка в меню. Список догружается страницами по 30, строки — стекло.
 */
export default function ClientsScreen() {
  const gutter = usePageGutter();
  const searchClearance = useSearchClearance();
  const router = useRouter();
  const tiers = useClientTiers();
  const [section, setSection] = useState<ClientSection>('all');
  const [sort, setSort] = useState<ClientSort>('last_check');
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 300);
  const list = useClientList(section, sort, search);
  const [pulling, setPulling] = useState(false);

  const clients = useMemo(() => {
    const seen = new Set<string>();
    return (list.data?.pages ?? []).flatMap((page) => page.clients).filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  const refresh = async () => {
    setPulling(true);
    await list.refetch();
    setPulling(false);
  };

  const open = (client: Client) => router.push({ pathname: '/manage/clients/[clientId]', params: { clientId: client.id } });

  const header = (
    <View style={styles.header}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
        {SECTIONS.map((s) => (
          <GlassChip
            key={s.key}
            label={s.label}
            icon={s.icon}
            tint={s.key === 'archived' ? colors.gray : colors.accent}
            active={section === s.key}
            onPress={() => {
              haptic.selection();
              setSection(s.key);
            }}
          />
        ))}
      </ScrollView>
      {list.data && (
        <Text style={[type.footnote, styles.count]}>
          {`${total} ${plural(total, ['клиент', 'клиента', 'клиентов'])}${search.trim() ? ' по запросу' : section === 'archived' ? ' в архиве' : ''} · ${SORTS.find((s) => s.key === sort)?.label.toLowerCase()}`}
        </Text>
      )}
    </View>
  );

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Клиенты</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="arrow.up.arrow.down" accessibilityLabel="Сортировка">
          {SORTS.map((s) => (
            <ToolbarMenuAction
              key={s.key}
              icon={s.icon}
              isOn={sort === s.key}
              onPress={() => {
                haptic.selection();
                setSort(s.key);
              }}>
              {s.label}
            </ToolbarMenuAction>
          ))}
        </ToolbarMenu>
        <ToolbarButton icon="person.badge.plus" accessibilityLabel="Новый клиент" onPress={() => router.push('/manage/clients/edit')} />
      </Stack.Toolbar>

      <FlashList
        data={clients}
        keyExtractor={(client) => client.id}
        renderItem={({ item }) => <ClientRow client={item} tiers={tiers.data} onPress={() => open(item)} />}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={header}
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <View style={styles.empty}>
              {list.isError ? (
                <Unavailable title="Нет связи" systemImage="wifi.exclamationmark" description={list.error.message} />
              ) : section === 'archived' ? (
                <Unavailable title="Архив пуст" systemImage="archivebox" description="Сюда попадают клиенты, отправленные в архив." />
              ) : (
                <Unavailable title="Клиенты не найдены" systemImage="person.2.slash" description="Измените запрос или раздел." />
              )}
            </View>
          )
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footer} />
          ) : clients.length > 0 && !list.hasNextPage ? (
            <Text style={[type.footnote, styles.footerText]}>{`Все клиенты загружены · ${clients.length}`}</Text>
          ) : null
        }
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, { paddingBottom: searchClearance }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}
      />
      <BottomSearch value={query} onChange={setQuery} placeholder="Ник, имя, телефон или тег" />
    </AmbientBackdrop>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140 },
  header: { gap: space.sm, paddingBottom: space.md },
  chips: { flexGrow: 0, flexShrink: 0, height: 44, marginHorizontal: -space.lg },
  chipsContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  count: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  gap: { height: space.sm },
  loading: { paddingTop: 80 },
  empty: { height: 380 },
  footer: { paddingVertical: space.xl },
  footerText: { color: colors.tertiaryLabel, textAlign: 'center', paddingVertical: space.xl },
});
