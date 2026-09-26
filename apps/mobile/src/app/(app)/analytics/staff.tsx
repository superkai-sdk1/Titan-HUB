import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppRefreshControl } from '@/components/refresh-control';
import { KpiTile, money, PeriodChips, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Avatar, GlassCard, sheetStyles } from '@/components/new-check-parts';
import { Unavailable } from '@/components/unavailable';
import { useAnalyticsPeriod, useStaffComp } from '@/lib/analytics-api';
import { plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const when = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Списания на персонал (только владелец): по цене меню и по себестоимости, по сотрудникам и списком. */
export default function StaffAnalyticsScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const period = useAnalyticsPeriod();
  const staff = useStaffComp(period.from, period.to, isOwner);
  const [pulling, setPulling] = useState(false);
  const data = staff.data;

  if (!isOwner) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Unavailable title="Только для владельца" systemImage="lock" description="Отчёт по персоналу видит только владелец клуба." />
      </AmbientBackdrop>
    );
  }

  const refresh = async () => {
    setPulling(true);
    await staff.refetch();
    setPulling(false);
  };

  // Сервер склеивает количество строками («032») — считаем сами.
  const checks = (data?.staff ?? []).reduce((sum, s) => sum + toNumber(s.checksCount), 0);
  const costMax = Math.max(1, ...(data?.staff ?? []).map((s) => s.cost));

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Персонал</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <PeriodChips period={period} />
        <QueryState loading={!data} error={staff.error}>
          {data && (
            <>
              <TileGrid>
                <KpiTile label="По цене меню" icon="tag" value={money(data.totals.retail)} caption={`${checks} ${plural(checks, ['списание', 'списания', 'списаний'])}`} />
                <KpiTile label="Себестоимость" icon="shippingbox" color={colors.orange} value={money(data.totals.cost)} caption="реальные затраты клуба" />
              </TileGrid>

              {data.staff.length === 0 ? (
                <Text style={[type.subhead, styles.secondary, styles.empty]}>За период списаний на персонал не было</Text>
              ) : (
                <>
                  <SectionTitle>ПО СОТРУДНИКАМ</SectionTitle>
                  <GlassCard>
                    {data.staff.map((s, index) => (
                      <View key={s.staffId}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                        <View style={styles.row}>
                          <Avatar name={s.nickname} photoUrl={s.photoUrl} size={38} />
                          <View style={styles.flex}>
                            <Text style={[type.body, styles.label]} numberOfLines={1}>
                              {s.nickname}
                            </Text>
                            <View style={styles.track}>
                              <View style={[styles.fill, { width: `${Math.max(2, (s.cost / costMax) * 100)}%` }]} />
                            </View>
                            <Text style={[type.caption1, styles.secondary]}>{`${toNumber(s.checksCount)} ${plural(toNumber(s.checksCount), ['чек', 'чека', 'чеков'])} · по меню ${money(s.retail)}`}</Text>
                          </View>
                          <Text style={[type.body, type.amount, styles.label]}>{money(s.cost)}</Text>
                        </View>
                      </View>
                    ))}
                  </GlassCard>

                  <SectionTitle>СПИСАНИЯ</SectionTitle>
                  <GlassCard>
                    {data.transactions.map((t, index) => (
                      <View key={t.id}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                        <Pressable
                          onPress={() => {
                            haptic.selection();
                            router.push({ pathname: '/analytics/check/[checkId]', params: { checkId: t.id } });
                          }}
                          style={({ pressed }) => [styles.row, pressed && sheetStyles.pressedRow]}
                          accessibilityRole="button">
                          <View style={styles.flex}>
                            <Text style={[type.body, styles.label]}>{t.nickname}</Text>
                            <Text style={[type.footnote, styles.secondary]}>{`${when.format(new Date(t.createdAt))} · по меню ${money(t.retail)}`}</Text>
                          </View>
                          <Text style={[type.body, type.amount, styles.label]}>{money(t.cost)}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </GlassCard>
                </>
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
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  separator: { marginLeft: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden', marginVertical: 5 },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.orange },
});
