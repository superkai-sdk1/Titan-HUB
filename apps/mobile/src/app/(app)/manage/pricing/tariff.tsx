import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { ColorSwatches } from '@/components/color-swatches';
import { FormField, FormSection } from '@/components/form-parts';
import { DangerRow, GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { deleteTariff, saveTariff, useTariffsAdmin, type AdminTariff } from '@/lib/catalog-api';
import { toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';
import { space } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Тариф или статус клиента: название, сумма за вечер, цвет. Базовые статусы не удаляются. */
export default function TariffSheet() {
  const { tariffId } = useLocalSearchParams<{ tariffId?: string }>();
  const router = useRouter();
  const tariffs = useTariffsAdmin();

  if (tariffId && !tariffs.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  return <TariffForm original={tariffId ? (tariffs.data?.find((t) => t.id === tariffId) ?? null) : null} onClose={() => router.back()} />;
}

function TariffForm({ original, onClose }: { original: AdminTariff | null; onClose: () => void }) {
  const [name, setName] = useState(original?.name ?? '');
  const [price, setPrice] = useState(original ? String(toNumber(original.price)).replace('.', ',') : '');
  const [color, setColor] = useState(original && /^#[0-9a-f]{6}$/i.test(original.color) ? original.color : '#8B5CF6');
  const [busy, setBusy] = useState(false);
  const isStatus = !!original?.key;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Укажите название');
    const amount = price.trim() ? parseAmount(price) : 0;
    if (amount === null) return Alert.alert('Проверьте сумму');
    haptic.medium();
    setBusy(true);
    try {
      await saveTariff(original?.id ?? null, { name, price: amount, color });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Тариф не сохранён', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Убрать «${original.name}»?`, 'Тариф исчезнет из кассы. Прошлые чеки и аналитика сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать',
        style: 'destructive',
        onPress: () =>
          deleteTariff(original.id)
            .then(() => {
              haptic.success();
              onClose();
            })
            .catch((error: unknown) => Alert.alert('Тариф не убран', errorText(error))),
      },
    ]);

  return (
    <View style={styles.sheet}>
      <SheetHeader title={original ? (isStatus ? 'Статус клиента' : 'Тариф') : 'Новый тариф'} onClose={onClose} />
      <FormSection title="ТАРИФ" footer={isStatus ? 'Это статус клиента: касса предлагает его тариф игрокам с этим статусом.' : 'Касса добавляет тариф в чек как позицию. Цена меняется и для новых чеков.'}>
        <GlassCard style={styles.card}>
          <FormField icon="ticket" value={name} onChange={setName} placeholder="Название, например «Одна игра»" autoCapitalize="sentences" autoFocus={!original} />
          <View style={sheetStyles.separator} />
          <FormField icon="rublesign" value={price} onChange={setPrice} placeholder="Сумма за вечер" keyboardType="decimal-pad" suffix="₽" />
        </GlassCard>
      </FormSection>
      <FormSection title="ЦВЕТ">
        <ColorSwatches value={color} onChange={setColor} />
      </FormSection>
      <PrimaryButton title={busy ? 'Сохраняем…' : original ? 'Сохранить' : 'Добавить тариф'} icon="checkmark" busy={busy} disabled={!name.trim()} onPress={() => void save()} />
      {original && !original.isSystem && (
        <DangerRow title="Убрать тариф" icon="trash" onPress={remove} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { height: 300, alignItems: 'center', justifyContent: 'center' },
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
});
