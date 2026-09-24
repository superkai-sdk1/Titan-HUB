import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassCard, GlassChip, PrimaryButton, SheetHeader } from '@/components/new-check-parts';
import { Row } from '@/components/settings-parts';
import { createTierRule, discountValueText, useDiscounts } from '@/lib/admin-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Скидка по статусу клиента: выбираем статус и готовую скидку из списка. */
export default function TierRuleSheet() {
  const router = useRouter();
  const tiers = useClientTiers();
  const discounts = useDiscounts();
  const [tier, setTier] = useState<string | null>(null);
  const [discountId, setDiscountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const available = (discounts.data ?? []).filter((d) => d.isActive);

  const save = async () => {
    if (!tier || !discountId) return;
    haptic.medium();
    setBusy(true);
    try {
      await createTierRule(tier, discountId);
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Правило не создано', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Скидка для статуса" onClose={() => router.back()} />

      <Text style={[type.footnote, styles.caption]}>Клиент с этим статусом получит скидку в кассе автоматически.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipStrip} contentContainerStyle={styles.chips}>
        {(tiers.data ?? []).map((row) => {
          const look = tierLook(row.key, tiers.data);
          return (
            <GlassChip
              key={row.key}
              label={look.label}
              tint={look.color}
              active={tier === row.key}
              onPress={() => {
                haptic.selection();
                setTier(row.key);
              }}
            />
          );
        })}
      </ScrollView>

      <GlassCard>
        {available.map((discount, index) => (
          <View key={discount.id}>
            {index > 0 && <View style={styles.separator} />}
            <Row
              icon={discount.type === 'percent' ? 'percent' : 'rublesign'}
              color={discountId === discount.id ? colors.accent : '#EC4899'}
              title={discount.name}
              subtitle={discount.isAuto ? 'Автоматическая' : 'Ручная'}
              value={discountValueText(discount)}
              onPress={() => setDiscountId(discount.id)}
            />
          </View>
        ))}
      </GlassCard>
      {available.length === 0 && <Text style={[type.subhead, styles.caption, styles.centered]}>Сначала создайте скидку.</Text>}

      <PrimaryButton title={busy ? 'Сохраняем…' : 'Добавить правило'} icon="checkmark" busy={busy} disabled={!tier || !discountId} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  centered: { textAlign: 'center' },
  chipStrip: { flexGrow: 0, flexShrink: 0, height: 44, marginHorizontal: -space.lg },
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 62 },
});
