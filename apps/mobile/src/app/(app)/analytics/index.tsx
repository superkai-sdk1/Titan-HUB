import { Chart, Host } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppRefreshControl } from '@/components/refresh-control';
import { BarRow, KpiTile, methodLook, money, PeriodChips, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { addDays, formatDay, useAnalyticsPeriod, useOverview, useRevenueSeries, type NetBreakdown } from '@/lib/analytics-api';
import { toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { queryClient } from '@/lib/query';
import { useClubKey } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, space, type, useAccentHex } from '@/lib/theme';

type SectionPath = '/analytics/checks' | '/analytics/products' | '/analytics/players' | '/analytics/events' | '/analytics/tariffs' | '/analytics/staff';

const SECTIONS: { path: SectionPath; title: string; caption: string; icon: SFSymbol; color: string; ownerOnly?: boolean }[] = [
  { path: '/analytics/checks', title: 'Чеки', caption: 'Все закрытые чеки и итог за период', icon: 'receipt', color: '#3B82F6' },
  { path: '/analytics/products', title: 'Бар и товары', caption: 'ABC-анализ и категории', icon: 'cup.and.saucer.fill', color: '#F59E0B' },
  { path: '/analytics/players', title: 'Игроки', caption: 'Сегменты, удержание, топ гостей', icon: 'person.2.fill', color: '#10B981' },
  { path: '/analytics/events', title: 'Мероприятия', caption: 'Заказы, часы, форматы, заказчики', icon: 'calendar', color: '#8B5CF6' },
  { path: '/analytics/tariffs', title: 'Игры и тарифы', caption: 'Игровые вечера и продажи тарифов', icon: 'suit.spade.fill', color: '#EC4899' },
  { path: '/analytics/staff', title: 'Персонал', caption: 'Списания на сотрудников', icon: 'person.badge.key.fill', color: '#64748B', ownerOnly: true },
];

/**
 * Аналитика — обзор периода: прибыль и куда ушла выручка (владельцу), выручка, чеки,
 * выручка по дням и способы оплаты графиками Swift Charts. Ниже — отчёты с подробностями.
 */
export default function AnalyticsScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const club = useClubKey();
  const accent = useAccentHex();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const period = useAnalyticsPeriod();
  const overview = useOverview(period.from, period.to);
  const series = useRevenueSeries(period.from, period.to, period.days > 1);
  const [pulling, setPulling] = useState(false);
  const data = overview.data;

  const refresh = async () => {
    setPulling(true);
    await queryClient.refetchQueries({ queryKey: [club, 'analytics'], type: 'active' });
    setPulling(false);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, gutter, { paddingTop: insets.top }]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} progressViewOffset={insets.top} refreshing={pulling} onRefresh={refresh} />}>
        <View style={styles.headerRow}>
          <View style={styles.header}>
            <Text style={[type.largeTitle, styles.label]}>Аналитика</Text>
            <Text style={[type.subhead, styles.secondary]}>{period.label}</Text>
          </View>
          {/* Tai отвечает по тем же данным — держим его рядом с отчётами. */}
          <Pressable
            onPress={() => {
              haptic.light();
              router.push('/tai');
            }}
            style={({ pressed }) => [styles.taiButton, pressed && styles.taiPressed]}
            accessibilityRole="button"
            accessibilityLabel="Спросить Tai">
            <GlassCard interactive style={styles.taiCard}>
              <SymbolView name="sparkles" size={20} tintColor={accent} />
            </GlassCard>
          </Pressable>
        </View>
        <PeriodChips period={period} />

        <QueryState loading={!data} error={overview.error}>
          {data && (
            <>
              {isOwner && data.current.net !== undefined ? <ProfitCard current={data.current} delta={data.deltas.profit} /> : <RevenueHero current={data.current} delta={data.deltas.revenue} />}

              <TileGrid>
                <KpiTile label="Выручка" icon="rublesign.circle" value={money(data.current.gross)} delta={data.deltas.revenue} caption={data.current.refunds > 0 ? `возвраты −${money(data.current.refunds)}` : 'без возвратов'} />
                <KpiTile label="Чеки" icon="receipt" color={colors.blue} value={String(data.current.checks)} delta={data.deltas.checks} caption={`средний ${money(Math.round(data.current.avgCheck))}`} />
                {isOwner && data.current.cogs !== undefined && (
                  <KpiTile
                    label="Себестоимость"
                    icon="shippingbox"
                    color={colors.orange}
                    value={money(data.current.cogs)}
                    delta={data.deltas.cogs}
                    invertDelta
                    caption={data.current.gross > 0 ? `${Math.round((data.current.cogs / data.current.gross) * 100)}% от выручки` : undefined}
                  />
                )}
                {isOwner && data.current.expenses !== undefined && (
                  <KpiTile
                    label="Расходы и ЗП"
                    icon="banknote"
                    color={colors.red}
                    value={money(data.current.expenses)}
                    delta={data.deltas.expenses}
                    invertDelta
                    caption={`зарплата ${money(data.current.salary ?? 0)}`}
                  />
                )}
              </TileGrid>

              {period.days > 1 && series.data && <RevenueChart from={period.from} days={period.days} series={series.data.revenue} accent={accent} />}

              {data.paymentBreakdown.length > 0 && <PaymentsCard breakdown={data.paymentBreakdown} />}

              {data.current.eventChecks > 0 && (
                <GlassCard style={styles.card}>
                  <View style={styles.pad}>
                    <SectionTitle>МЕРОПРИЯТИЯ</SectionTitle>
                  </View>
                  <View style={styles.row}>
                    <Mini label="Выручка" value={money(data.current.eventRevenue)} />
                    <Mini label="Чеков" value={String(data.current.eventChecks)} />
                    {isOwner && data.current.eventCosts !== undefined && <Mini label="За вычетом расходов" value={money(data.current.eventRevenue - data.current.eventCosts)} />}
                  </View>
                </GlassCard>
              )}

              {period.preset !== 'today' && (
                <GlassCard style={styles.card}>
                  <View style={styles.pad}>
                    <SectionTitle>{`СЕГОДНЯ · ${formatDay(data.businessDay, true).toUpperCase()}`}</SectionTitle>
                  </View>
                  <View style={styles.row}>
                    <Mini label="Выручка" value={money(data.today.gross)} />
                    <Mini label="Чеков" value={String(data.today.checks)} />
                    <Mini label="Средний" value={money(Math.round(data.today.avgCheck))} />
                  </View>
                </GlassCard>
              )}
            </>
          )}
        </QueryState>

        <View style={styles.sections}>
          <SectionTitle>ОТЧЁТЫ</SectionTitle>
          <GlassCard>
            {SECTIONS.filter((s) => !s.ownerOnly || isOwner).map((section, index) => (
              <View key={section.path}>
                {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    router.push(section.path);
                  }}
                  style={({ pressed }) => [styles.sectionRow, pressed && sheetStyles.pressedRow]}
                  accessibilityRole="button">
                  <View style={[styles.sectionIcon, { backgroundColor: section.color }]}>
                    <SymbolView name={section.icon} size={15} weight="semibold" tintColor="white" />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[type.body, styles.label]}>{section.title}</Text>
                    <Text style={[type.footnote, styles.secondary]}>{section.caption}</Text>
                  </View>
                  <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
                </Pressable>
              </View>
            ))}
          </GlassCard>
        </View>
      </ScrollView>
    </AmbientBackdrop>
  );
}

