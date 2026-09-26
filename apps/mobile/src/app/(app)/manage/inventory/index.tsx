import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { AppRefreshControl } from '@/components/refresh-control';
import { GlassView } from '@/components/glass';
import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { ExpensesTab } from '@/components/inventory/expenses-tab';
import { ItemsTab, type ItemsFilter } from '@/components/inventory/items-tab';
import { RevisionsTab } from '@/components/inventory/revisions-tab';
import { SuppliesTab } from '@/components/inventory/supplies-tab';
import { GlassCard } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { usePageGutter } from '@/lib/layout';
import { queryClient } from '@/lib/query';
import { useClubKey } from '@/lib/queries';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseStockDate, STOCK_LOOK, useInventoryOverview } from '@/lib/inventory-api';
import { colors, space, type } from '@/lib/theme';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

type Tab = 'items' | 'supplies' | 'revisions' | 'expenses';

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });

/**
 * «Склад»: стоимость остатков и тревожные позиции сверху, ниже — остатки, закупки,
 * ревизии и расходы клуба одним сегментом, как в веб-кассе.
 */
export default function InventoryScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const club = useClubKey();
  const overview = useInventoryOverview();
  const [tab, setTab] = useState<Tab>('items');
  const [filter, setFilter] = useState<ItemsFilter>('all');
  const [pulling, setPulling] = useState(false);
  const [query, setQuery] = useState('');
  const searchClearance = useSearchClearance();
  const data = overview.data;

  const refresh = async () => {
    setPulling(true);
    await queryClient.refetchQueries({ queryKey: [club, 'inventory'], type: 'active' });
    setPulling(false);
  };

  const showFilter = (next: ItemsFilter) => {
    haptic.selection();
    setTab('items');
    setFilter((current) => (current === next ? 'all' : next));
  };

  const lastSupply = parseStockDate(data?.lastSupplyAt ?? null);
  const lastRevision = parseStockDate(data?.lastRevisionAt ?? null);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Склад</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="plus" accessibilityLabel="Создать">
          <ToolbarMenuAction icon="shippingbox" onPress={() => router.push('/manage/inventory/supply-editor')}>
            Закупка
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="checklist" onPress={() => router.push('/manage/inventory/revision-editor')}>
            Ревизия
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="banknote" onPress={() => router.push('/manage/inventory/expense-new')}>
            Расход
          </ToolbarMenuAction>
        </ToolbarMenu>
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, tab === 'items' ? { paddingBottom: searchClearance } : null]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <GlassCard style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.flex}>
              <Text style={[type.footnote, styles.caption]}>СТОИМОСТЬ СКЛАДА</Text>
              <RollingText text={data ? formatMoney(data.stockValue) : '—'} style={[styles.value, type.amount]} />
            </View>
            {data && data.deadStockCount > 0 && (
              <View style={styles.dead}>
                <Text style={[type.title3, type.amount, styles.label]}>{data.deadStockCount}</Text>
                <Text style={[type.caption1, styles.secondary]}>залежалось</Text>
              </View>
            )}
          </View>
          <View style={styles.kpis}>
            <Kpi title="Заканчивается" value={data?.lowStockCount ?? 0} color={STOCK_LOOK.low.color} icon="exclamationmark.triangle.fill" active={tab === 'items' && filter === 'low'} onPress={() => showFilter('low')} />
            <Kpi title="Нет в наличии" value={data?.outOfStockCount ?? 0} color={STOCK_LOOK.out.color} icon="xmark.octagon.fill" active={tab === 'items' && filter === 'out'} onPress={() => showFilter('out')} />
          </View>
          {(lastSupply || lastRevision) && (
            <Text style={[type.footnote, styles.secondary]}>
              {[lastSupply ? `Закупка ${dayMonth.format(lastSupply).replace('.', '')}` : null, lastRevision ? `ревизия ${dayMonth.format(lastRevision).replace('.', '')}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
        </GlassCard>

        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('items')]}>Остатки</SwiftText>
            <SwiftText modifiers={[tag('supplies')]}>Закупки</SwiftText>
            <SwiftText modifiers={[tag('revisions')]}>Ревизия</SwiftText>
            <SwiftText modifiers={[tag('expenses')]}>Расходы</SwiftText>
          </Picker>
        </Host>

        <LayoutAnimationConfig skipEntering>
          <Animated.View key={tab} entering={FadeIn.duration(180)}>
            {tab === 'items' && <ItemsTab filter={filter} onFilter={setFilter} query={query} />}
            {tab === 'supplies' && <SuppliesTab />}
            {tab === 'revisions' && <RevisionsTab />}
            {tab === 'expenses' && <ExpensesTab />}
          </Animated.View>
        </LayoutAnimationConfig>
      </ScrollView>
      {/* Поиск нужен только на «Остатках» — в закупках и ревизиях свои списки документов. */}
      {tab === 'items' && <BottomSearch value={query} onChange={setQuery} placeholder="Название или тег" />}
    </AmbientBackdrop>
  );
}

function Kpi({ title, value, color, icon, active, onPress }: { title: string; value: number; color: string; icon: SFSymbol; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.flex} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <GlassView isInteractive tintColor={active ? `${color}59` : `${color}1A`} style={styles.kpi}>
        <SymbolView name={icon} size={16} tintColor={color} />
        <View style={styles.flex}>
          <Text style={[type.title3, type.amount, styles.label]}>{value}</Text>
          <Text style={[type.caption1, styles.secondary]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  summary: { padding: space.lg, gap: space.md },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  caption: { color: colors.secondaryLabel, fontWeight: '600', letterSpacing: 0.4 },
  value: { fontSize: 36, lineHeight: 42, color: colors.label },
  dead: { alignItems: 'flex-end' },
  kpis: { flexDirection: 'row', gap: space.sm },
  kpi: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 18, borderCurve: 'continuous' },
  segment: { alignSelf: 'stretch' },
});
