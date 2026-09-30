import { Chart, ContentUnavailableView, Form, HStack, Host, Section, Text } from '@expo/ui/swift-ui';
import { frame, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';

import { LegendRow, PeriodMenu, PeriodSection, RankRow, share, StateSection, Tile } from '@/components/analytics/native';
import { money } from '@/components/analytics/parts';
import { useAnalyticsPeriod, useEventsAnalytics } from '@/lib/analytics-api';
import { plural } from '@/lib/format';
import { colors, useAccentHex } from '@/lib/theme';

const CATEGORY_COLOR: Record<string, string> = { Титан: '#8B5CF6', Выезд: '#30B0C7', Миникап: '#FF2D55' };
const num = (n: number) => n.toString().replace('.', ',');
const orders = (n: number) => `${n} ${plural(n, ['заказ', 'заказа', 'заказов'])}`;

/**
 * Мероприятия периода по календарной дате: заказы, часы, выручка (факт по чекам и план),
 * средние показатели, форматы, загрузка по дням недели, топ заказчиков и зон.
 */
export default function EventsAnalyticsScreen() {
  const accent = useAccentHex();
  const period = useAnalyticsPeriod();
  const events = useEventsAnalytics(period.from, period.to);
  const data = events.data;
  const categoryTotal = (data?.byCategory ?? []).reduce((s, c) => s + c.revenue, 0);

  return (
    <>
      <Stack.Title>Мероприятия</Stack.Title>
      <PeriodMenu period={period} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await events.refetch()))]}>
          <PeriodSection period={period} />
          {!data ? (
            <StateSection error={events.error} />
          ) : data.totals.count === 0 ? (
            <Section>
              <ContentUnavailableView
                title="Мероприятий не было"
                systemImage="calendar"
                description={data.totals.cancelled > 0 ? `Отменено за период: ${data.totals.cancelled}` : 'Выберите другой период.'}
              />
            </Section>
          ) : (
            <>
              <Section
                footer={
                  <Text>
                    {`Гостей в среднем ${num(data.totals.avgAttendees)}.${data.totals.cancelled ? ` Отменено: ${data.totals.cancelled}.` : ''} Выручка — факт по чекам ${money(data.totals.actualRevenue)} и план ${money(data.totals.plannedRevenue)} по мероприятиям без чека.`}
                  </Text>
                }>
                <HStack spacing={12}>
                  <Tile label="Заказов" value={String(data.totals.count)} caption={`${data.totals.days} ${plural(data.totals.days, ['день', 'дня', 'дней'])} с заказами`} />
                  <Tile label="Часов" value={num(data.totals.hours)} caption={`в среднем ${num(data.totals.avgDuration)} ч`} />
                </HStack>
                <HStack spacing={12}>
                  <Tile label="Выручка" value={money(Math.round(data.totals.revenue))} />
                  <Tile label="Средний заказ" value={money(data.totals.avgCheck)} caption={`${money(data.totals.revenuePerHour)} за час`} />
                </HStack>
              </Section>

              {data.byCategory.length > 0 && (
                <Section title="По формату">
                  <Chart
                    type="pie"
                    animate
                    data={data.byCategory.map((c) => ({ x: c.label, y: Math.max(c.revenue, 0.01), color: CATEGORY_COLOR[c.label] ?? accent }))}
                    pieStyle={{ innerRadius: 0.62, angularInset: 1.5 }}
                    modifiers={[frame({ height: 170 })]}
                  />
                  {data.byCategory.map((c) => (
                    <LegendRow
                      key={c.label}
                      color={CATEGORY_COLOR[c.label] ?? accent}
                      label={c.label}
                      caption={`${orders(c.count)} · ${num(Math.round(c.hours * 10) / 10)} ч`}
                      value={money(Math.round(c.revenue))}
                      percent={share(c.revenue, categoryTotal)}
                    />
                  ))}
                </Section>
              )}

              <Section title="Загрузка по дням недели" footer={<Text>Сколько мероприятий приходится на каждый день недели.</Text>}>
                <Chart
                  type="bar"
                  animate
                  data={data.byWeekday.map((d) => ({ x: d.label, y: d.count, color: d.label === 'Сб' || d.label === 'Вс' ? colors.orange : accent }))}
                  barStyle={{ cornerRadius: 4 }}
                  modifiers={[frame({ height: 150 })]}
                />
              </Section>

              {data.topCustomers.length > 0 && (
                <Section title="Топ заказчиков">
                  {data.topCustomers.map((c, index) => (
                    <RankRow
                      key={`${c.name}|${c.phone ?? ''}`}
                      rank={index + 1}
                      name={c.name}
                      caption={[orders(c.count), `${num(Math.round(c.hours * 10) / 10)} ч`, c.phone].filter(Boolean).join(' · ')}
                      value={money(Math.round(c.revenue))}
                    />
                  ))}
                </Section>
              )}

              {data.topZones.length > 0 && (
                <Section title="Зоны">
                  {data.topZones.map((z) => (
                    <RankRow key={z.name} name={z.name} caption={orders(z.count)} value={money(Math.round(z.revenue))} />
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
