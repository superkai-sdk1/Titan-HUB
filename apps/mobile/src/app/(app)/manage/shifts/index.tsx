import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, GlassChip, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { formatDuration, formatMoney, formatTime, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useShiftSummary } from '@/lib/queries';
import { EVENING_LABEL, useCashOps, useShiftHistory, type CashOpItem } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', weekday: 'short' });

const OP_LOOK: Record<CashOpItem['type'], { title: string; symbol: SFSymbol; color: string; sign: 1 | -1 }> = {
  deposit: { title: 'Внесение', symbol: 'arrow.down.circle.fill', color: '#10B981', sign: 1 },
  withdrawal: { title: 'Изъятие', symbol: 'arrow.up.circle.fill', color: '#F59E0B', sign: -1 },
  salary: { title: 'Зарплата', symbol: 'person.crop.circle.badge.checkmark', color: '#06B6D4', sign: -1 },
};

const money = (value: number, sign = false) => formatMoney(value, { sign, kopecks: 'auto' });

/**
 * «Смены»: текущая смена — сколько в кассе и откуда, операции с наличными, быстрые действия;
 * ниже история смен, каждая открывается подробным отчётом.
 */
export default function ShiftsScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const now = useNow(60_000);
  const summary = useShiftSummary();
  const open = summary.data?.shift ? summary.data : null;
  const shift = open?.shift ?? null;
  const cashOps = useCashOps(!!shift);
  const history = useShiftHistory();
  const [pulling, setPulling] = useState(false);

  const balance = cashOps.data?.balance;
  const operations = cashOps.data?.operations ?? [];
  const pastShifts = (history.data?.pages.flat() ?? []).filter((row) => row.shift.status === 'closed');

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([summary.refetch(), cashOps.refetch(), history.refetch()]);
    setPulling(false);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Смены</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        {summary.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : shift ? (
          <GlassCard style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
              <Text style={[type.headline, styles.label, styles.flex]}>{`Открыта в ${formatTime(shift.openedAt)}`}</Text>
              <Text style={[type.subhead, styles.secondary]}>{formatDuration(shift.openedAt, now)}</Text>
            </View>
            {EVENING_LABEL[shift.eveningType] && (
              <View style={styles.evening}>
                <SymbolView name="moon.stars" size={13} tintColor={colors.accent} />
                <Text style={[type.footnote, styles.eveningText]}>{EVENING_LABEL[shift.eveningType]}</Text>
              </View>
            )}

            <View style={styles.cash}>
              <Text style={[type.footnote, styles.caption]}>В КАССЕ</Text>
              <RollingText text={money(balance?.expected ?? open?.cashInRegister ?? 0)} style={[styles.cashAmount, type.amount]} />
            </View>

            {balance && (
              <View style={styles.breakdown}>
                <Line label="Начало смены" value={money(balance.cashStart)} />
                {!!balance.cashPayments && <Line label="Наличные оплаты" value={money(balance.cashPayments, true)} />}
                {!!balance.deposits && <Line label="Внесения" value={money(balance.deposits, true)} positive />}
                {!!balance.withdrawals && <Line label="Изъятия" value={money(-balance.withdrawals)} />}
                {!!balance.salaries && <Line label="Зарплаты" value={money(-balance.salaries)} />}
                {!!balance.cashRefundTotal && <Line label="Возвраты наличными" value={money(-balance.cashRefundTotal)} />}
              </View>
            )}

            <View style={styles.actions}>
              <GlassChip
                style={styles.flex}
                label="Внести"
                icon="arrow.down.circle"
                tint="#10B981"
                active={false}
                onPress={() => {
                  haptic.light();
                  router.push({ pathname: '/shift/cash', params: { type: 'deposit' } });
                }}
              />
              <GlassChip
                style={styles.flex}
                label="Изъять"
                icon="arrow.up.circle"
                tint="#F59E0B"
                active={false}
                onPress={() => {
                  haptic.light();
                  router.push({ pathname: '/shift/cash', params: { type: 'withdrawal' } });
                }}
              />
            </View>
            <Pressable
              onPress={() => {
                haptic.light();
                router.push('/shift/close');
              }}
              style={({ pressed }) => [styles.closeShift, pressed && styles.pressed]}
              accessibilityRole="button">
              <SymbolView name="moon" size={15} tintColor={colors.red} />
              <Text style={[type.body, styles.closeShiftText]}>Закрыть смену</Text>
            </Pressable>
          </GlassCard>
        ) : (
          <GlassCard style={[styles.card, styles.closedCard]}>
            <SymbolView name="moon.zzz" size={40} tintColor={colors.secondaryLabel} />
            <Text style={[type.title3, styles.label]}>Смена закрыта</Text>
            <Text style={[type.subhead, styles.secondary, styles.centered]}>Чтобы открывать чеки, начните смену и пересчитайте наличные.</Text>
            <View style={styles.stretch}>
              <PrimaryButton
                title="Открыть смену"
                icon="sunrise"
                onPress={() => {
                  haptic.light();
                  router.push('/shift/open');
                }}
              />
            </View>
          </GlassCard>
        )}

        {shift && operations.length > 0 && (
          <View style={styles.section}>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>ОПЕРАЦИИ С НАЛИЧНЫМИ</Text>
            <GlassCard>
              {operations.map((op, index) => {
                const look = OP_LOOK[op.type];
                return (
                  <Animated.View key={op.id} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.opSeparator]} />}
                    <View style={styles.opRow}>
                      <SymbolView name={look.symbol} size={26} tintColor={look.color} />
                      <View style={styles.flex}>
                        <Text style={[type.body, styles.label]} numberOfLines={1}>
                          {op.description || look.title}
                        </Text>
                        <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
                          {[formatTime(op.createdAt), op.createdBy].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={[type.body, type.amount, { color: look.sign > 0 ? colors.green : colors.label }]}>
                        {money(look.sign * toNumber(op.amount), look.sign > 0)}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })}
            </GlassCard>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>ИСТОРИЯ</Text>
          {history.isLoading ? (
            <ActivityIndicator style={styles.loadingSmall} />
          ) : pastShifts.length === 0 ? (
            <Text style={[type.subhead, styles.secondary, styles.empty]}>Закрытых смен пока нет</Text>
          ) : (
            <GlassCard>
              {pastShifts.map(({ shift: row, openedByNickname }, index) => (
                <View key={row.id}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.historySeparator]} />}
                  <Pressable
                    onPress={() => {
                      haptic.selection();
                      router.push({ pathname: '/manage/shifts/[shiftId]', params: { shiftId: row.id } });
                    }}
                    style={({ pressed }) => [styles.historyRow, pressed && sheetStyles.pressedRow]}
                    accessibilityRole="button">
                    <View style={styles.historyDate}>
                      <SymbolView name="calendar" size={16} tintColor={colors.accent} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[type.body, styles.label]} numberOfLines={1}>
                        {capitalize(dateFormat.format(new Date(row.openedAt)))}
                      </Text>
                      <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
                        {[`${formatTime(row.openedAt)}–${row.closedAt ? formatTime(row.closedAt) : '…'}`, openedByNickname, EVENING_LABEL[row.eveningType]]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.historyCash}>
                      <Text style={[type.subhead, type.amount, styles.label]}>{row.cashEnd !== null ? money(toNumber(row.cashEnd)) : '—'}</Text>
                      <Text style={[type.caption2, styles.tertiary]}>в кассе</Text>
                    </View>
                    <SymbolView name="chevron.right" size={12} weight="semibold" tintColor={colors.tertiaryLabel} />
                  </Pressable>
                </View>
              ))}
            </GlassCard>
          )}
          {history.hasNextPage && (
            <Pressable
              onPress={() => void history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
              style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              accessibilityRole="button">
              {history.isFetchingNextPage ? <ActivityIndicator /> : <Text style={[type.subhead, styles.moreText]}>Показать ещё</Text>}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </AmbientBackdrop>
  );
}

function Line({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[type.subhead, styles.secondary, styles.flex]}>{label}</Text>
      <Text style={[type.subhead, type.amount, positive ? styles.green : styles.label]}>{value}</Text>
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  loading: { paddingTop: 80 },
  loadingSmall: { paddingVertical: space.xl },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  green: { color: colors.green },
  centered: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  card: { padding: space.lg, gap: space.md },
  closedCard: { alignItems: 'center', paddingVertical: space.xxl },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  evening: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
  eveningText: { color: colors.label, fontWeight: '600' },
  cash: { alignItems: 'center', gap: 2, paddingVertical: space.sm },
  caption: { color: colors.secondaryLabel, fontWeight: '600', letterSpacing: 0.6 },
  cashAmount: { fontSize: 44, lineHeight: 52, color: colors.label },
  breakdown: { gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  closeShift: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: space.sm },
  closeShiftText: { color: colors.red, fontWeight: '600' },
  section: { gap: space.sm },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56 },
  opSeparator: { marginLeft: 56 },
  empty: { paddingHorizontal: space.xs },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  historyDate: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  historySeparator: { marginLeft: 60 },
  historyCash: { alignItems: 'flex-end' },
  more: { alignSelf: 'center', paddingHorizontal: space.xl, paddingVertical: space.md, minHeight: 44, justifyContent: 'center' },
  moreText: { color: colors.accent, fontWeight: '600' },
});
