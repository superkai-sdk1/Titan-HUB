import { Chart, Form, HStack, Host, LabeledContent, Picker, RNHostView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  contentTransition,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  pickerStyle,
  refreshable,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Heatmap } from '@/components/analytics/heatmap';
import { LegendRow, PeriodMenu, PeriodSection, share, signed, StateSection, Tile } from '@/components/analytics/native';
import { methodLook, money } from '@/components/analytics/parts';
import { LinkRow, primary, secondary } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import {
  addDays,
  formatDay,
  PERIOD_PRESETS,
  pct,
  useAnalyticsPeriod,
  useAnalyticsPeriodStore,
  useInsights,
  useOverview,
  useProductsAnalytics,
  useRevenueSeries,
  type Insights,
  type NetBreakdown,
  type Overview,
  type ResolvedPeriod,
} from '@/lib/analytics-api';
import { plural, toNumber } from '@/lib/format';
import { MAX_CONTENT_WIDTH } from '@/lib/layout';
import { queryClient } from '@/lib/query';
import { useClubKey } from '@/lib/queries';
import { useBusinessDayStartHour } from '@/lib/salary-api';
import { useSession } from '@/lib/session';
import { colors, useAccentHex } from '@/lib/theme';

type ReportPath = '/analytics/checks' | '/analytics/products' | '/analytics/players' | '/analytics/events' | '/analytics/tariffs' | '/analytics/staff';

const REPORTS: { path: ReportPath; title: string; subtitle: string; icon: SFSymbol; color: string; ownerOnly?: boolean }[] = [
  { path: '/analytics/checks', title: 'Чеки', subtitle: 'Все закрытые чеки периода', icon: 'receipt', color: '#007AFF' },
  { path: '/analytics/products', title: 'Бар и товары', subtitle: 'ABC-анализ и категории', icon: 'cup.and.saucer.fill', color: '#FF9500' },
  { path: '/analytics/players', title: 'Игроки', subtitle: 'Сегменты, удержание, топ гостей', icon: 'person.2.fill', color: '#34C759' },
  { path: '/analytics/events', title: 'Мероприятия', subtitle: 'Заказы, часы, форматы, заказчики', icon: 'calendar', color: '#AF52DE' },
  { path: '/analytics/tariffs', title: 'Игры и тарифы', subtitle: 'Игровые вечера и продажи тарифов', icon: 'suit.spade.fill', color: '#FF2D55' },
  { path: '/analytics/staff', title: 'Персонал', subtitle: 'Списания на сотрудников', icon: 'person.badge.key.fill', color: '#8E8E93', ownerOnly: true },
];

const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const STRUCTURE: { key: 'bar' | 'games' | 'rental' | 'events'; label: string; color: string }[] = [
  { key: 'bar', label: 'Бар и меню', color: '#FF9500' },
  { key: 'games', label: 'Игры (тарифы)', color: '#8B5CF6' },
  { key: 'rental', label: 'Аренда зон', color: '#30B0C7' },
  { key: 'events', label: 'Мероприятия', color: '#FF2D55' },
];

type Metric = 'revenue' | 'checks' | 'avg';
type Rhythm = 'hours' | 'weekdays' | 'heat';

