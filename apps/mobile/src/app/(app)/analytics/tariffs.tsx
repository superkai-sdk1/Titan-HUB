import { Chart, Form, HStack, Host, Section, Text } from '@expo/ui/swift-ui';
import { frame, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';

import { LegendRow, PeriodMenu, PeriodSection, RankRow, share, StateSection, Tile } from '@/components/analytics/native';
import { money } from '@/components/analytics/parts';
import { pct, previousPeriod, useAnalyticsPeriod, useTariffsAnalytics } from '@/lib/analytics-api';
import { plural } from '@/lib/format';
import { useAccentHex } from '@/lib/theme';

const EVENING_COLOR: Record<string, string> = {
  city_mafia: '#8B5CF6',
  sport_mafia: '#34C759',
  kids_mafia: '#FF9500',
  board_games: '#30B0C7',
  minicap: '#FF2D55',
  none: '#8E8E93',
};

/** Игры и тарифы: продажи тарифов, игровые вечера по типам, разбивка по тарифам и типам вечеров. */
export default function TariffsAnalyticsScreen() {
  const accent = useAccentHex();
  const period = useAnalyticsPeriod();
  const previous = previousPeriod(period);
  const tariffs = useTariffsAnalytics(period.from, period.to);
  const before = useTariffsAnalytics(previous.from, previous.to);
  const data = tariffs.data;
  const eveningRevenue = (data?.byEvening ?? []).reduce((s, e) => s + e.revenue, 0);

  return (
    <>
      <Stack.Title>Игры и тарифы</Stack.Title>
      <PeriodMenu period={period} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([tariffs.refetch(), before.refetch()])))]}>
          <PeriodSection period={period} />
          {!data ? (
            <StateSection error={tariffs.error} />
          ) : (
            <>
              <Section>
                <HStack spacing={12}>
                  <Tile label="Тарифов продано" value={String(data.total.count)} delta={before.data ? pct(data.total.count, before.data.total.count) : undefined} />
                  <Tile label="Выручка тарифов" value={money(data.total.revenue)} delta={before.data ? pct(data.total.revenue, before.data.total.revenue) : undefined} />
                </HStack>
              </Section>

              <Section
                title={`Игровые вечера · ${data.gameEveningsTotal}`}
                footer={<Text>Вечер засчитывается, если в смене закрыто не меньше трёх чеков с игровым тарифом. Миникапы — по датам мероприятий.</Text>}>
                <Chart
                  type="bar"
                  animate
                  data={data.gameEvenings.map((e) => ({ x: e.label, y: e.count, color: EVENING_COLOR[e.eveningKey] ?? accent }))}
                  barStyle={{ cornerRadius: 4 }}
                  modifiers={[frame({ height: 150 })]}
                />
                {data.gameEvenings.map((e) => (
                  <LegendRow key={e.eveningKey} color={EVENING_COLOR[e.eveningKey] ?? accent} label={e.label} value={`${e.count} ${plural(e.count, ['вечер', 'вечера', 'вечеров'])}`} />
                ))}
              </Section>

              {data.byTariff.length > 0 && (
                <Section title="По тарифам">
                  {data.byTariff.map((t, index) => (
                    <RankRow
                      key={t.tariffId}
                      rank={index + 1}
                      name={t.name}
                      caption={`${t.count} ${plural(t.count, ['продажа', 'продажи', 'продаж'])}${t.count > 0 ? ` · средняя ${money(Math.round(t.revenue / t.count))}` : ''}`}
                      value={money(t.revenue)}
                    />
                  ))}
                </Section>
              )}

              {data.byEvening.length > 0 && (
                <Section title="Выручка тарифов по типам вечеров">
                  {data.byEvening.map((e) => (
                    <LegendRow
                      key={e.eveningKey}
                      color={EVENING_COLOR[e.eveningKey] ?? accent}
                      label={e.label}
                      caption={`${e.count} ${plural(e.count, ['тариф', 'тарифа', 'тарифов'])}`}
                      value={money(e.revenue)}
                      percent={share(e.revenue, eveningRevenue)}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </Form>
      </Host>
    </>
  );
}
