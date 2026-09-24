import { Chart, Host } from '@expo/ui/swift-ui';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarRow, KpiTile, money, PeriodChips, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { Unavailable } from '@/components/unavailable';
import { useAnalyticsPeriod, useEventsAnalytics } from '@/lib/analytics-api';
import { plural } from '@/lib/format';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const CATEGORY_COLOR: Record<string, string> = { Титан: '#8B5CF6', Выезд: '#06B6D4', Миникап: '#A855F7' };
const num = (n: number) => n.toString().replace('.', ',');

/**
 * Мероприятия периода по календарной дате: заказы, часы, выручка (факт по чекам и план),
 * средние показатели, форматы, загрузка по дням недели, топ заказчиков и зон.
 */
export default function EventsAnalyticsScreen() {
  const gutter = usePageGutter();
  const accent = useAccentHex();
  const period = useAnalyticsPeriod();
  const events = useEventsAnalytics(period.from, period.to);
  const [pulling, setPulling] = useState(false);
  const data = events.data;

  const refresh = async () => {
    setPulling(true);
    await events.refetch();
    setPulling(false);
  };

  const categoryMax = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.revenue));

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Мероприятия</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <PeriodChips period={period} />
        <QueryState loading={!data} error={events.error}>
          {data &&
            (data.totals.count === 0 ? (
              <View style={styles.empty}>
                <Unavailable title="Мероприятий не было" systemImage="calendar" description={data.totals.cancelled > 0 ? `Отменено за период: ${data.totals.cancelled}` : 'Выберите другой период.'} />
              </View>
            ) : (
              <>
                <TileGrid>
                  <KpiTile label="Заказов" icon="calendar" value={String(data.totals.count)} caption={`${data.totals.days} ${plural(data.totals.days, ['день', 'дня', 'дней'])} с заказами`} />
                  <KpiTile label="Часов" icon="clock" color={colors.blue} value={num(data.totals.hours)} caption={`в среднем ${num(data.totals.avgDuration)} ч`} />
                  <KpiTile label="Выручка" icon="rublesign.circle" color={colors.green} value={money(Math.round(data.totals.revenue))} caption={`факт ${money(data.totals.actualRevenue)} · план ${money(data.totals.plannedRevenue)}`} />
                  <KpiTile label="Средний заказ" icon="receipt" color={colors.orange} value={money(data.totals.avgCheck)} caption={`${money(data.totals.revenuePerHour)} за час`} />
                </TileGrid>
                <Text style={[type.footnote, styles.note]}>
                  {`Гостей в среднем ${num(data.totals.avgAttendees)}.${data.totals.cancelled ? ` Отменено: ${data.totals.cancelled}.` : ''} План — суммы мероприятий, по которым ещё нет чека.`}
                </Text>

                {data.byCategory.length > 0 && (
                  <GlassCard style={styles.bars}>
                    <View style={styles.pad}>
                      <SectionTitle>ПО ФОРМАТУ</SectionTitle>
                    </View>
                    {data.byCategory.map((c) => (
                      <BarRow
                        key={c.label}
                        label={c.label}
                        value={money(Math.round(c.revenue))}
                        share={c.revenue / categoryMax}
                        color={CATEGORY_COLOR[c.label] ?? colors.accent}
                        caption={`${c.count} ${plural(c.count, ['заказ', 'заказа', 'заказов'])} · ${num(Math.round(c.hours * 10) / 10)} ч`}
                      />
                    ))}
                  </GlassCard>
                )}

                <GlassCard style={styles.bars}>
                  <View style={styles.pad}>
                    <SectionTitle>ЗАГРУЗКА ПО ДНЯМ НЕДЕЛИ</SectionTitle>
                  </View>
                  <Host style={styles.chart}>
                    <Chart type="bar" animate showGrid={false} data={data.byWeekday.map((d) => ({ x: d.label, y: d.count, color: d.label === 'Сб' || d.label === 'Вс' ? '#F59E0B' : accent }))} barStyle={{ cornerRadius: 4 }} />
                  </Host>
                </GlassCard>

                {data.topCustomers.length > 0 && (
                  <>
                    <SectionTitle>ТОП ЗАКАЗЧИКОВ</SectionTitle>
                    <GlassCard>
                      {data.topCustomers.map((c, index) => (
                        <View key={`${c.name}|${c.phone ?? ''}`}>
                          {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                          <View style={styles.row}>
                            <View style={styles.flex}>
                              <Text style={[type.body, styles.label]} numberOfLines={1}>
                                {c.name}
                              </Text>
                              <Text style={[type.footnote, styles.secondary]}>{[`${c.count} ${plural(c.count, ['заказ', 'заказа', 'заказов'])}`, `${num(Math.round(c.hours * 10) / 10)} ч`, c.phone].filter(Boolean).join(' · ')}</Text>
                            </View>
                            <Text style={[type.body, type.amount, styles.label]}>{money(Math.round(c.revenue))}</Text>
                          </View>
                        </View>
                      ))}
                    </GlassCard>
                  </>
                )}

                {data.topZones.length > 0 && (
                  <>
                    <SectionTitle>ЗОНЫ</SectionTitle>
                    <GlassCard>
                      {data.topZones.map((z, index) => (
                        <View key={z.name}>
                          {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                          <View style={styles.row}>
                            <Text style={[type.body, styles.label, styles.flex]} numberOfLines={1}>
                              {z.name}
                            </Text>
                            <Text style={[type.footnote, styles.secondary]}>{`${z.count} ${plural(z.count, ['заказ', 'заказа', 'заказов'])}`}</Text>
                            <Text style={[type.body, type.amount, styles.label]}>{money(Math.round(z.revenue))}</Text>
                          </View>
                        </View>
                      ))}
                    </GlassCard>
                  </>
                )}
              </>
            ))}
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
  note: { color: colors.tertiaryLabel, paddingHorizontal: space.xs },
  empty: { height: 360 },
  bars: { paddingVertical: space.lg, gap: 2 },
  pad: { paddingHorizontal: space.lg, paddingBottom: space.xs },
  chart: { height: 160, marginHorizontal: space.lg },
  separator: { marginLeft: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56 },
});