function RevenueHero({ current, delta }: { current: NetBreakdown; delta: number }) {
  return (
    <GlassCard style={styles.hero}>
      <SectionTitle>ВЫРУЧКА ЗА ПЕРИОД</SectionTitle>
      <RollingText text={money(current.revenueNet)} style={[styles.heroValue, type.amount]} />
      <Text style={[type.subhead, styles.secondary]}>
        {`${current.checks} чеков · средний ${money(Math.round(current.avgCheck))}${delta ? ` · ${delta > 0 ? '+' : '−'}${Math.abs(delta)}% к прошлому периоду` : ''}`}
      </Text>
    </GlassCard>
  );
}

/** Прибыль и «куда ушла выручка» одной полосой: себестоимость, расходы, эквайринг с возвратами, остаток. */
function ProfitCard({ current, delta }: { current: NetBreakdown & { margin?: number | null }; delta?: number }) {
  const net = current.net ?? 0;
  const parts = [
    { key: 'cogs', label: 'Себестоимость', value: current.cogs ?? 0, color: '#F59E0B' },
    { key: 'expenses', label: 'Расходы и зарплата', value: current.expenses ?? 0, color: '#F43F5E' },
    { key: 'fees', label: 'Эквайринг и возвраты', value: (current.commission ?? 0) + current.refunds, color: '#94A3B8' },
    { key: 'profit', label: net >= 0 ? 'Прибыль' : 'Убыток', value: Math.max(net, 0), color: '#10B981' },
  ];
  const outflow = parts.slice(0, 3).reduce((s, p) => s + p.value, 0);
  const base = Math.max(current.gross, outflow, 1);

  return (
    <GlassCard style={styles.hero}>
      <SectionTitle>{net >= 0 ? 'ПРИБЫЛЬ ЗА ПЕРИОД' : 'УБЫТОК ЗА ПЕРИОД'}</SectionTitle>
      <View style={styles.heroTop}>
        <RollingText text={money(net)} style={[styles.heroValue, type.amount, { color: net >= 0 ? colors.label : colors.red }]} />
        {delta !== undefined && delta !== 0 && (
          <View style={[styles.heroDelta, { backgroundColor: delta > 0 ? 'rgba(52,199,89,0.16)' : 'rgba(255,59,48,0.14)' }]}>
            <Text style={[type.footnote, styles.bold, { color: delta > 0 ? colors.green : colors.red }]}>{`${delta > 0 ? '+' : '−'}${Math.abs(delta)}%`}</Text>
          </View>
        )}
      </View>
      <Text style={[type.subhead, styles.secondary]}>
        {current.margin !== null && current.margin !== undefined ? `маржа ${current.margin}% · выручка ${money(current.revenueNet)}` : `выручка ${money(current.revenueNet)}`}
      </Text>
      <View style={styles.stack}>{parts.map((p) => (p.value > 0 ? <View key={p.key} style={{ flex: p.value / base, backgroundColor: p.color }} /> : null))}</View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={[type.caption1, styles.secondary, styles.flex]} numberOfLines={1}>
              {p.label}
            </Text>
            <Text style={[type.caption1, type.amount, styles.label]}>{money(p.key === 'profit' ? net : p.value)}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

function RevenueChart({ from, days, series, accent }: { from: string; days: number; series: { date: string; revenue: number; count: number }[]; accent: string }) {
  const byDate = new Map(series.map((d) => [d.date, d.revenue]));
  const points = Array.from({ length: days }, (_, index) => {
    const date = addDays(from, index);
    return { date, revenue: Math.max(0, byDate.get(date) ?? 0) };
  });
  const total = points.reduce((s, p) => s + p.revenue, 0);
  const best = points.reduce((max, p) => (p.revenue > max.revenue ? p : max), points[0]!);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.pad}>
        <SectionTitle>ВЫРУЧКА ПО ДНЯМ</SectionTitle>
      </View>
      <View style={styles.row}>
        <Mini label="В среднем за день" value={money(Math.round(total / days))} />
        <Mini label={`Лучший день · ${formatDay(best.date)}`} value={money(best.revenue)} />
      </View>
      <Host style={styles.chart}>
        <Chart
          type="bar"
          animate
          showGrid
          data={points.map((p, index) => ({ x: index + 1, y: Math.round(p.revenue), color: p.date === best.date && best.revenue > 0 ? '#10B981' : accent }))}
          barStyle={{ cornerRadius: 3 }}
        />
      </Host>
      <Text style={[type.caption2, styles.secondary, styles.centered]}>{`${formatDay(from)} — ${formatDay(addDays(from, days - 1))} · номер дня периода`}</Text>
    </GlassCard>
  );
}

