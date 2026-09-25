import { GlassView } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarRow, KpiTile, money, PeriodChips, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard } from '@/components/new-check-parts';
import { pct, previousPeriod, useAnalyticsPeriod, useTariffsAnalytics } from '@/lib/analytics-api';
import { plural } from '@/lib/format';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

const EVENING_COLOR: Record<string, string> = {
  city_mafia: '#8B5CF6',
  sport_mafia: '#10B981',
  kids_mafia: '#F59E0B',
  board_games: '#06B6D4',
  minicap: '#A855F7',
  none: '#94A3B8',
};

/** Игры и тарифы: сколько тарифов продано и на сколько, игровые вечера, разбивка по тарифам и типам вечеров. */
export default function TariffsAnalyticsScreen() {
  const gutter = usePageGutter();
  const period = useAnalyticsPeriod();
  const previous = previousPeriod(period);
  const tariffs = useTariffsAnalytics(period.from, period.to);
  const before = useTariffsAnalytics(previous.from, previous.to);
  const [pulling, setPulling] = useState(false);
  const data = tariffs.data;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([tariffs.refetch(), before.refetch()]);
    setPulling(false);
  };

  const tariffMax = Math.max(1, ...(data?.byTariff ?? []).map((t) => t.revenue));
  const eveningMax = Math.max(1, ...(data?.byEvening ?? []).map((e) => e.revenue));

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Игры и тарифы</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <PeriodChips period={period} />
        <QueryState loading={!data} error={tariffs.error}>
          {data && (
            <>
              <TileGrid>
                <KpiTile label="Тарифов продано" icon="ticket" value={String(data.total.count)} delta={before.data ? pct(data.total.count, before.data.total.count) : undefined} />
                <KpiTile label="Выручка по тарифам" icon="rublesign.circle" color={colors.green} value={money(data.total.revenue)} delta={before.data ? pct(data.total.revenue, before.data.total.revenue) : undefined} />
              </TileGrid>

              <SectionTitle>{`ИГРОВЫЕ ВЕЧЕРА · ${data.gameEveningsTotal}`}</SectionTitle>
              <View style={styles.evenings}>
                {data.gameEvenings.map((e) => (
                  <GlassView key={e.eveningKey} tintColor={`${EVENING_COLOR[e.eveningKey] ?? '#8B5CF6'}1F`} style={styles.evening}>
                    <Text style={[type.title2, type.amount, styles.label]}>{e.count}</Text>
                    <Text style={[type.caption1, styles.secondary]} numberOfLines={2}>
                      {e.label}
                    </Text>
                  </GlassView>
                ))}
              </View>
              <Text style={[type.footnote, styles.note]}>Вечер засчитывается, если в смене закрыто не меньше трёх чеков с игровым тарифом. Миникапы — по датам мероприятий.</Text>

              {data.byTariff.length > 0 && (
                <GlassCard style={styles.bars}>
                  <View style={styles.pad}>
                    <SectionTitle>ПО ТАРИФАМ</SectionTitle>
                  </View>
                  {data.byTariff.map((t) => (
                    <BarRow
                      key={t.tariffId}
                      label={t.name}
                      value={money(t.revenue)}
                      share={t.revenue / tariffMax}
                      caption={`${t.count} ${plural(t.count, ['продажа', 'продажи', 'продаж'])}${t.count > 0 ? ` · средняя ${money(Math.round(t.revenue / t.count))}` : ''}`}
                    />
                  ))}
                </GlassCard>
              )}

              {data.byEvening.length > 0 && (
                <GlassCard style={styles.bars}>
                  <View style={styles.pad}>
                    <SectionTitle>ПО ТИПАМ ВЕЧЕРОВ</SectionTitle>
                  </View>
                  {data.byEvening.map((e) => (
                    <BarRow
                      key={e.eveningKey}
                      label={e.label}
                      value={money(e.revenue)}
                      share={e.revenue / eveningMax}
                      color={EVENING_COLOR[e.eveningKey] ?? colors.accent}
                      caption={`${e.count} ${plural(e.count, ['тариф', 'тарифа', 'тарифов'])}`}
                    />
                  ))}
                </GlassCard>
              )}
            </>
          )}
        </QueryState>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  note: { color: colors.tertiaryLabel, paddingHorizontal: space.xs },
  evenings: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  evening: { width: '31.5%', flexGrow: 1, padding: space.md, gap: 2, borderRadius: 18, borderCurve: 'continuous', minHeight: 78 },
  bars: { paddingVertical: space.lg, gap: 2 },
  pad: { paddingHorizontal: space.lg, paddingBottom: space.xs },
});
