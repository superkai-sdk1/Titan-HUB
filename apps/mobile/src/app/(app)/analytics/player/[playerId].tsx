import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppRefreshControl } from '@/components/refresh-control';
import { KpiTile, money, QueryState, SectionTitle, TileGrid } from '@/components/analytics/parts';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { TierBadge } from '@/components/client-row';
import { Avatar, GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { usePlayerCard } from '@/lib/analytics-api';
import { balanceText, tierLook, useClientTiers } from '@/lib/clients-api';
import { plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseStockDate } from '@/lib/inventory-api';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const checkDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Игрок в цифрах: траты за всё время и за 30 дней, визиты, частота, последние чеки. */
export default function PlayerAnalyticsScreen() {
  const gutter = usePageGutter();
  const [pulling, setPulling] = useState(false);
  // Фото в отчёте игрока сервер не отдаёт — приносим его из списка, откуда пришли.
  const { playerId, photo } = useLocalSearchParams<{ playerId: string; photo?: string }>();
  const router = useRouter();
  const card = usePlayerCard(playerId);
  const tiers = useClientTiers();
  const data = card.data;

  const first = data?.allTime.firstVisit ? parseStockDate(data.allTime.firstVisit) : null;
  const last = data?.allTime.lastVisit ? parseStockDate(data.allTime.lastVisit) : null;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([card.refetch()]);
    setPulling(false);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{data?.profile.nickname ?? 'Игрок'}</Stack.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <QueryState loading={!data} error={card.error}>
          {data && (
            <>
              <View style={styles.hero}>
                <Avatar name={data.profile.nickname} photoUrl={photo} size={80} />
                <Text style={[type.title2, styles.label]}>{data.profile.nickname}</Text>
                {data.profile.fullName && <Text style={[type.subhead, styles.secondary]}>{data.profile.fullName}</Text>}
                <View style={styles.badges}>
                  <TierBadge {...tierLook(data.profile.clientTier, tiers.data)} />
                  {balanceText(data.profile.balance) && <TierBadge label={balanceText(data.profile.balance)!} color={toNumber(data.profile.balance) > 0 ? '#06B6D4' : '#F43F5E'} />}
                  {Math.floor(toNumber(data.profile.bonusPoints)) > 0 && <TierBadge label={`★ ${Math.floor(toNumber(data.profile.bonusPoints))}`} color="#F59E0B" />}
                </View>
              </View>

              <TileGrid>
                <KpiTile label="Потрачено всего" icon="rublesign.circle" value={money(data.allTime.spend)} caption={data.allTime.refundsTotal > 0 ? `возвраты ${money(data.allTime.refundsTotal)}` : undefined} />
                <KpiTile label="Средний чек" icon="receipt" color={colors.blue} value={money(Math.round(data.allTime.avgCheck))} caption={`${data.allTime.checksCount} ${plural(data.allTime.checksCount, ['чек', 'чека', 'чеков'])}`} />
                <KpiTile label="Дней с визитами" icon="calendar" color={colors.green} value={String(data.allTime.visitDays)} caption={`≈ ${data.allTime.visitsPerMonth.toString().replace('.', ',')} в месяц`} />
                <KpiTile label="За 30 дней" icon="clock" color={colors.orange} value={money(data.last30.spend)} caption={`${data.last30.checksCount} ${plural(data.last30.checksCount, ['чек', 'чека', 'чеков'])}`} />
              </TileGrid>

              <GlassCard style={styles.dates}>
                <Line label="Первый визит" value={first ? dateFormat.format(first) : '—'} />
                <Line
                  label="Последний визит"
                  value={last ? `${dateFormat.format(last)}${data.allTime.daysSinceLast !== null ? ` · ${data.allTime.daysSinceLast} ${plural(data.allTime.daysSinceLast, ['день', 'дня', 'дней'])} назад` : ''}` : '—'}
                />
                {data.profile.phone && <Line label="Телефон" value={data.profile.phone} />}
              </GlassCard>

              {data.recentChecks.length > 0 && (
                <>
                  <SectionTitle>ПОСЛЕДНИЕ ЧЕКИ</SectionTitle>
                  <GlassCard>
                    {data.recentChecks.map((check, index) => (
                      <View key={check.id}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                        <Pressable
                          onPress={() => {
                            haptic.selection();
                            router.push({ pathname: '/analytics/check/[checkId]', params: { checkId: check.id } });
                          }}
                          style={({ pressed }) => [styles.checkRow, pressed && sheetStyles.pressedRow]}
                          accessibilityRole="button">
                          <Text style={[type.body, styles.label, styles.flex]}>{checkDate.format(new Date(check.createdAt))}</Text>
                          <Text style={[type.body, type.amount, styles.label]}>{money(toNumber(check.totalAmount))}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </GlassCard>
                </>
              )}

              <PrimaryButton
                title="Карточка клиента"
                icon="person.crop.circle"
                onPress={() => router.push({ pathname: '/manage/clients/[clientId]', params: { clientId: data.profile.id } })}
              />
            </>
          )}
        </QueryState>
      </ScrollView>
    </AmbientBackdrop>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={[type.subhead, styles.secondary]}>{label}</Text>
      <Text style={[type.subhead, styles.label, styles.value]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  hero: { alignItems: 'center', gap: 4, paddingTop: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 4 },
  dates: { padding: space.lg, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  value: { flex: 1, textAlign: 'right' },
  separator: { marginLeft: space.lg },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 48 },
});