function PaymentsCard({ breakdown }: { breakdown: { method: string; total: string }[] }) {
  const rows = breakdown
    .map((b) => ({ method: b.method, value: toNumber(b.total), look: methodLook(b.method) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return null;
  return (
    <GlassCard style={styles.card}>
      <View style={styles.pad}>
        <SectionTitle>СПОСОБЫ ОПЛАТЫ</SectionTitle>
      </View>
      <View style={styles.payments}>
        <Host style={styles.donut}>
          <Chart type="pie" animate data={rows.map((r) => ({ x: r.look.title, y: r.value, color: r.look.color }))} pieStyle={{ innerRadius: 0.62, angularInset: 1.5 }} />
        </Host>
        <View style={styles.flex}>
          {rows.map((r) => (
            <View key={r.method} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: r.look.color }]} />
              <Text style={[type.footnote, styles.label, styles.flex]} numberOfLines={1}>
                {r.look.title}
              </Text>
              <Text style={[type.footnote, styles.secondary]}>{`${Math.round((r.value / total) * 100)}%`}</Text>
            </View>
          ))}
        </View>
      </View>
      {rows.map((r) => (
        <BarRow key={r.method} label={r.look.title} value={money(r.value)} share={r.value / rows[0]!.value} color={r.look.color} />
      ))}
    </GlassCard>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mini}>
      <Text style={[type.caption1, styles.secondary]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.headline, type.amount, styles.label]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  header: { flex: 1, paddingTop: space.xs, paddingHorizontal: 2, gap: 2 },
  taiButton: { paddingBottom: 2 },
  taiPressed: { opacity: 0.6 },
  taiCard: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hero: { padding: space.lg, gap: space.xs },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroValue: { fontSize: 40, lineHeight: 46, color: colors.label },
  heroDelta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  stack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.fill, marginTop: space.sm },
  legend: { gap: 4, marginTop: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 22 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  card: { paddingVertical: space.lg, gap: space.sm },
  pad: { paddingHorizontal: space.lg },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
  mini: { flex: 1, gap: 2 },
  chart: { height: 170, marginHorizontal: space.lg },
  payments: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg },
  donut: { width: 120, height: 120 },
  sections: { gap: space.sm, marginTop: space.sm },
  separator: { marginLeft: 58 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
  sectionIcon: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
});
