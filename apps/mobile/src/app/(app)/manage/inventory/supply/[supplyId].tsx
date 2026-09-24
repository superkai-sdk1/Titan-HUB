import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteSupply, useSupply } from '@/lib/inventory-api';
import { usePageGutter } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const correctionDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Проведённая закупка: позиции, история корректировок, итог; корректировка и удаление — в меню. */
export default function SupplyScreen() {
  const gutter = usePageGutter();
  const { supplyId } = useLocalSearchParams<{ supplyId: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const supply = useSupply(supplyId);
  const data = supply.data;

  if (!data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>Закупка</Stack.Title>
        <View style={styles.state}>{supply.isError ? <Text style={[type.body, styles.secondary]}>{supply.error.message}</Text> : <ActivityIndicator />}</View>
      </AmbientBackdrop>
    );
  }

  const date = new Date(data.supply.createdAt);
  const total = toNumber(data.supply.totalCost);

  const remove = () =>
    Alert.alert('Удалить закупку?', `Закупка от ${longDate.format(date)} будет удалена, принятый остаток снимется со склада. Себестоимость не пересчитается.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteSupply(data.supply.id)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Закупка не удалена', error instanceof Error ? error.message : String(error))),
      },
    ]);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{longDate.format(date)}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="ellipsis" accessibilityLabel="Действия с закупкой">
          <ToolbarMenuAction icon="pencil" onPress={() => router.push({ pathname: '/manage/inventory/supply-editor', params: { supplyId: data.supply.id } })}>
            Корректировка
          </ToolbarMenuAction>
          {isOwner && (
            <ToolbarMenuAction icon="trash" destructive onPress={remove}>
              Удалить закупку
            </ToolbarMenuAction>
          )}
        </ToolbarMenu>
      </Stack.Toolbar>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, gutter]}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <SymbolView name="shippingbox.fill" size={26} tintColor="#10B981" />
          </View>
          <Text style={[styles.total, type.amount]}>{money(total)}</Text>
          <Text style={[type.subhead, styles.secondary]}>
            {`${longDate.format(date)} · ${time.format(date)} · ${data.items.length} ${plural(data.items.length, ['позиция', 'позиции', 'позиций'])}`}
          </Text>
          {data.supply.supplier && <Text style={[type.subhead, styles.secondary]}>{`Поставщик: ${data.supply.supplier}`}</Text>}
        </View>

        <View style={styles.group}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>ПОЗИЦИИ</Text>
          <GlassCard>
            {data.items.map((line, index) => (
              <View key={`${line.itemId ?? line.name}-${index}`}>
                {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                <View style={styles.row}>
                  <SymbolView name={line.itemId ? 'shippingbox' : 'doc.text'} size={17} tintColor={line.itemId ? colors.accent : colors.secondaryLabel} />
                  <View style={styles.flex}>
                    <Text style={[type.body, styles.label]} numberOfLines={2}>
                      {line.name}
                    </Text>
                    <Text style={[type.footnote, styles.secondary]}>{`${line.quantity} ${line.unit} × ${money(line.costPerUnit)}${line.itemId ? '' : ' · без склада'}`}</Text>
                  </View>
                  <Text style={[type.body, type.amount, styles.label]}>{money(line.quantity * line.costPerUnit)}</Text>
                </View>
              </View>
            ))}
          </GlassCard>
        </View>

        {data.corrections.length > 0 && (
          <View style={styles.group}>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>КОРРЕКТИРОВКИ</Text>
            <GlassCard>
              {data.corrections.map((c, index) => {
                const diff = c.totalAfter - c.totalBefore;
                return (
                  <View key={c.id}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                    <View style={styles.row}>
                      <SymbolView name="pencil.circle" size={18} tintColor={colors.orange} />
                      <View style={styles.flex}>
                        <Text style={[type.body, styles.label]}>{c.reason}</Text>
                        <Text style={[type.footnote, styles.secondary]}>{`${correctionDate.format(new Date(c.createdAt))} · было ${money(c.totalBefore)}`}</Text>
                      </View>
                      <Text style={[type.body, type.amount, { color: Math.abs(diff) < 0.005 ? colors.secondaryLabel : diff > 0 ? colors.red : colors.green }]}>
                        {Math.abs(diff) < 0.005 ? '0 ₽' : formatMoney(diff, { sign: true, kopecks: 'auto' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </GlassCard>
          </View>
        )}
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.lg },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  hero: { alignItems: 'center', gap: 4, paddingTop: space.sm },
  heroIcon: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,185,129,0.16)', marginBottom: 4 },
  total: { fontSize: 40, lineHeight: 46, color: colors.label },
  group: { gap: space.sm },
  separator: { marginLeft: 50 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
