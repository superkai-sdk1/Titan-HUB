import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { ColorSwatches } from '@/components/color-swatches';
import { FormField, FormSection } from '@/components/form-parts';
import { DangerRow, GlassCard, PrimaryButton, SheetHeader } from '@/components/new-check-parts';
import { deleteEveningType, saveEveningType, useEveningTypesAdmin, type EveningTypeRow } from '@/lib/catalog-api';
import { haptic } from '@/lib/haptics';
import { space } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Тип игрового вечера: название и цвет. Системные типы не удаляются. */
export default function EveningTypeSheet() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const router = useRouter();
  const evenings = useEveningTypesAdmin();

  if (key && !evenings.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  return <EveningForm original={key ? (evenings.data?.find((e) => e.key === key) ?? null) : null} onClose={() => router.back()} />;
}

function EveningForm({ original, onClose }: { original: EveningTypeRow | null; onClose: () => void }) {
  const [label, setLabel] = useState(original?.label ?? '');
  const [color, setColor] = useState(original?.color && /^#[0-9a-f]{6}$/i.test(original.color) ? original.color : '#10B981');
  const [busy, setBusy] = useState(false);
  const system = !!original && (original.isSystem || original.key === 'none');

  const save = async () => {
    if (!label.trim()) return Alert.alert('Укажите название');
    haptic.medium();
    setBusy(true);
    try {
      await saveEveningType(original?.key ?? null, { label, color });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Тип вечера не сохранён', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.label}»?`, 'Прошлые смены сохранят этот тип вечера.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteEveningType(original.key)
            .then(() => {
              haptic.success();
              onClose();
            })
            .catch((error: unknown) => Alert.alert('Тип вечера не удалён', errorText(error))),
      },
    ]);

  return (
    <View style={styles.sheet}>
      <SheetHeader title={original ? 'Тип вечера' : 'Новый тип вечера'} onClose={onClose} />
      <FormSection title="НАЗВАНИЕ" footer="Выбирается при открытии смены.">
        <GlassCard style={styles.card}>
          <FormField icon="moon.stars" value={label} onChange={setLabel} placeholder="Спортивная мафия, настолки…" autoCapitalize="sentences" autoFocus={!original} />
        </GlassCard>
      </FormSection>
      <FormSection title="ЦВЕТ">
        <ColorSwatches value={color} onChange={setColor} />
      </FormSection>
      <PrimaryButton title={busy ? 'Сохраняем…' : original ? 'Сохранить' : 'Добавить'} icon="checkmark" busy={busy} disabled={!label.trim()} onPress={() => void save()} />
      {original && !system && (
        <DangerRow title="Удалить тип вечера" icon="trash" onPress={remove} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { height: 300, alignItems: 'center', justifyContent: 'center' },
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
});