const hourRange = (hour: number) => `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;

/**
 * Аналитика — нативная форма, как в системных приложениях iOS 26: итог периода,
 * ключевые показатели с изменением к прошлому периоду, отчёт о прибыли, динамика по дням
 * (выручка, чеки или средний чек), ритм клуба (часы, дни недели, теплокарта), структура
 * выручки, способы оплаты, гости, лучшие позиции и тренд за год. Подробности — в отчётах.
 */
export default function AnalyticsScreen() {
  const router = useRouter();
  const club = useClubKey();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const period = useAnalyticsPeriod();
  const setPreset = useAnalyticsPeriodStore((s) => s.setPreset);
  // Ссылка вида /analytics?period=days30 открывает отчёты сразу за нужный период.
  const { period: linkedPeriod } = useLocalSearchParams<{ period?: string }>();
  useEffect(() => {
    const preset = PERIOD_PRESETS.find((p) => p.key === linkedPeriod);
    if (preset) setPreset(preset.key);
  }, [linkedPeriod, setPreset]);
  const overview = useOverview(period.from, period.to);
  const series = useRevenueSeries(period.from, period.to, period.days > 1);
  const insights = useInsights(period.from, period.to);
  const products = useProductsAnalytics(period.from, period.to);
  const [metric, setMetric] = useState<Metric>('revenue');
  const [rhythm, setRhythm] = useState<Rhythm>('hours');

  const refresh = async () => {
    await queryClient.refetchQueries({ queryKey: [club, 'analytics'], type: 'active' });
  };

  const data = overview.data;

  return (
    <>
      <Stack.Title large>Аналитика</Stack.Title>
      <PeriodMenu period={period}>
        <ToolbarButton icon="sparkles" accessibilityLabel="Спросить Tai" onPress={() => router.push('/tai')} />
      </PeriodMenu>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(refresh)]}>
          <PeriodSection period={period} />

          {!data ? (
            <StateSection error={overview.error} />
          ) : (
            <>
              <HeroSection data={data} owner={isOwner} />
              <KpiSection data={data} guests={insights.data?.guests} />
              {isOwner && data.current.net !== undefined && <ProfitSection current={data.current} />}
              {period.days > 1 && series.data && <TrendSection period={period} series={series.data.revenue} metric={metric} onMetric={setMetric} />}
              {insights.data && <RhythmSection insights={insights.data} rhythm={rhythm} onRhythm={setRhythm} />}
              {insights.data && insights.data.structure.total > 0 && <StructureSection structure={insights.data.structure} />}
              <PaymentsSection breakdown={data.paymentBreakdown} />
              {insights.data && <GuestsSection guests={insights.data.guests} checks={data.current.checks} onOpen={() => router.push('/analytics/players')} />}
              {products.data && products.data.products.length > 0 && (
                <TopSection rows={products.data.products.slice(0, 5)} total={products.data.totalRev} onOpen={() => router.push('/analytics/products')} />
              )}
              {data.current.eventChecks > 0 && <EventsSection current={data.current} owner={isOwner} onOpen={() => router.push('/analytics/events')} />}
              {insights.data && <YearSection months={insights.data.months} />}
            </>
          )}

          <Section title="Отчёты">
            {REPORTS.filter((r) => !r.ownerOnly || isOwner).map((report) => (
              <LinkRow key={report.path} icon={report.icon} color={report.color} title={report.title} subtitle={report.subtitle} onPress={() => router.push(report.path)} />
            ))}
          </Section>
        </Form>
      </Host>
    </>
  );
}

/** Главная цифра периода: прибыль владельцу, выручка сотруднику — с изменением к прошлому. */
function HeroSection({ data, owner }: { data: Overview; owner: boolean }) {
  const profit = owner && data.current.net !== undefined;
  const value = profit ? (data.current.net ?? 0) : data.current.revenueNet;
  const delta = profit ? data.deltas.profit : data.deltas.revenue;
  const hasDelta = delta !== undefined && delta !== 0;
  return (
    <Section>
      <VStack alignment="leading" spacing={4}>
        <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), secondary]}>{profit ? (value >= 0 ? 'ПРИБЫЛЬ' : 'УБЫТОК') : 'ВЫРУЧКА'}</Text>
        <Text
          modifiers={[
            font({ size: 40, weight: 'bold', design: 'rounded' }),
            value < 0 ? foregroundStyle('red') : primary,
            monospacedDigit(),
            contentTransition('numericText'),
            animation(Animation.default, value),
            lineLimit(1),
          ]}>
          {money(value)}
        </Text>
        <HStack spacing={6}>
          {hasDelta ? (
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(delta > 0 ? colors.green : colors.red)]}>{signed(delta)}</Text>
          ) : null}
          <Text modifiers={[font({ textStyle: 'subheadline' }), secondary, lineLimit(1)]}>
            {hasDelta ? 'к прошлому такому же периоду' : `${data.current.checks} ${plural(data.current.checks, ['чек', 'чека', 'чеков'])} за период`}
          </Text>
        </HStack>
      </VStack>
    </Section>
  );
}

/** Четыре ключевых показателя парами — выручка, чеки, средний чек, гости. */
function KpiSection({ data, guests }: { data: Overview; guests?: Insights['guests'] }) {
  const cur = data.current;
  const prev = data.previous;
  return (
    <Section title="Показатели" footer={<Text>Изменение — к прошлому периоду такой же длины. Средний чек — без мероприятий.</Text>}>
      <HStack spacing={12}>
        <Tile label="Выручка" value={money(cur.revenueNet)} delta={data.deltas.revenue} />
        <Tile label="Чеки" value={String(cur.checks)} delta={data.deltas.checks} />
      </HStack>
      <HStack spacing={12}>
        <Tile label="Средний чек" value={money(Math.round(cur.avgCheck))} delta={pct(Math.round(cur.avgCheck), Math.round(prev.avgCheck))} />
        <Tile label="Гости" value={guests ? String(guests.unique) : '—'} caption={guests ? `новых ${guests.new}` : undefined} />
      </HStack>
    </Section>
  );
}

/** Отчёт о прибыли строками, как выписка: выручка, расходы по статьям, итог. */
function ProfitSection({ current }: { current: NetBreakdown & { margin?: number | null } }) {
  const net = current.net ?? 0;
  const base = current.revenueNet > 0 ? current.revenueNet : 0;
  const row = (label: string, value: number) => (
    <LabeledContent key={label} label={label}>
      <Text modifiers={[secondary, monospacedDigit()]}>{`${value > 0 ? '−' : ''}${money(value)}`}</Text>
    </LabeledContent>
  );
  return (
    <Section
      title="Прибыль"
      footer={
        <Text>
          {current.margin !== null && current.margin !== undefined
            ? `Маржа ${current.margin}% от выручки за вычетом возвратов.`
            : 'Выручка за вычетом возвратов, себестоимости, расходов и эквайринга.'}
        </Text>
      }>
      <LabeledContent label="Выручка">
        <Text modifiers={[primary, monospacedDigit()]}>{money(current.revenueNet)}</Text>
      </LabeledContent>
      {row(`Себестоимость${base ? ` · ${share(current.cogs ?? 0, base)}%` : ''}`, current.cogs ?? 0)}
      {row(`Расходы и зарплата${base ? ` · ${share(current.expenses ?? 0, base)}%` : ''}`, current.expenses ?? 0)}
      {row('Эквайринг СБП', current.commission ?? 0)}
      <LabeledContent label={net >= 0 ? 'Прибыль' : 'Убыток'}>
        <Text modifiers={[font({ weight: 'bold' }), foregroundStyle(net >= 0 ? colors.green : colors.red), monospacedDigit()]}>{money(net)}</Text>
      </LabeledContent>
    </Section>
  );
}

/** Динамика по дням: выручка, чеки или средний чек — со средней линией и лучшим днём. */
function TrendSection({
  period,
  series,
  metric,
  onMetric,
}: {
  period: ResolvedPeriod;
  series: { date: string; revenue: number; count: number }[];
  metric: Metric;
  onMetric: (m: Metric) => void;
}) {
  const accent = useAccentHex();
  const byDate = new Map(series.map((d) => [d.date, d]));
  const points = Array.from({ length: period.days }, (_, index) => {
    const date = addDays(period.from, index);
    const day = byDate.get(date);
    const revenue = Math.max(0, day?.revenue ?? 0);
    const count = day?.count ?? 0;
    return { date, value: metric === 'revenue' ? Math.round(revenue) : metric === 'checks' ? count : count > 0 ? Math.round(revenue / count) : 0 };
  });
  const active = points.filter((p) => p.value > 0);
  const avg = active.length > 0 ? Math.round(active.reduce((s, p) => s + p.value, 0) / (metric === 'avg' ? active.length : points.length)) : 0;
  const best = points.reduce((max, p) => (p.value > max.value ? p : max), points[0]!);
  const fmt = (v: number) => (metric === 'checks' ? String(v) : money(v));
  const long = period.days > 45;

  return (
    <Section
      title="Динамика"
      footer={<Text>{`В среднем ${fmt(avg)} ${metric === 'avg' ? 'за чек' : 'в день'} · лучший день — ${formatDay(best.date)}: ${fmt(best.value)}`}</Text>}>
      <Picker selection={metric} onSelectionChange={(value) => onMetric(value as Metric)} modifiers={[pickerStyle('segmented')]}>
        <Text modifiers={[tag('revenue')]}>Выручка</Text>
        <Text modifiers={[tag('checks')]}>Чеки</Text>
        <Text modifiers={[tag('avg')]}>Средний чек</Text>
      </Picker>
      <Chart
        type={long ? 'line' : 'bar'}
        animate
        showGrid
        data={points.map((p, index) => ({ x: index + 1, y: p.value, color: !long && p.date === best.date && best.value > 0 ? '#34C759' : accent }))}
        barStyle={{ cornerRadius: 3 }}
        lineStyle={{ width: 2.5, color: accent }}
        referenceLines={avg > 0 ? [{ x: 0, y: avg }] : undefined}
        ruleStyle={{ color: colors.secondaryLabel, lineWidth: 1, dashArray: [4, 4] }}
        modifiers={[frame({ height: 190 })]}
      />
      <Text modifiers={[font({ textStyle: 'caption2' }), secondary]}>{`${formatDay(period.from)} — ${formatDay(period.to)} · по дням, пунктир — среднее`}</Text>
    </Section>
  );
}

/** Когда клуб зарабатывает: по часу открытия чека, по дням недели и теплокартой. */
function RhythmSection({ insights, rhythm, onRhythm }: { insights: Insights; rhythm: Rhythm; onRhythm: (r: Rhythm) => void }) {
  const accent = useAccentHex();
  const startHour = useBusinessDayStartHour();
  const { width } = useWindowDimensions();
  const order = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);
  const withData = order.filter((h) => insights.hours.some((x) => x.hour === h && x.checks > 0));
  if (withData.length === 0) return null;
  const first = order.indexOf(withData[0]);
  const last = order.indexOf(withData[withData.length - 1]);
  const hours = order.slice(first, last + 1).map((h) => insights.hours.find((x) => x.hour === h) ?? { hour: h, checks: 0, revenue: 0 });
  const peak = hours.reduce((max, h) => (h.revenue > max.revenue ? h : max), hours[0]!);
  const bestDay = insights.weekdays.reduce((max, d) => (d.avgRevenue > max.avgRevenue ? d : max), insights.weekdays[0]!);
  const heatWidth = Math.min(width, MAX_CONTENT_WIDTH) - 72;

  const footer =
    rhythm === 'weekdays'
      ? `Лучший день — ${WEEKDAYS[bestDay.dow - 1]}: в среднем ${money(bestDay.avgRevenue)} за день.`
      : rhythm === 'heat'
        ? 'Чем ярче клетка, тем больше оборот в этот день недели и час.'
        : `Пик — ${hourRange(peak.hour)}: ${money(peak.revenue)} за период. Время — открытие чека.`;

  return (
    <Section title="Ритм клуба" footer={<Text>{footer}</Text>}>
      <Picker selection={rhythm} onSelectionChange={(value) => onRhythm(value as Rhythm)} modifiers={[pickerStyle('segmented')]}>
        <Text modifiers={[tag('hours')]}>По часам</Text>
        <Text modifiers={[tag('weekdays')]}>Дни недели</Text>
        <Text modifiers={[tag('heat')]}>Карта</Text>
      </Picker>
      {rhythm === 'hours' && (
        <Chart
          type="bar"
          animate
          data={hours.map((h) => ({ x: String(h.hour).padStart(2, '0'), y: h.revenue, color: h.hour === peak.hour ? '#34C759' : accent }))}
          barStyle={{ cornerRadius: 3 }}
          modifiers={[frame({ height: 170 })]}
        />
      )}
      {rhythm === 'weekdays' && (
        <Chart
          type="bar"
          animate
          data={insights.weekdays.map((d) => ({ x: WEEKDAYS_SHORT[d.dow - 1], y: d.avgRevenue, color: d.dow === bestDay.dow ? '#34C759' : accent }))}
          barStyle={{ cornerRadius: 4 }}
          modifiers={[frame({ height: 170 })]}
        />
      )}
      {rhythm === 'heat' && (
        <RNHostView matchContents>
          <Heatmap cells={insights.heat} startHour={startHour} width={heatWidth} color={accent} />
        </RNHostView>
      )}
    </Section>
  );
}

/** Из чего сложилась выручка: бар, игры, аренда, мероприятия; скидки — строкой ниже. */
function StructureSection({ structure }: { structure: Insights['structure'] }) {
  const parts = STRUCTURE.map((p) => ({ ...p, value: structure[p.key] })).filter((p) => p.value > 0);
  const gross = parts.reduce((s, p) => s + p.value, 0);
  return (
    <Section title="Структура выручки" footer={<Text>{structure.discounts > 0 ? `Доли — до скидок; скидки уменьшили выручку на ${money(structure.discounts)}.` : 'Доли — от суммы до скидок.'}</Text>}>
      <Chart type="pie" animate data={parts.map((p) => ({ x: p.label, y: p.value, color: p.color }))} pieStyle={{ innerRadius: 0.62, angularInset: 1.5 }} modifiers={[frame({ height: 180 })]} />
      {parts.map((p) => (
        <LegendRow key={p.key} color={p.color} label={p.label} value={money(Math.round(p.value))} percent={share(p.value, gross)} />
      ))}
    </Section>
  );
}

function PaymentsSection({ breakdown }: { breakdown: { method: string; total: string }[] }) {
  const rows = breakdown
    .map((b) => ({ method: b.method, value: toNumber(b.total), look: methodLook(b.method) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return null;
  return (
    <Section title="Способы оплаты">
      <Chart type="pie" animate data={rows.map((r) => ({ x: r.look.title, y: r.value, color: r.look.color }))} pieStyle={{ innerRadius: 0.62, angularInset: 1.5 }} modifiers={[frame({ height: 160 })]} />
      {rows.map((r) => (
        <LegendRow key={r.method} color={r.look.color} label={r.look.title} value={money(Math.round(r.value))} percent={share(r.value, total)} />
      ))}
    </Section>
  );
}

function GuestsSection({ guests, checks, onOpen }: { guests: Insights['guests']; checks: number; onOpen: () => void }) {
  if (guests.unique === 0 && guests.anonymousChecks === 0) return null;
  return (
    <Section title="Гости" footer={<Text>Новые — впервые пришли в этом периоде. Чеки без гостя — без выбранного игрока.</Text>}>
      <LabeledContent label="Уникальных гостей">
        <Text modifiers={[primary, monospacedDigit()]}>{String(guests.unique)}</Text>
      </LabeledContent>
      <LabeledContent label="Новых">
        <Text modifiers={[guests.new > 0 ? foregroundStyle(colors.green) : secondary, monospacedDigit()]}>{String(guests.new)}</Text>
      </LabeledContent>
      <LabeledContent label="Вернувшихся">
        <Text modifiers={[primary, monospacedDigit()]}>{String(guests.returning)}</Text>
      </LabeledContent>
      <LabeledContent label="Чеков без гостя">
        <Text modifiers={[secondary, monospacedDigit()]}>{`${guests.anonymousChecks} из ${checks}`}</Text>
      </LabeledContent>
      <LinkRow title="Игроки и сегменты" onPress={onOpen} />
    </Section>
  );
}

function TopSection({ rows, total, onOpen }: { rows: { itemId: string; name: string | null; totalQty: string; totalRev: string }[]; total: number; onOpen: () => void }) {
  return (
    <Section title="Лучшие позиции">
      {rows.map((r, index) => (
        <HStack key={r.itemId} spacing={10}>
          <Text modifiers={[secondary, monospacedDigit(), frame({ width: 18, alignment: 'leading' })]}>{String(index + 1)}</Text>
          <VStack alignment="leading" spacing={1}>
            <Text modifiers={[primary, lineLimit(1)]}>{r.name ?? 'Позиция'}</Text>
            <Text modifiers={[font({ textStyle: 'footnote' }), secondary]}>{`${toNumber(r.totalQty)} шт. · ${share(toNumber(r.totalRev), total)}% выручки позиций`}</Text>
          </VStack>
          <Spacer />
          <Text modifiers={[primary, monospacedDigit()]}>{money(toNumber(r.totalRev))}</Text>
        </HStack>
      ))}
      <LinkRow title="Все позиции и ABC-анализ" onPress={onOpen} />
    </Section>
  );
}

function EventsSection({ current, owner, onOpen }: { current: NetBreakdown; owner: boolean; onOpen: () => void }) {
  return (
    <Section title="Мероприятия">
      <LabeledContent label={`Выручка · ${current.eventChecks} ${plural(current.eventChecks, ['чек', 'чека', 'чеков'])}`}>
        <Text modifiers={[primary, monospacedDigit()]}>{money(current.eventRevenue)}</Text>
      </LabeledContent>
      {owner && current.eventCosts !== undefined && (
        <LabeledContent label="За вычетом расходов">
          <Text modifiers={[primary, monospacedDigit()]}>{money(current.eventRevenue - current.eventCosts)}</Text>
        </LabeledContent>
      )}
      <LinkRow title="Отчёт по мероприятиям" onPress={onOpen} />
    </Section>
  );
}

/** Тренд за 12 месяцев до конца периода: оборот по месяцам и рост к прошлому месяцу. */
function YearSection({ months }: { months: Insights['months'] }) {
  const accent = useAccentHex();
  if (months.filter((m) => m.revenue > 0).length < 2) return null;
  const last = months[months.length - 1]!;
  const prev = months[months.length - 2]!;
  const best = months.reduce((max, m) => (m.revenue > max.revenue ? m : max), months[0]!);
  const label = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
  const growth = pct(last.revenue, prev.revenue);
  return (
    <Section
      title="12 месяцев"
      footer={<Text>{`Лучший месяц — ${label(best.month)} ${best.month.slice(0, 4)}: ${money(best.revenue)}. Этот месяц к прошлому: ${growth === 0 ? 'без изменений' : signed(growth)}.`}</Text>}>
      <Chart type="bar" animate showGrid data={months.map((m) => ({ x: label(m.month), y: m.revenue, color: m.month === best.month ? '#34C759' : accent }))} barStyle={{ cornerRadius: 4 }} modifiers={[frame({ height: 170 })]} />
    </Section>
  );
}
