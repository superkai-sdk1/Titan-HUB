import { GlassView } from 'expo-glass-effect';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { BarRow, KpiTile, money, PeriodChips, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { TierBadge } from '@/components/client-row';
import { Avatar, GlassCard, sheetStyles } from '@/components/new-check-parts';
import { useAnalyticsPeriod, useClientsAnalytics, type SegmentKey } from '@/lib/analytics-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

const SEGMENTS: { key: SegmentKey; title: string; caption: string; icon: SFSymbol; color: string }[] = [
  { key: 'new', title: 'Новые', caption: 'без визитов', icon: 'sparkles', color: '#3B82F6' },
  { key: 'active', title: 'Активные', caption: 'визит < 14 дн.', icon: 'flame.fill', color: '#10B981' },
  { key: 'sleeping', title: 'Спящие', caption: 'визит ≥ 14 дн.', icon: 'moon.zzz.fill', color: '#94A3B8' },
];

/** Игроки: база, новые за период, удержание, сегменты, статусы и топ гостей по тратам. */
export default function PlayersScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const period = useAnalyticsPeriod();
  const clients = useClientsAnalytics(period.from, period.to);
  const tiers = useClientTiers();
  const [pulling, setPulling] = useState(false);
  const data = clients.data;

  const refresh = async () => {
    setPulling(true);
    await clients.refetch();
    setPulling(false);
  };

  const tierMax = Math.max(1, ...(data?.tierDist ?? []).map((t) => t.count));
  const topMax = Math.max(1, ...(data?.topSpenders ?? []).map((t) => t.total));

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Игроки</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <PeriodChips period={period} />
        <QueryState loading={!data} error={clients.error}>
          {data && (
            <>
              <TileGrid>
                <KpiTile label="Всего игроков" icon="person.2.fill" color={colors.green} value={String(data.total)} caption={`новых за период: ${data.newThisPeriod}`} />
                <KpiTile label="Удержание" icon="arrow.triangle.2.circlepath" color={colors.blue} value={`${Math.round(data.retentionRate)}%`} caption="вернулись за 14 дней" />
              </TileGrid>

              <SectionTitle>СЕГМЕНТЫ · 90 ДНЕЙ</SectionTitle>
              <View style={styles.segments}>
                {SEGMENTS.map((s) => (
                  <Pressable
                    key={s.key}
                    style={styles.flex}
                    onPress={() => {
                      haptic.selection();
                      router.push({ pathname: '/analytics/segment', params: { segment: s.key } });
                    }}
                    accessibilityRole="button">
                    <GlassView isInteractive tintColor={`${s.color}1F`} style={styles.segment}>
                      <SymbolView name={s.icon} size={18} tintColor={s.color} />
                      <Text style={[type.title2, type.amount, styles.label]}>{data.segments[s.key]}</Text>
                      <Text style={[type.footnote, styles.label]}>{s.title}</Text>
                      <Text style={[type.caption2, styles.secondary]}>{s.caption}</Text>
                    </GlassView>
                  </Pressable>
                ))}
              </View>

              {data.tierDist.length > 0 && (
                <GlassCard style={styles.bars}>
                  <SectionTitle>СТАТУСЫ</SectionTitle>
                  {[...data.tierDist]
                    .sort((a, b) => b.count - a.count)
                    .map((t) => {
                      const look = tierLook(t.tier, tiers.data);
                      return <BarRow key={t.tier} label={look.label} value={String(t.count)} share={t.count / tierMax} color={look.color} />;
                    })}
                </GlassCard>
              )}

              <SectionTitle>ТОП ГОСТЕЙ ЗА ПЕРИОД</SectionTitle>
              <GlassCard>
                {data.topSpenders.length === 0 ? (
                  <Text style={[type.subhead, styles.secondary, styles.empty]}>За период гостей с профилем не было</Text>
                ) : (
                  data.topSpenders.map((p, index) => {
                    const look = tierLook(p.clientTier ?? 'guest', tiers.data);
                    return (
                      <View key={p.playerId}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                        <Pressable
                          onPress={() => {
                            haptic.selection();
                            router.push({ pathname: '/analytics/player/[playerId]', params: { playerId: p.playerId, ...(p.photoUrl ? { photo: p.photoUrl } : {}) } });
                          }}
                          style={({ pressed }) => [styles.player, pressed && sheetStyles.pressedRow]}
                          accessibilityRole="button">
                          <Text style={[type.footnote, styles.rank]}>{index + 1}</Text>
                          <Avatar name={p.nickname ?? '··'} photoUrl={p.photoUrl} size={38} />
                          <View style={styles.flex}>
                            <View style={styles.nameRow}>
                              <Text style={[type.body, styles.label, styles.shrink]} numberOfLines={1}>
                                {p.nickname ?? 'Игрок'}
                              </Text>
                              {p.clientTier && <TierBadge label={look.label} color={look.color} />}
                            </View>
                            <View style={styles.track}>
                              <View style={[styles.fill, { width: `${Math.max(2, (p.total / topMax) * 100)}%` }]} />
                            </View>
                            <Text style={[type.caption1, styles.secondary]}>{`${p.visits} ${plural(p.visits, ['чек', 'чека', 'чеков'])}${p.refundsTotal > 0 ? ` · возвраты ${money(p.refundsTotal)}` : ''}`}</Text>
                          </View>
                          <Text style={[type.body, type.amount, styles.label]}>{money(p.total)}</Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </GlassCard>

              <GlassCard style={styles.guests}>
                <SymbolView name="person.crop.circle.badge.questionmark" size={22} tintColor={colors.secondaryLabel} />
                <View style={styles.flex}>
                  <Text style={[type.body, styles.label]}>Гости без профиля</Text>
                  <Text style={[type.footnote, styles.secondary]}>{`${data.guestSales.visits} ${plural(data.guestSales.visits, ['чек', 'чека', 'чеков'])}`}</Text>
                </View>
                <Text style={[type.body, type.amount, styles.label]}>{money(data.guestSales.total)}</Text>
              </GlassCard>
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
  shrink: { flexShrink: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  segments: { flexDirection: 'row', gap: space.sm },
  segment: { alignItems: 'flex-start', gap: 2, padding: space.md, borderRadius: 20, borderCurve: 'continuous' },
  bars: { paddingVertical: space.lg, gap: 2 },
  separator: { marginLeft: 82 },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rank: { width: 16, textAlign: 'center', color: colors.tertiaryLabel, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden', marginVertical: 5 },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.green },
  guests: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
});
