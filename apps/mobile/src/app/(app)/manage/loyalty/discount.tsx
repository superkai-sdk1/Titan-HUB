import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { DangerRow, GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { SwitchRow } from '@/components/settings-parts';
import { deleteDiscount, saveDiscount, useDiscounts, type Discount } from '@/lib/admin-api';
import { toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Скидка: процент или сумма, ручная или автоматическая, порог по количеству. */
export default function DiscountSheet() {
  const { discountId } = useLocalSearchParams<{ discountId?: string }>();
  const router = useRouter();
  const discounts = useDiscounts();

  if (discountId && !discounts.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  return <DiscountForm original={discountId ? (discounts.data?.find((d) => d.id === discountId) ?? null) : null} onClose={() => router.back()} />;
}

function DiscountForm({ original, onClose }: { original: Discount | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(original?.name ?? '');
  const [kind, setKind] = useState<'percent' | 'fixed'>(original?.type ?? 'percent');
  const [value, setValue] = useState(original ? String(toNumber(original.value)).replace('.', ',') : '');
  const [minQuantity, setMinQuantity] = useState(original?.minQuantity && original.minQuantity > 1 ? String(original.minQuantity) : '');
  const [isAuto, setIsAuto] = useState(original?.isAuto ?? false);
  const [isActive, setIsActive] = useState(original?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Укажите название');
    const amount = parseAmount(value);
    if (amount === null || amount <= 0) return Alert.alert('Проверьте размер скидки');
    if (kind === 'percent' && amount > 100) return Alert.alert('Процент не больше 100');
    const quantity = minQuantity.trim() ? Math.round(Number(minQuantity)) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 1)) return Alert.alert('Проверьте количество');
    haptic.medium();
    setBusy(true);
    try {
      await saveDiscount(original?.id ?? null, {
        name,
        type: kind,
        value: amount,
        isActive,
        isAuto,
        minQuantity: quantity,
        itemId: original?.itemId ?? null,
        clientId: original?.clientId ?? null,
      });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Скидка не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.name}»?`, 'Скидка исчезнет из кассы. Прошлые чеки сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void deleteDiscount(original.id)
            .then(() => {
              haptic.success();
              onClose();
            })
            .catch((error: unknown) => Alert.alert('Скидка не удалена', errorText(error))),
      },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
        <SheetHeader title={original ? 'Скидка' : 'Новая скидка'} onClose={onClose} />

        <FormSection title="СКИДКА">
          <GlassCard style={styles.card}>
            <FormField icon="tag" value={name} onChange={setName} placeholder="Название, например «Студентам»" autoCapitalize="sentences" autoFocus={!original} />
            <View style={sheetStyles.separator} />
            <FormField icon={kind === 'percent' ? 'percent' : 'rublesign'} value={value} onChange={setValue} placeholder={kind === 'percent' ? 'Процент скидки' : 'Сумма скидки'} keyboardType="decimal-pad" suffix={kind === 'percent' ? '%' : '₽'} />
          </GlassCard>
        </FormSection>

        <View style={styles.chips}>
          <GlassChip
            label="Процент"
            icon="percent"
            active={kind === 'percent'}
            onPress={() => {
              haptic.selection();
              setKind('percent');
            }}
          />
          <GlassChip
            label="Сумма"
            icon="rublesign"
            active={kind === 'fixed'}
            onPress={() => {
              haptic.selection();
              setKind('fixed');
            }}
          />
        </View>

        <FormSection title="КОГДА ПРИМЕНЯТЬ" footer="Автоматическая скидка ложится в чек сама, ручную кассир выбирает в списке скидок.">
          <GlassCard>
            <SwitchRow title="Применять автоматически" value={isAuto} onChange={setIsAuto} />
            <View style={[sheetStyles.separator, styles.inset]} />
            <SwitchRow title="Скидка работает" value={isActive} onChange={setIsActive} />
          </GlassCard>
        </FormSection>

        <FormSection title="ПОРОГ" footer="Скидка включится, только если в чеке столько же позиций или больше. Пусто — без порога.">
          <GlassCard style={styles.card}>
            <FormField icon="number" value={minQuantity} onChange={setMinQuantity} placeholder="Минимальное количество" keyboardType="number-pad" suffix="шт." />
          </GlassCard>
        </FormSection>

        {(original?.itemId || original?.clientId) && <Text style={[type.footnote, styles.note]}>Скидка привязана к позиции или клиенту — привязка сохранится. Изменить её можно в веб-кассе.</Text>}

        <PrimaryButton title={busy ? 'Сохраняем…' : original ? 'Сохранить' : 'Добавить скидку'} icon="checkmark" busy={busy} disabled={!name.trim()} onPress={() => void save()} />

        {original && (
          <DangerRow title="Удалить скидку" icon="trash" onPress={remove} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { height: 300, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
  chips: { flexDirection: 'row', gap: space.sm },
  inset: { marginLeft: space.lg },
  note: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
});
