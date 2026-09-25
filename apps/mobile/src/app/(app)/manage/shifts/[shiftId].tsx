import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { funnyGuestName } from '@/lib/checks';
import { formatMoney, formatTime, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { METHODS } from '@/lib/payment';
import { TIER_LABEL } from '@/lib/pos-api';
import { useShiftReport } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';

type Tab = 'overview' | 'checks' | 'items' | 'players';

const ABC_COLOR: Record<'A' | 'B' | 'C', string> = { A: '#10B981', B: '#F59E0B', C: '#94A3B8' };

function methodLook(method: PaymentMethod | null): { title: string; symbol: SFSymbol; color: string } {
  if (method && method !== 'split') return METHODS[method];
  return { title: method === 'split' ? 'Раздельная' : 'Без оплаты', symbol: 'square.split.2x1', color: '#94A3B8' };
}

/** Отчёт смены, как в веб-кассе: итоги, закрытые чеки, товары с ABC-анализом и игроки. */
export default function ShiftReportScreen() {
  const gutter = usePageGutter();
  const { shiftId } = useLocalSearchParams<{ shiftId: string }>();
  const router = useRouter();
  const report = useShiftReport(shiftId);
  const [tab, setTab] = useState<Tab>('overview');
  const data = report.data;

  const paymentsTotal = (data?.payments ?? []).reduce((sum, p) => sum + toNumber(p.total), 0);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Отчёт смены</Stack.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, gutter]}>
        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('overview')]}>Итоги</SwiftText>
            <SwiftText modifiers={[tag('checks')]}>Чеки</SwiftText>
            <SwiftText modifiers={[tag('items')]}>Товары</SwiftText>
            <SwiftText modifiers={[tag('players')]}>Игроки</SwiftText>
          </Picker>
        </Host>

        {!data ? (
          report.isError ? (
            <Text style={[type.body, styles.secondary, styles.centered]}>{report.error.message}</Text>
          ) : (
            <ActivityIndicator style={styles.loading} />
          )
        ) : (
          <LayoutAnimationConfig skipEntering>
            <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.tab}>
              {tab === 'overview' && (
                <>
                  <View style={styles.kpis}>
                    <Kpi label="Выручка" value={formatMoney(data.overview.totalRevenue)} icon="rublesign.circle" color="#8B5CF6" />
                    <Kpi label="Чеков" value={String(data.overview.checksCount)} icon="receipt" color="#3B82F6" />
                  </View>
                  <View style={styles.kpis}>
                    <Kpi label="Средний чек" value={formatMoney(data.overview.avgCheck)} icon="chart.bar" color="#10B981" />
                    <Kpi label="Гостей" value={String(data.overview.uniquePlayers)} icon="person.2" color="#F59E0B" />
                  </View>
                  {data.overview.refundsTotal > 0 && (
                    <GlassCard tint="rgba(255,59,48,0.14)" style={styles.refunds}>
                      <SymbolView name="arrow.uturn.backward.circle" size={20} tintColor={colors.red} />
                      <Text style={[type.body, styles.label, styles.flex]}>Возвраты</Text>
                      <Text style={[type.body, type.amount, styles.red]}>{formatMoney(-data.overview.refundsTotal)}</Text>
                    </GlassCard>
                  )}
                  {data.payments.length > 0 && (
                    <View style={styles.section}>
                      <Text style={[type.footnote, sheetStyles.sectionTitle]}>СПОСОБЫ ОПЛАТЫ</Text>
                      <GlassCard style={styles.card}>
                        {[...data.payments]
                          .sort((a, b) => toNumber(b.total) - toNumber(a.total))
                          .map((p) => {
                            const look = methodLook(p.method);
                            const share = paymentsTotal > 0 ? toNumber(p.total) / paymentsTotal : 0;
                            return (
                              <View key={p.method} style={styles.payment}>
                                <View style={styles.paymentTop}>
                                  <SymbolView name={look.symbol} size={16} weight="semibold" tintColor={look.color} />
                                  <Text style={[type.body, styles.label, styles.flex]}>{look.title}</Text>
                                  <Text style={[type.body, type.amount, styles.label]}>{formatMoney(p.total)}</Text>
                                </View>
                                <View style={styles.track}>
                                  <View style={[styles.fill, { width: `${Math.max(2, share * 100)}%`, backgroundColor: look.color }]} />
                                </View>
                              </View>
                            );
                          })}
                      </GlassCard>
                    </View>
                  )}
                </>
              )}

              {tab === 'checks' &&
                (data.checks.length === 0 ? (
                  <Empty text="Закрытых чеков нет" />
                ) : (
                  <GlassCard>
                    {[...data.checks]
                      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
                      .map((check, index) => {
                        const look = methodLook(check.paymentMethod);
                        return (
                          <View key={check.id}>
                            {index > 0 && <View style={[sheetStyles.separator, styles.rowSeparator]} />}
                            <Pressable
                              onPress={() => {
                                haptic.selection();
                                router.push({ pathname: '/pos/[checkId]', params: { checkId: check.id } });
                              }}
                              style={({ pressed }) => [styles.row, pressed && sheetStyles.pressedRow]}
                              accessibilityRole="button">
                              <View style={[styles.rowIcon, { backgroundColor: `${look.color}26` }]}>
                                <SymbolView name={look.symbol} size={15} weight="semibold" tintColor={look.color} />
                              </View>
                              <View style={styles.flex}>
                                <Text style={[type.body, styles.label]} numberOfLines={1}>
                                  {check.guestNames?.[0] ?? funnyGuestName(check.id)}
                                </Text>
                                <Text style={[type.footnote, styles.secondary]}>
                                  {`${formatTime(check.createdAt)}–${check.closedAt ? formatTime(check.closedAt) : '…'} · ${look.title}`}
                                </Text>
                              </View>
                              <Text style={[type.body, type.amount, styles.label]}>{formatMoney(check.totalAmount)}</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                  </GlassCard>
                ))}

              {tab === 'items' &&
                (data.topItems.length === 0 ? (
                  <Empty text="Продаж нет" />
                ) : (
                  <GlassCard>
                    {data.topItems.map((item, index) => (
                      <View key={item.itemId}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.rowSeparator]} />}
                        <View style={styles.row}>
                          <View style={[styles.abc, { backgroundColor: `${ABC_COLOR[item.abc]}29` }]}>
                            <Text style={[type.subhead, styles.abcText, { color: ABC_COLOR[item.abc] }]}>{item.abc}</Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={[type.body, styles.label]} numberOfLines={1}>
                              {item.name ?? 'Позиция'}
                            </Text>
                            <Text style={[type.footnote, styles.secondary]}>
                              {`${toNumber(item.totalQty)} шт · ${Math.round(item.share * 10) / 10}%`}
                            </Text>
                          </View>
                          <Text style={[type.body, type.amount, styles.label]}>{formatMoney(item.totalRev)}</Text>
                        </View>
                      </View>
                    ))}
                  </GlassCard>
                ))}

              {tab === 'players' &&
                (data.playerStats.length === 0 ? (
                  <Empty text="Игроков нет" />
                ) : (
                  <GlassCard>
                    {data.playerStats.map((player, index) => (
                      <View key={player.playerId ?? `guest-${index}`}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.rowSeparator]} />}
                        <View style={styles.row}>
                          <View style={[styles.rowIcon, { backgroundColor: colors.fill }]}>
                            <Text style={[type.subhead, styles.rank]}>{index + 1}</Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={[type.body, styles.label]} numberOfLines={1}>
                              {player.nickname ?? 'Гости без профиля'}
                            </Text>
                            <Text style={[type.footnote, styles.secondary]}>
                              {[player.clientTier ? (TIER_LABEL[player.clientTier] ?? player.clientTier) : null, `${player.cnt} ${plural(player.cnt, ['чек', 'чека', 'чеков'])}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                          <Text style={[type.body, type.amount, styles.label]}>{formatMoney(player.total)}</Text>
                        </View>
                      </View>
                    ))}
                  </GlassCard>
                ))}
            </Animated.View>
          </LayoutAnimationConfig>
        )}
      </ScrollView>
    </AmbientBackdrop>
  );
}

function Kpi({ label, value, icon, color }: { label: string; value: string; icon: SFSymbol; color: string }) {
  return (
    <GlassCard style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}26` }]}>
        <SymbolView name={icon} size={16} weight="semibold" tintColor={color} />
      </View>
      <Text style={[type.footnote, styles.secondary]}>{label}</Text>
      <Text style={[type.title2, type.amount, styles.label]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </GlassCard>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={[type.subhead, styles.secondary, styles.centered, styles.empty]}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.lg },
  segment: { alignSelf: 'stretch' },
  loading: { paddingTop: 80 },
  tab: { gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  red: { color: colors.red },
  centered: { textAlign: 'center' },
  empty: { paddingVertical: space.xxl },
  kpis: { flexDirection: 'row', gap: space.md },
  kpi: { flex: 1, padding: space.lg, gap: 4 },
  kpiIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  refunds: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  section: { gap: space.sm },
  card: { padding: space.lg, gap: space.md },
  payment: { gap: 6 },
  paymentTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
  rowSeparator: { marginLeft: 60 },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  abc: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  abcText: { fontWeight: '800' },
  rank: { color: colors.secondaryLabel, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
