import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { GlassView } from '@/components/glass';
import { Avatar, GlassCard, GlassChip, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { todayMsk } from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteExpense, EXPENSE_CATEGORIES, useExpensesSummary, type ExpenseRow } from '@/lib/inventory-api';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

type Period = 'today' | 'week' | 'month' | 'days30';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'days30', label: '30 дней' },
];

const rowLayout = LinearTransition.springify().damping(22).stiffness(220);
const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Календарные даты по Москве, как в веб-кассе. */
function rangeOf(period: Period): { from: string; to: string } {
  const to = todayMsk();
  switch (period) {
    case 'today':
      return { from: to, to };
    case 'week':
      return { from: todayMsk(-6), to };
    case 'month':
      return { from: `${to.slice(0, 8)}01`, to };
    default:
      return { from: todayMsk(-29), to };
  }
}

/**
 * Расходы клуба за период: итоги, распределение по категориям, затраты на персонал
 * (только владельцу — там зарплаты каждого) и список операционных расходов.
 */
export function ExpensesTab() {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [period, setPeriod] = useState<Period>('days30');
  const range = rangeOf(period);
  const summary = useExpensesSummary(range.from, range.to);
  const data = summary.data;

  const remove = (expense: ExpenseRow) =>
    Alert.alert('Удалить расход?', `${expense.description || EXPENSE_CATEGORIES[expense.category].label} · ${money(toNumber(expense.amount))}`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteExpense(expense.id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Расход не удалён', error instanceof Error ? error.message : String(error))),
      },
    ]);

  const bars = data
    ? [
        ...data.categories.map((c) => ({ key: c.category, label: EXPENSE_CATEGORIES[c.category].label, symbol: EXPENSE_CATEGORIES[c.category].symbol, color: EXPENSE_CATEGORIES[c.category].color, amount: c.amount })),
        ...(isOwner && data.salary.total > 0
          ? [{ key: 'salary', label: 'Зарплата', symbol: EXPENSE_CATEGORIES.salary.symbol, color: EXPENSE_CATEGORIES.salary.color, amount: data.salary.total }]
          : []),
      ].sort((a, b) => b.amount - a.amount)
    : [];
  const maxBar = Math.max(1, ...bars.map((b) => b.amount));
  const staffRows = (data?.byStaff ?? []).filter((s) => s.total > 0);

  return (
    <View style={styles.tab}>
      <PrimaryButton title="Добавить расход" icon="plus" onPress={() => router.push('/manage/inventory/expense-new')} />

      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <GlassChip
            key={p.key}
            style={styles.flex}
            label={p.label}
            active={period === p.key}
            onPress={() => {
              haptic.selection();
              setPeriod(p.key);
            }}
          />
        ))}
      </View>

      {!data ? (
        summary.isError ? (
          <Text style={[type.subhead, styles.secondary, styles.empty]}>{summary.error.message}</Text>
        ) : (
          <ActivityIndicator style={styles.state} />
        )
      ) : (
        <>
          <View style={styles.tiles}>
            <GlassView style={styles.tile}>
              <Text style={[type.footnote, styles.tileLabel]}>{isOwner ? 'Расходы (P&L)' : 'Операционные'}</Text>
              <RollingText text={money(isOwner ? data.pnlTotal : data.opexTotal)} style={[type.title2, type.amount, styles.label]} />
              <Text style={[type.caption1, styles.secondary]}>{isOwner ? 'расходы + зарплата' : 'без зарплат'}</Text>
            </GlassView>
            {isOwner && (
              <GlassView style={styles.tile}>
                <Text style={[type.footnote, styles.tileLabel]}>На персонал</Text>
                <RollingText text={money(data.staffTotal)} style={[type.title2, type.amount, styles.label]} />
                <Text style={[type.caption1, styles.secondary]}>зарплата + списания</Text>
              </GlassView>
            )}
          </View>

          <View style={styles.group}>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>ПО КАТЕГОРИЯМ</Text>
            <GlassCard style={styles.card}>
              {bars.length === 0 ? (
                <Text style={[type.subhead, styles.secondary, styles.centered]}>Расходов за период нет</Text>
              ) : (
                bars.map((bar) => (
                  <View key={bar.key} style={styles.bar}>
                    <View style={styles.barTop}>
                      <SymbolView name={bar.symbol} size={14} tintColor={bar.color} />
                      <Text style={[type.subhead, styles.label, styles.flex]}>{bar.label}</Text>
                      <Text style={[type.subhead, type.amount, styles.label]}>{money(bar.amount)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.max(2, (bar.amount / maxBar) * 100)}%`, backgroundColor: bar.color }]} />
                    </View>
                  </View>
                ))
              )}
            </GlassCard>
          </View>

          {isOwner && staffRows.length > 0 && (
            <View style={styles.group}>
              <Text style={[type.footnote, sheetStyles.sectionTitle]}>ПО СОТРУДНИКАМ</Text>
              <GlassCard>
                {staffRows.map((row, index) => (
                  <View key={row.staffId}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.staffSeparator]} />}
                    <View style={styles.staffRow}>
                      <Avatar name={row.nickname} photoUrl={row.photoUrl} size={36} />
                      <View style={styles.flex}>
                        <Text style={[type.body, styles.label]} numberOfLines={1}>
                          {row.nickname}
                        </Text>
                        <Text style={[type.footnote, styles.secondary]} numberOfLines={2}>
                          {[
                            row.salary > 0 ? `зарплата ${money(row.salary)}${row.salaryCash > 0 && row.salaryTransfer > 0 ? ` (нал ${money(row.salaryCash)} / пер ${money(row.salaryTransfer)})` : ''}` : null,
                            row.compCost > 0 ? `списания ${money(row.compCost)} (${row.compChecks})` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <Text style={[type.body, type.amount, styles.label]}>{money(row.total)}</Text>
                    </View>
                  </View>
                ))}
              </GlassCard>
              {data.staffComp.cost > 0 && <Text style={[type.footnote, styles.footnote]}>Себестоимость списаний на персонал уже учтена в себестоимости продаж и в «Расходы (P&L)» не входит.</Text>}
            </View>
          )}

          <View style={styles.group}>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`ОПЕРАЦИОННЫЕ РАСХОДЫ · ${data.expenses.length}`}</Text>
            <GlassCard>
              {data.expenses.length === 0 ? (
                <Text style={[type.subhead, styles.secondary, styles.centered, styles.listEmpty]}>Расходов нет</Text>
              ) : (
                data.expenses.map((expense, index) => {
                  const look = EXPENSE_CATEGORIES[expense.category];
                  const qty = toNumber(expense.quantity);
                  const price = toNumber(expense.unitPrice);
                  return (
                    <Animated.View key={expense.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                      {index > 0 && <View style={[sheetStyles.separator, styles.expenseSeparator]} />}
                      <SwipeToDelete enabled={isOwner && !expense.eventId} label="Удалить" onDelete={() => remove(expense)}>
                        <View style={styles.expenseRow}>
                          <View style={[styles.expenseIcon, { backgroundColor: `${look.color}24` }]}>
                            <SymbolView name={look.symbol} size={15} tintColor={look.color} />
                          </View>
                          <View style={styles.flex}>
                            <Text style={[type.body, styles.label]} numberOfLines={1}>
                              {expense.description || look.label}
                            </Text>
                            <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
                              {[
                                shortDate.format(new Date(`${expense.expenseDate}T12:00:00Z`)).replace('.', ''),
                                look.label,
                                qty > 0 && price > 0 ? `${qty} × ${money(price)}` : null,
                                expense.eventId ? 'мероприятие' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                          <Text style={[type.body, type.amount, styles.label]}>{money(toNumber(expense.amount))}</Text>
                        </View>
                      </SwipeToDelete>
                    </Animated.View>
                  );
                })
              )}
            </GlassCard>
            {isOwner && data.expenses.length > 0 && <Text style={[type.footnote, styles.footnote]}>Свайп влево — удалить. Расходы мероприятий правятся в самом мероприятии.</Text>}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: space.md },
  flex: { flex: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  state: { paddingVertical: space.xxl },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  periods: { flexDirection: 'row', gap: space.sm },
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { flex: 1, padding: space.lg, gap: 4, borderRadius: 22, borderCurve: 'continuous' },
  tileLabel: { color: colors.secondaryLabel, fontWeight: '600' },
  group: { gap: space.sm },
  card: { padding: space.lg, gap: space.md },
  bar: { gap: 6 },
  barTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  staffSeparator: { marginLeft: 64 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  footnote: { color: colors.tertiaryLabel, paddingHorizontal: space.xs },
  listEmpty: { paddingVertical: space.xl },
  expenseSeparator: { marginLeft: 60 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
  expenseIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
