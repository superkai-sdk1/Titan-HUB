import { Host, Toggle } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { createTabletLinkCode, saveSpace, SPACE_LOOK, useSpacesAdmin } from '@/lib/catalog-api';
import { toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { SPACE_TYPE_LABEL, type Space } from '@/lib/pos-api';
import { parseAmount } from '@/lib/shift-api';
import { space as gap, type, useAccentHex } from '@/lib/theme';

const TYPES = Object.keys(SPACE_TYPE_LABEL) as Space['type'][];
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Зона аренды: название, тип, почасовая ставка, вместимость; код привязки планшета кабинки. */
export default function SpaceSheet() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const router = useRouter();
  const spaces = useSpacesAdmin();

  if (spaceId && !spaces.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  return <SpaceForm original={spaceId ? (spaces.data?.find((s) => s.id === spaceId) ?? null) : null} onClose={() => router.back()} />;
}

function SpaceForm({ original, onClose }: { original: Space | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const [name, setName] = useState(original?.name ?? '');
  const [kind, setKind] = useState<Space['type']>(original?.type ?? 'small_booth');
  const [rate, setRate] = useState(original ? String(toNumber(original.hourlyRate)).replace('.', ',') : '');
  const [capacity, setCapacity] = useState(original?.capacity ? String(original.capacity) : '');
  const [active, setActive] = useState(original?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Укажите название');
    const hourly = rate.trim() ? parseAmount(rate) : 0;
    if (hourly === null) return Alert.alert('Проверьте ставку');
    const people = capacity.trim() ? Math.round(Number(capacity)) : null;
    if (people !== null && (!Number.isFinite(people) || people < 0)) return Alert.alert('Проверьте вместимость');
    haptic.medium();
    setBusy(true);
    try {
      await saveSpace(original?.id ?? null, { name, type: kind, hourlyRate: hourly, capacity: people, isActive: active });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Зона не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const linkTablet = async () => {
    if (!original) return;
    haptic.light();
    setLinking(true);
    try {
      const { code, spaceName } = await createTabletLinkCode(original.id);
      haptic.success();
      Alert.alert(`Код для планшета: ${code.slice(0, 3)} ${code.slice(3)}`, `Введите его на планшете кабинки «${spaceName}» на экране привязки. Код действует 5 минут.`);
    } catch (error) {
      haptic.error();
      Alert.alert('Код не получен', errorText(error));
    } finally {
      setLinking(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, gap.lg) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
        <SheetHeader title={original ? 'Зона' : 'Новая зона'} onClose={onClose} />

        <FormSection title="ЗОНА">
          <GlassCard style={styles.card}>
            <FormField icon="square.split.bottomrightquarter" value={name} onChange={setName} placeholder="Название, например «Кабинка 3»" autoCapitalize="sentences" autoFocus={!original} />
            <View style={sheetStyles.separator} />
            <FormField icon="rublesign" value={rate} onChange={setRate} placeholder="Ставка в час" keyboardType="decimal-pad" suffix="₽/ч" />
            <View style={sheetStyles.separator} />
            <FormField icon="person.2" value={capacity} onChange={setCapacity} placeholder="Вместимость, человек" keyboardType="number-pad" />
          </GlassCard>
        </FormSection>

        <FormSection title="ТИП">
          <View style={styles.chips}>
            {TYPES.map((t) => (
              <GlassChip
                key={t}
                label={SPACE_TYPE_LABEL[t]}
                icon={SPACE_LOOK[t].symbol}
                tint={SPACE_LOOK[t].color}
                active={kind === t}
                onPress={() => {
                  haptic.selection();
                  setKind(t);
                }}
              />
            ))}
          </View>
        </FormSection>

        {original && (
          <GlassCard style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.flex}>
                <Text style={[type.body, sheetStyles.label]}>Зона работает</Text>
                <Text style={[type.caption1, sheetStyles.secondary]}>Выключенная зона не предлагается при аренде</Text>
              </View>
              <Host matchContents seedColor={accent}>
                <Toggle
                  isOn={active}
                  onIsOnChange={(on) => {
                    haptic.selection();
                    setActive(on);
                  }}
                  modifiers={[tint(accent)]}
                />
              </Host>
            </View>
          </GlassCard>
        )}

        <PrimaryButton title={busy ? 'Сохраняем…' : original ? 'Сохранить' : 'Добавить зону'} icon="checkmark" busy={busy} disabled={!name.trim()} onPress={() => void save()} />

        {original && (
          <GlassCard style={styles.tablet}>
            <SymbolView name="ipad.landscape" size={22} tintColor={accent} />
            <View style={styles.flex}>
              <Text style={[type.body, sheetStyles.label]}>Планшет кабинки</Text>
              <Text style={[type.caption1, sheetStyles.secondary]}>Одноразовый код привязки на 5 минут</Text>
            </View>
            <GlassChip label={linking ? '…' : 'Получить код'} active onPress={() => void linkTablet()} />
          </GlassCard>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { height: 300, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: gap.lg, paddingTop: gap.xl, gap: gap.lg },
  card: { paddingHorizontal: gap.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: gap.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: gap.md, minHeight: 60 },
  tablet: { flexDirection: 'row', alignItems: 'center', gap: gap.md, padding: gap.lg },
});
