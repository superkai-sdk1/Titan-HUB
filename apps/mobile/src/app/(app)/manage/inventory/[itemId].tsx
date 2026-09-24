import { Chart, Host } from '@expo/ui/swift-ui';
import { GlassView } from 'expo-glass-effect';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { MOVEMENT_LOOK, STOCK_LOOK, stockLevel, thresholdOf, useInventory, useItemMovements, useItemStats } from '@/lib/inventory-api';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const movementDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/**
 * Товар склада: остаток крупно со статусом, себестоимость, цена и маржа, продажи за 30 дней
 * графиком, последняя закупка. Действия — списание, корректировка, точка заказа; ниже журнал.
 */
export default function InventoryItemScreen() {
  const gutter = usePageGutter();
  const { itemId, name } = useLocalSearchParams<{ itemId: string; name?: string }>();
  const router = useRouter();
  const accent = useAccentHex();
  const inventory = useInventory();
  const stats = useItemStats(itemId);
  const movements = useItemMovements(itemId);
  const [pulling, setPulling] = useState(false);

  const item = inventory.data?.find((i) => i.id === itemId);
  const data = stats.data;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([inventory.refetch(), stats.refetch(), movements.refetch()]);
    setPulling(false);
  };

  const open = (mode: 'writeoff' | 'adjust' | 'params') => {
    haptic.light();
    router.push({ pathname: '/manage/inventory/stock-action', params: { itemId, mode } });
  };

  if (!item || !data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>{name ?? 'Товар'}</Stack.Title>
        <View style={styles.state}>{stats.isError ? <Text style={[type.body, styles.secondary]}>{stats.error.message}</Text> : <ActivityIndicator />}</View>
      </AmbientBackdrop>
    );
  }

  const level = stockLevel(item);
  const look = STOCK_LOOK[level];
  const cost = toNumber(item.costPrice);
  const price = toNumber(item.price);
  const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : null;
  const daysLeft = item.trackStock && data.sales.avgDaily > 0 && item.stockQuantity > 0 ? Math.floor(item.stockQuantity / data.sales.avgDaily) : null;
  const negative = item.trackStock && item.stockQuantity < 0;
  const threshold = thresholdOf(item);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{item.name}</Stack.Title>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <View style={styles.hero}>
          <Text style={[type.title2, styles.label, styles.centered]} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: `${look.color}24` }]}>
            <Text style={[type.caption1, styles.badgeText, { color: look.color }]}>{item.trackStock ? look.label : 'Остатки не учитываются'}</Text>
          </View>
          {item.trackStock && (
            <>
              <View style={styles.qtyRow}>
                <RollingText text={String(item.stockQuantity)} style={[styles.qty, type.amount, { color: level === 'out' || level === 'low' ? look.color : colors.label }]} />
                <Text style={[type.title3, styles.secondary]}>шт</Text>
              </View>
              <Text style={[type.subhead, styles.secondary]}>
                {`на ${money(Math.max(0, item.stockQuantity) * cost)} по себестоимости${threshold > 0 ? ` · точка заказа ${threshold}` : ''}`}
              </Text>
            </>
          )}
        </View>

        {negative && (
          <GlassCard tint="rgba(244,63,94,0.14)" style={styles.warning}>
            <SymbolView name="exclamationmark.triangle.fill" size={20} tintColor={colors.red} />
            <Text style={[type.subhead, styles.label, styles.flex]}>
              Остаток ушёл в минус из-за продаж. Сведите его ревизией или установите точный остаток — списание при минусе исказит журнал.
            </Text>
          </GlassCard>
        )}

        <View style={styles.tiles}>
          <Tile label="Себестоимость" value={money(cost)} />
          <Tile label="Цена" value={money(price)} />
          <Tile label="Маржа" value={margin === null ? '—' : `${margin}%`} caption={margin === null ? undefined : money(price - cost)} tone={margin !== null && margin < 0 ? colors.red : undefined} />
        </View>

        {item.trackStock && (
          <View style={styles.actions}>
            <Action icon="trash" label="Списать" color="#F43F5E" disabled={negative} onPress={() => open('writeoff')} />
            <Action icon="slider.horizontal.3" label={negative ? 'Точный остаток' : 'Корректировка'} color="#8B5CF6" onPress={() => open('adjust')} />
            <Action icon="bell.badge" label="Точка заказа" color="#F59E0B" onPress={() => open('params')} />
          </View>
        )}

        <View style={styles.group}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>ПРОДАЖИ · 30 ДНЕЙ</Text>
          <GlassCard style={styles.card}>
            <View style={styles.salesTop}>
              <View style={styles.flex}>
                <Text style={[type.title2, type.amount, styles.label]}>{`${data.sales.totalQty} шт`}</Text>
                <Text style={[type.footnote, styles.secondary]}>{`выручка ${money(data.sales.totalRevenue)} · всего продано ${data.sales.allTimeQty} шт`}</Text>
              </View>
              <View style={styles.daily}>
                <Text style={[type.headline, type.amount, styles.label]}>{`${data.sales.avgDaily.toFixed(1).replace('.', ',')} шт`}</Text>
                <Text style={[type.caption1, styles.secondary]}>{daysLeft !== null ? `в день · хватит на ~${daysLeft} ${plural(daysLeft, ['день', 'дня', 'дней'])}` : 'в день'}</Text>
              </View>
            </View>
            <Host style={styles.chart}>
              <Chart
                type="bar"
                animate
                showGrid={false}
                // Числовая ось «дней назад» — подписи не слипаются, как у 30 категорий-дат.
                data={data.sales.series.map((point, index) => ({ x: index - (data.sales.series.length - 1), y: point.qty, color: accent }))}
                barStyle={{ cornerRadius: 3 }}
              />
            </Host>
            <Text style={[type.caption2, styles.secondary, styles.centered]}>дней назад · 0 — сегодня</Text>
          </GlassCard>
        </View>

        <GlassCard style={styles.lastSupply}>
          <SymbolView name="shippingbox" size={18} tintColor={colors.secondaryLabel} />
          <View style={styles.flex}>
            <Text style={[type.caption1, styles.secondary]}>Последняя закупка</Text>
            <Text style={[type.body, styles.label]}>
              {data.lastSupply
                ? `${longDate.format(new Date(data.lastSupply.date))} · ${data.lastSupply.quantity} шт по ${money(data.lastSupply.costPerUnit)}`
                : 'Закупок не было'}
            </Text>
          </View>
        </GlassCard>

        <View style={styles.group}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>ДВИЖЕНИЯ СКЛАДА</Text>
          <GlassCard>
            {movements.isLoading ? (
              <ActivityIndicator style={styles.listState} />
            ) : !movements.data?.length ? (
              <Text style={[type.subhead, styles.secondary, styles.centered, styles.listState]}>Движений пока нет</Text>
            ) : (
              movements.data.map((m, index) => {
                const mLook = MOVEMENT_LOOK[m.type];
                return (
                  <View key={m.id}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                    <View style={styles.movement}>
                      <View style={[styles.movementIcon, { backgroundColor: `${mLook.color}24` }]}>
                        <SymbolView name={mLook.symbol} size={14} tintColor={mLook.color} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[type.subhead, styles.label]} numberOfLines={2}>
                          {m.reason && !m.reason.startsWith(mLook.label) ? `${mLook.label} · ${m.reason}` : (m.reason ?? mLook.label)}
                        </Text>
                        <Text style={[type.caption1, styles.secondary]}>{[movementDate.format(new Date(m.createdAt)), m.author].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <View style={styles.delta}>
                        <Text style={[type.subhead, type.amount, { color: m.delta > 0 ? colors.green : colors.red }]}>{m.delta > 0 ? `+${m.delta}` : `−${Math.abs(m.delta)}`}</Text>
                        <Text style={[type.caption1, styles.secondary]}>{`→ ${m.qtyAfter}`}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </GlassCard>
        </View>
      </ScrollView>
    </AmbientBackdrop>
  );
}

function Tile({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: ColorValue }) {
  return (
    <GlassView style={styles.tile}>
      <Text style={[type.caption1, styles.secondary]}>{label}</Text>
      <Text style={[type.headline, type.amount, { color: tone ?? colors.label }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {caption && <Text style={[type.caption2, styles.secondary]}>{caption}</Text>}
    </GlassView>
  );
}

function Action({ icon, label, color, disabled, onPress }: { icon: SFSymbol; label: string; color: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.flex} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}>
      <GlassView isInteractive={!disabled} style={[styles.action, disabled && styles.disabled]}>
        <View style={[styles.actionIcon, { backgroundColor: disabled ? colors.fill : color }]}>
          <SymbolView name={icon} size={16} tintColor={disabled ? colors.tertiaryLabel : 'white'} />
        </View>
        <Text style={[type.caption1, styles.actionText]} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.lg },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  disabled: { opacity: 0.5 },
  hero: { alignItems: 'center', gap: 6, paddingTop: space.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontWeight: '700' },
  qtyRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  qty: { fontSize: 56, lineHeight: 62 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, padding: space.md, gap: 2, borderRadius: 18, borderCurve: 'continuous' },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { alignItems: 'center', gap: 6, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: 18, borderCurve: 'continuous' },
  actionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.label, fontWeight: '600' },
  group: { gap: space.sm },
  card: { padding: space.lg, gap: space.md },
  salesTop: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  daily: { alignItems: 'flex-end' },
  chart: { height: 140, alignSelf: 'stretch' },
  lastSupply: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  listState: { paddingVertical: space.xl },
  separator: { marginLeft: 58 },
  movement: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  movementIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  delta: { alignItems: 'flex-end' },
});
