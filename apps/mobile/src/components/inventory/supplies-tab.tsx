import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteSupply, useSupplies, type SupplyListItem } from '@/lib/inventory-api';
import { colors, space, type } from '@/lib/theme';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Закупки: черновики сверху (продолжить или удалить), ниже проведённые — дата, позиции, сумма. */
export function SuppliesTab() {
  const router = useRouter();
  const supplies = useSupplies();
  const list = supplies.data ?? [];

  const removeDraft = (supply: SupplyListItem) =>
    Alert.alert('Удалить черновик закупки?', `${supply.items.length} ${plural(supply.items.length, ['позиция', 'позиции', 'позиций'])} — склад не изменится.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteSupply(supply.id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Черновик не удалён', error instanceof Error ? error.message : String(error))),
      },
    ]);

  return (
    <View style={styles.tab}>
      <PrimaryButton title="Новая закупка" icon="shippingbox" onPress={() => router.push('/manage/inventory/supply-editor')} />
      {supplies.isLoading ? (
        <ActivityIndicator style={styles.state} />
      ) : list.length === 0 ? (
        <Text style={[type.subhead, styles.secondary, styles.empty]}>Закупок пока не было</Text>
      ) : (
        <View style={styles.group}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`ПОСЛЕДНИЕ ЗАКУПКИ · ${list.length}`}</Text>
          <GlassCard>
            {list.map((supply, index) => {
              const draft = supply.status === 'draft';
              const date = new Date(supply.createdAt);
              const total = draft ? supply.items.reduce((sum, l) => sum + l.quantity * l.costPerUnit, 0) : toNumber(supply.totalCost);
              return (
                <View key={supply.id}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                  <Pressable
                    onPress={() => {
                      haptic.selection();
                      if (draft) router.push({ pathname: '/manage/inventory/supply-editor', params: { draftId: supply.id } });
                      else router.push({ pathname: '/manage/inventory/supply/[supplyId]', params: { supplyId: supply.id } });
                    }}
                    style={({ pressed }) => [styles.row, pressed && sheetStyles.pressedRow]}
                    accessibilityRole="button">
                    <View style={[styles.icon, { backgroundColor: draft ? 'rgba(139,92,246,0.16)' : 'rgba(16,185,129,0.16)' }]}>
                      <SymbolView name={draft ? 'pencil' : 'shippingbox.fill'} size={17} tintColor={draft ? '#8B5CF6' : '#10B981'} />
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.titleRow}>
                        <Text style={[type.body, styles.label]}>{dateFormat.format(date)}</Text>
                        {draft && (
                          <View style={styles.draftBadge}>
                            <Text style={[type.caption2, styles.draftText]}>ЧЕРНОВИК</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
                        {`${timeFormat.format(date)} · ${supply.items.length} ${plural(supply.items.length, ['позиция', 'позиции', 'позиций'])}${draft ? ' · продолжить' : ''}${supply.supplier ? ` · ${supply.supplier}` : ''}`}
                      </Text>
                    </View>
                    {draft ? (
                      <Pressable onPress={() => removeDraft(supply)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Удалить черновик">
                        <SymbolView name="trash" size={17} tintColor={colors.red} />
                      </Pressable>
                    ) : (
                      <>
                        <Text style={[type.body, type.amount, styles.label]}>{formatMoney(total, { kopecks: 'auto' })}</Text>
                        <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </GlassCard>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: space.md },
  flex: { flex: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  state: { paddingVertical: space.xxl },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  group: { gap: space.sm },
  separator: { marginLeft: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  draftBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.16)' },
  draftText: { color: '#8B5CF6', fontWeight: '800' },
});
