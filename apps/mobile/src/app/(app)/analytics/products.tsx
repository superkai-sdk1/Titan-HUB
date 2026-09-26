import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';

import { AppRefreshControl } from '@/components/refresh-control';
import { BarRow, KpiTile, money, PeriodChips, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { pct, previousPeriod, useAnalyticsPeriod, useProductsAnalytics } from '@/lib/analytics-api';
import { toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

type Tab = 'items' | 'categories';

const ABC_COLOR = { A: '#10B981', B: '#F59E0B', C: '#94A3B8' } as const;

/** Бар: выручка по позициям с ABC-анализом и по категориям, сравнение с прошлым периодом. */
export default function ProductsScreen() {
  const gutter = usePageGutter();
  const period = useAnalyticsPeriod();
  const previous = previousPeriod(period);
  const products = useProductsAnalytics(period.from, period.to);
  const before = useProductsAnalytics(previous.from, previous.to);
  const [tab, setTab] = useState<Tab>('items');
  const [pulling, setPulling] = useState(false);
  const data = products.data;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([products.refetch(), before.refetch()]);
    setPulling(false);
  };

  const rows = (data?.products ?? []).map((p) => ({ ...p, qty: toNumber(p.totalQty), revenue: toNumber(p.totalRev) }));
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));
  const categories = [...rows.reduce((map, r) => {
    const key = r.category ?? 'Без категории';
    const current = map.get(key) ?? { name: key, revenue: 0, qty: 0, count: 0 };
    return map.set(key, { name: key, revenue: current.revenue + r.revenue, qty: current.qty + r.qty, count: current.count + 1 });
  }, new Map<string, { name: string; revenue: number; qty: number; count: number }>()).values()].sort((a, b) => b.revenue - a.revenue);
  const soldQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Бар и товары</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <PeriodChips period={period} />
        <QueryState loading={!data} error={products.error}>
          {data && (
            <>
              <TileGrid>
                <KpiTile label="Выручка позиций" icon="cup.and.saucer.fill" color={colors.orange} value={money(data.totalRev)} delta={before.data ? pct(data.totalRev, before.data.totalRev) : undefined} />
                <KpiTile label="Продано штук" icon="cart" color={colors.blue} value={String(Math.round(soldQty))} caption={`${rows.length} позиций в топе`} />
              </TileGrid>

              <Host matchContents={{ vertical: true }} style={styles.segment}>
                <Picker
                  selection={tab}
                  onSelectionChange={(value) => {
                    haptic.selection();
                    setTab(value as Tab);
                  }}
                  modifiers={[pickerStyle('segmented')]}>
                  <SwiftText modifiers={[tag('items')]}>Позиции</SwiftText>
                  <SwiftText modifiers={[tag('categories')]}>Категории</SwiftText>
                </Picker>
              </Host>

              <LayoutAnimationConfig skipEntering>
                <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.tab}>
                  {rows.length === 0 ? (
                    <Text style={[type.subhead, styles.secondary, styles.empty]}>За период продаж не было</Text>
                  ) : tab === 'items' ? (
                    <>
                      <View style={styles.legend}>
                        {(['A', 'B', 'C'] as const).map((key) => (
                          <View key={key} style={styles.legendItem}>
                            <View style={[styles.abc, { backgroundColor: `${ABC_COLOR[key]}26` }]}>
                              <Text style={[type.caption1, styles.abcText, { color: ABC_COLOR[key] }]}>{key}</Text>
                            </View>
                            <Text style={[type.caption1, styles.secondary]}>{key === 'A' ? '80% выручки' : key === 'B' ? 'ещё 15%' : 'остальное'}</Text>
                          </View>
                        ))}
                      </View>
                      <GlassCard>
                        {rows.map((row, index) => (
                          <View key={row.itemId}>
                            {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                            <View style={styles.item}>
                              <View style={[styles.abc, { backgroundColor: `${ABC_COLOR[row.abc]}26` }]}>
                                <Text style={[type.caption1, styles.abcText, { color: ABC_COLOR[row.abc] }]}>{row.abc}</Text>
                              </View>
                              <View style={styles.flex}>
                                <View style={styles.itemTop}>
                                  <Text style={[type.body, styles.label, styles.flex]} numberOfLines={1}>
                                    {row.name ?? 'Позиция'}
                                  </Text>
                                  <Text style={[type.body, type.amount, styles.label]}>{money(row.revenue)}</Text>
                                </View>
                                <View style={styles.track}>
                                  <View style={[styles.fill, { width: `${Math.max(2, (row.revenue / maxRevenue) * 100)}%`, backgroundColor: ABC_COLOR[row.abc] }]} />
                                </View>
                                <Text style={[type.caption1, styles.secondary]}>{`${Math.round(row.qty)} шт · ${row.share.toString().replace('.', ',')}%${row.category ? ` · ${row.category}` : ''}`}</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </GlassCard>
                      <Text style={[type.footnote, styles.note]}>ABC считается по 50 самым продаваемым позициям периода.</Text>
                    </>
                  ) : (
                    <GlassCard style={styles.bars}>
                      <SectionTitle>ВЫРУЧКА ПО КАТЕГОРИЯМ</SectionTitle>
                      {categories.map((c) => (
                        <BarRow key={c.name} label={c.name} value={money(c.revenue)} share={c.revenue / categories[0]!.revenue} caption={`${Math.round(c.qty)} шт · ${c.count} поз.`} color={colors.orange} />
                      ))}
                    </GlassCard>
                  )}
                </Animated.View>
              </LayoutAnimationConfig>
            </>
          )}
        </QueryState>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  segment: { alignSelf: 'stretch' },
  tab: { gap: space.sm },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  legend: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  abc: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  abcText: { fontWeight: '800' },
  separator: { marginLeft: 54 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden', marginVertical: 5 },
  fill: { height: 4, borderRadius: 2 },
  note: { color: colors.tertiaryLabel, paddingHorizontal: space.xs },
  bars: { paddingVertical: space.lg, gap: 2 },
});
