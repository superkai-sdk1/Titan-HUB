import { GlassView } from 'expo-glass-effect';
import { useDebounced } from '@/components/player-picker';
import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { Unavailable } from '@/components/unavailable';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { TierBadge } from '@/components/client-row';
import { Avatar, GlassCard, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import {
  archiveCollection,
  CONTRIBUTION_METHODS,
  currentPeriodKey,
  removeContribution,
  rosterState,
  setPeriodAmount,
  useCollection,
  useCollectionPeriods,
  type ContributionMethod,
  type RosterRow,
} from '@/lib/collections-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';
import { promptText } from '@/lib/dialog';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

const rowLayout = LinearTransition.springify().damping(22).stiffness(220);
const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const untilFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

/**
 * Сбор: период (месяцы листаются только по уже открытым), сколько собрано и кем, взнос
 * периода; ниже участники — кто должен, кто заплатил, кто исключён. «Оплатил» открывает
 * шторку взноса, тап по участнику — персональную сумму и исключение.
 */
export default function CollectionScreen() {
  const gutter = usePageGutter();
  const params = useLocalSearchParams<{ collectionId: string; name?: string }>();
  const collectionId = params.collectionId;
  const router = useRouter();
  const tiers = useClientTiers();
  const periods = useCollectionPeriods(collectionId);
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const detail = useCollection(collectionId, periodKey);
  const [pulling, setPulling] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const searchClearance = useSearchClearance();
  const search = useDebounced(query, 200).trim().toLowerCase();
  const data = detail.data;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([detail.refetch(), periods.refetch()]);
    setPulling(false);
  };

  // Листаем по существующим периодам и текущему месяцу — иначе сервер заведёт пустой месяц с долгами.
  const current = currentPeriodKey();
  const keys = [...new Set([current, ...(periods.data ?? []).map((p) => p.key)])].filter((k) => k !== 'single' && k <= current).sort();
  const shownKey = data?.period.key ?? periodKey ?? current;
  const index = keys.indexOf(shownKey);
  const prevKey = index > 0 ? keys[index - 1] : null;
  const nextKey = index >= 0 && index < keys.length - 1 ? keys[index + 1] : null;

  const goTo = (key: string | null) => {
    if (!key) return;
    haptic.selection();
    setPeriodKey(key === current ? null : key);
  };

  if (!data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>{params.name ?? 'Сбор'}</Stack.Title>
        <View style={styles.state}>
          {detail.isError ? <Text style={[type.body, styles.secondary]}>{errorText(detail.error)}</Text> : <ActivityIndicator />}
        </View>
      </AmbientBackdrop>
    );
  }

  const { collection, period, totals, roster } = data;
  const recurring = collection.kind === 'recurring';
  const found = search ? roster.filter((r) => (r.nickname ?? '').toLowerCase().includes(search)) : roster;
  const groups: { key: string; title: string; rows: RosterRow[] }[] = [
    { key: 'due', title: 'ЖДЁМ ВЗНОС', rows: found.filter((r) => ['due', 'topUp'].includes(rosterState(r))) },
    { key: 'paid', title: 'ОПЛАТИЛИ', rows: found.filter((r) => ['paid', 'prepaid'].includes(rosterState(r))) },
    { key: 'excluded', title: 'ИСКЛЮЧЕНЫ', rows: found.filter((r) => rosterState(r) === 'excluded') },
  ].filter((g) => g.rows.length > 0);
  const progress = totals.eligibleCount > 0 ? Math.min(1, totals.paidCount / totals.eligibleCount) : 0;

  const editAmount = () =>
    promptText(
      'Взнос за период',
      `${period.label}. Меняется только этот период; у участников с персональной суммой — своя.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сохранить',
          onPress: (input?: string) => {
            const amount = parseAmount(input ?? '');
            if (amount === null) return Alert.alert('Введите сумму');
            setPeriodAmount(collection.id, period.id, amount)
              .then(() => haptic.success())
              .catch((error: unknown) => Alert.alert('Сумма не сохранена', errorText(error)));
          },
        },
      ],
      'plain-text',
      String(period.amount),
      'decimal-pad',
    );

  const archive = () =>
    Alert.alert('Архивировать сбор?', 'Сбор скроется из списка. История взносов сохранится.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Архивировать',
        style: 'destructive',
        onPress: () =>
          archiveCollection(collection.id)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Сбор не архивирован', errorText(error))),
      },
    ]);

  const unmark = (row: RosterRow) => {
    const contribution = row.contribution;
    if (!contribution) return;
    const method = CONTRIBUTION_METHODS[contribution.method];
    Alert.alert(
      `Снять взнос ${row.nickname}?`,
      contribution.method === 'deposit' || contribution.method === 'debt'
        ? `${money(contribution.amount)} вернутся на баланс клиента (${method.label.toLowerCase()}).`
        : `Отметка «${method.label} · ${money(contribution.amount)}» будет удалена.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Снять',
          style: 'destructive',
          onPress: async () => {
            setBusyRow(row.playerId);
            try {
              await removeContribution(collection.id, row);
              haptic.success();
            } catch (error) {
              haptic.error();
              Alert.alert('Отметка не снята', errorText(error));
            } finally {
              setBusyRow(null);
            }
          },
        },
      ],
    );
  };

  const pay = (row: RosterRow) => {
    haptic.light();
    router.push({ pathname: '/manage/collections/pay', params: { collectionId: collection.id, periodKey: periodKey ?? '', playerId: row.playerId } });
  };

  const openMember = (row: RosterRow) => {
    haptic.selection();
    router.push({ pathname: '/manage/collections/member', params: { collectionId: collection.id, periodKey: periodKey ?? '', playerId: row.playerId } });
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{collection.name}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="ellipsis" accessibilityLabel="Действия со сбором">
          <ToolbarMenuAction icon="pencil" onPress={() => router.push({ pathname: '/manage/collections/edit', params: { collectionId: collection.id } })}>
            Изменить сбор
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="rublesign.circle" onPress={editAmount}>
            Взнос за период
          </ToolbarMenuAction>
          <ToolbarMenuAction icon="archivebox" destructive onPress={archive}>
            Архивировать
          </ToolbarMenuAction>
        </ToolbarMenu>
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, { paddingBottom: searchClearance }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Text style={[type.subhead, styles.secondary, styles.centered]}>
          {collection.isMandatory ? 'Обязательный взнос резидентов' : 'Добровольный сбор'}
          {collection.description ? ` · ${collection.description}` : ''}
        </Text>

        {recurring && (
          <View style={styles.periodRow}>
            <PeriodButton icon="chevron.left" disabled={!prevKey} onPress={() => goTo(prevKey)} label="Предыдущий месяц" />
            <GlassView style={styles.periodLabel}>
              <Text style={[type.headline, styles.label]}>{period.label}</Text>
              {detail.isFetching && <ActivityIndicator size="small" />}
            </GlassView>
            <PeriodButton icon="chevron.right" disabled={!nextKey} onPress={() => goTo(nextKey)} label="Следующий месяц" />
          </View>
        )}

        <GlassCard style={styles.summary}>
          <Text style={[type.footnote, styles.caption]}>СОБРАНО ЗА ПЕРИОД</Text>
          <RollingText text={money(totals.collected)} style={[styles.collected, type.amount]} />
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.summaryRow}>
            <Text style={[type.subhead, styles.secondary, styles.flex]}>
              {`оплатили ${totals.paidCount} из ${totals.eligibleCount}${totals.excludedCount ? ` · исключено ${totals.excludedCount}` : ''}`}
            </Text>
            <Pressable onPress={editAmount} hitSlop={8} style={styles.amountEdit} accessibilityRole="button" accessibilityLabel="Изменить взнос за период">
              <Text style={[type.subhead, styles.accent]}>{`взнос ${money(period.amount)}`}</Text>
              <SymbolView name="pencil" size={12} weight="semibold" tintColor={colors.accent} />
            </Pressable>
          </View>
          {Object.keys(totals.byMethod).length > 0 && (
            <View style={styles.methods}>
              {(Object.entries(totals.byMethod) as [ContributionMethod, { total: number; count: number }][]).map(([method, sum]) => {
                const look = CONTRIBUTION_METHODS[method];
                return (
                  <View key={method} style={[styles.method, { backgroundColor: `${look.color}1F` }]}>
                    <SymbolView name={look.symbol} size={12} tintColor={look.color} />
                    <Text style={[type.caption1, styles.methodText, { color: look.color }]}>{`${look.label} ${money(sum.total)}`}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </GlassCard>

        {roster.length === 0 ? (
          <Text style={[type.subhead, styles.secondary, styles.centered, styles.empty]}>В клубе пока нет резидентов, студентов и новичков</Text>
        ) : groups.length === 0 && search ? (
          <View style={styles.empty}>
            <Unavailable title="Никого не нашли" systemImage="magnifyingglass" description="Измените запрос." />
          </View>
        ) : (
          <LayoutAnimationConfig skipEntering>
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`${group.title} · ${group.rows.length}`}</Text>
                <GlassCard>
                  {group.rows.map((row, rowIndex) => (
                    <Animated.View key={row.playerId} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                      {rowIndex > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                      <MemberRow
                        row={row}
                        tier={tierLook(row.clientTier, tiers.data)}
                        busy={busyRow === row.playerId}
                        onOpen={() => openMember(row)}
                        onPay={() => pay(row)}
                        onUnmark={() => unmark(row)}
                      />
                    </Animated.View>
                  ))}
                </GlassCard>
              </View>
            ))}
          </LayoutAnimationConfig>
        )}
      </ScrollView>
      <BottomSearch value={query} onChange={setQuery} placeholder="Участник" />
    </AmbientBackdrop>
  );
}

function PeriodButton({ icon, disabled, onPress, label }: { icon: 'chevron.left' | 'chevron.right'; disabled: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
      <GlassView isInteractive={!disabled} style={[styles.periodButton, disabled && styles.disabled]}>
        <SymbolView name={icon} size={16} weight="semibold" tintColor={disabled ? colors.tertiaryLabel : colors.accent} />
      </GlassView>
    </Pressable>
  );
}

function MemberRow({
  row,
  tier,
  busy,
  onOpen,
  onPay,
  onUnmark,
}: {
  row: RosterRow;
  tier: { label: string; color: string };
  busy: boolean;
  onOpen: () => void;
  onPay: () => void;
  onUnmark: () => void;
}) {
  const state = rosterState(row);
  const contribution = row.contribution;
  const caption = (() => {
    switch (state) {
      case 'excluded':
        return row.excludedForever ? 'исключён навсегда' : row.excludedUntil ? `исключён до ${untilFormat.format(new Date(row.excludedUntil))}` : 'исключён';
      case 'prepaid':
        return `оплачено авансом${row.prepaidMonths > 0 ? ` · ещё ${row.prepaidMonths} мес` : ''}`;
      case 'paid':
        return `${contribution ? `${money(contribution.amount)} · ${CONTRIBUTION_METHODS[contribution.method].label.toLowerCase()}` : 'оплачено'}${row.prepaid > 0.004 ? ` · аванс ${money(row.prepaid)}` : ''}`;
      case 'topUp':
        return row.topUp < row.expected ? `доплатить ${money(row.topUp)} из ${money(row.expected)}` : `к оплате ${money(row.topUp)}${row.topUp > row.expected ? ' с прошлыми месяцами' : ''}`;
      default:
        return `взнос ${money(row.expected)}`;
    }
  })();
  const captionStyle = state === 'paid' || state === 'prepaid' ? styles.paid : state === 'topUp' ? styles.due : styles.secondary;

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, state === 'excluded' && styles.excluded, pressed && sheetStyles.pressedRow]} accessibilityRole="button">
      <Avatar name={row.nickname} photoUrl={row.photoUrl} size={40} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={[type.body, styles.label, styles.shrink]} numberOfLines={1}>
            {row.nickname}
          </Text>
          <TierBadge label={tier.label} color={tier.color} />
          {row.amountOverride !== null && <SymbolView name="person.crop.circle.badge.checkmark" size={14} tintColor={colors.accent} />}
        </View>
        <Text style={[type.footnote, captionStyle]} numberOfLines={1}>
          {caption}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator />
      ) : contribution ? (
        // Взнос уникален на период: доплата — это «снять и отметить полную сумму».
        <Pressable onPress={onUnmark} hitSlop={6} style={({ pressed }) => [styles.action, styles.actionSoft, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={[type.subhead, styles.actionSoftText]}>Снять</Text>
        </Pressable>
      ) : state === 'prepaid' ? (
        <View style={[styles.action, styles.prepaidBadge]}>
          <Text style={[type.caption1, styles.paid]}>аванс</Text>
        </View>
      ) : state === 'excluded' ? (
        <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
      ) : (
        <Pressable onPress={onPay} hitSlop={6} style={({ pressed }) => [styles.action, styles.actionPay, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={[type.subhead, styles.actionPayText]}>Оплатил</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  accent: { color: colors.accent, fontWeight: '600' },
  centered: { textAlign: 'center' },
  empty: { paddingVertical: space.xxl },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  periodButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { flex: 1, height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  summary: { padding: space.lg, gap: space.sm },
  caption: { color: colors.secondaryLabel, fontWeight: '600', letterSpacing: 0.4 },
  collected: { fontSize: 40, lineHeight: 46, color: colors.label },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amountEdit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  methodText: { fontWeight: '600' },
  group: { gap: space.sm },
  separator: { marginLeft: 68 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 62 },
  excluded: { opacity: 0.55 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paid: { color: colors.green },
  due: { color: colors.orange },
  action: { paddingHorizontal: space.md, paddingVertical: 7, borderRadius: 999 },
  actionPay: { backgroundColor: colors.accent },
  actionPayText: { color: 'white', fontWeight: '600' },
  actionSoft: { backgroundColor: colors.fill },
  actionSoftText: { color: colors.red, fontWeight: '600' },
  prepaidBadge: { backgroundColor: 'rgba(52,199,89,0.16)', paddingVertical: 4 },
});
