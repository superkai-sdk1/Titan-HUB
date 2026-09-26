import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppRefreshControl } from '@/components/refresh-control';
import { methodLook, money, PeriodChips, QueryState, SectionTitle } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Avatar, GlassCard } from '@/components/new-check-parts';
import { useAnalyticsChecks, useAnalyticsPeriod, type AnalyticsCheck, type NetBreakdown } from '@/lib/analytics-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const dayTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/**
 * Чеки периода: итог «от валовой выручки к чистой прибыли» (себестоимость и расходы — только
 * владельцу) и список закрытых чеков; тап открывает состав чека.
 */
export default function AnalyticsChecksScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const period = useAnalyticsPeriod();
  const checks = useAnalyticsChecks(period.from, period.to);
  const [pulling, setPulling] = useState(false);
  const list = checks.data?.checks ?? [];

  const refresh = async () => {
    setPulling(true);
    await checks.refetch();
    setPulling(false);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Чеки</Stack.Title>
      <FlashList
        data={checks.data ? list : []}
        keyExtractor={(check) => check.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PeriodChips period={period} />
            <QueryState loading={!checks.data} error={checks.error}>
              {checks.data && <Summary summary={checks.data.summary} isOwner={isOwner} />}
            </QueryState>
            {checks.data && <SectionTitle>{`ЗАКРЫТЫЕ ЧЕКИ · ${list.length}${list.length >= 1000 ? ' (первые 1000)' : ''}`}</SectionTitle>}
          </View>
        }
        ListEmptyComponent={checks.data ? <Text style={[type.subhead, styles.secondary, styles.empty]}>За период закрытых чеков нет</Text> : null}
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => (
          <CheckRow
            check={item}
            multiDay={period.days > 1}
            onPress={() => {
              haptic.selection();
              router.push({ pathname: '/analytics/check/[checkId]', params: { checkId: item.id } });
            }}
          />
        )}
      />
    </AmbientBackdrop>
  );
}

function Summary({ summary, isOwner }: { summary: NetBreakdown; isOwner: boolean }) {
  const lines: { label: string; value: number; tone?: 'minus' | 'total' }[] = [
    { label: 'Выручка валовая', value: summary.gross },
    { label: 'Возвраты', value: -summary.refunds, tone: 'minus' },
    ...(isOwner
      ? [
          { label: 'Эквайринг', value: -(summary.commission ?? 0), tone: 'minus' as const },
          { label: 'Себестоимость', value: -(summary.cogs ?? 0), tone: 'minus' as const },
          { label: 'Расходы', value: -(summary.opex ?? 0), tone: 'minus' as const },
          { label: 'Зарплата', value: -(summary.salary ?? 0), tone: 'minus' as const },
          { label: 'Чистая прибыль', value: summary.net ?? 0, tone: 'total' as const },
        ]
      : [{ label: 'Выручка после возвратов', value: summary.revenueNet, tone: 'total' as const }]),
  ];
  return (
    <GlassCard style={styles.summary}>
      <SectionTitle>ИТОГ ЗА ПЕРИОД</SectionTitle>
      {lines.map((line) => (
        <View key={line.label} style={[styles.line, line.tone === 'total' && styles.totalLine]}>
          <Text style={[line.tone === 'total' ? type.headline : type.subhead, line.tone === 'minus' ? styles.secondary : styles.label, styles.flex]}>{line.label}</Text>
          <Text style={[line.tone === 'total' ? type.headline : type.subhead, type.amount, line.tone === 'total' && line.value < 0 ? styles.red : styles.label]}>
            {line.tone === 'minus' && line.value === 0 ? '0 ₽' : money(line.value)}
          </Text>
        </View>
      ))}
      <Text style={[type.footnote, styles.secondary]}>{`${summary.checks} ${plural(summary.checks, ['чек', 'чека', 'чеков'])} · средний клубный ${money(Math.round(summary.avgCheck))}`}</Text>
    </GlassCard>
  );
}

function CheckRow({ check, multiDay, onPress }: { check: AnalyticsCheck; multiDay: boolean; onPress: () => void }) {
  const when = check.closedAt ?? check.createdAt;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${check.guestName ?? 'Гость'}, ${money(check.totalAmount)}`}>
      <GlassCard style={styles.row}>
        <Avatar name={check.guestName ?? 'Гость'} photoUrl={check.playerPhoto} size={40} />
        <View style={styles.flex}>
          <Text style={[type.body, styles.label]} numberOfLines={1}>
            {check.guestName ?? 'Гость'}
          </Text>
          <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
            {[(multiDay ? dayTime : time).format(new Date(when)), `${check.itemCount} поз.`, check.staffNickname].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.methods}>
            {check.payments.map((p, index) => {
              const look = methodLook(p.method);
              return (
                <View key={`${p.method}-${index}`} style={[styles.method, { backgroundColor: `${look.color}1F` }]}>
                  <Text style={[type.caption2, styles.methodText, { color: look.color }]}>{`${look.title} ${money(p.amount)}`}</Text>
                </View>
              );
            })}
            {check.linkedEventId && (
              <View style={[styles.method, styles.eventBadge]}>
                <Text style={[type.caption2, styles.methodText, styles.eventText]}>мероприятие</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={[type.headline, type.amount, styles.label]}>{money(check.totalAmount)}</Text>
      </GlassCard>
    </Pressable>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140 },
  header: { gap: space.md, paddingBottom: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  red: { color: colors.red },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  summary: { padding: space.lg, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingTop: space.sm, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  method: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  methodText: { fontWeight: '700' },
  eventBadge: { backgroundColor: 'rgba(139,92,246,0.16)' },
  eventText: { color: '#8B5CF6' },
  gap: { height: space.sm },
});
