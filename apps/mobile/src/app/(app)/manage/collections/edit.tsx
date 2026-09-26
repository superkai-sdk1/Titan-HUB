import { Host, Picker, Text as SwiftText, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { createCollection, updateCollection, useCollection, useCollections, type CollectionKind } from '@/lib/collections-api';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { parseAmount } from '@/lib/shift-api';
import { space, useAccentHex } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Новый сбор или правка: название, описание, тип (только при создании), сумма взноса, обязательность. */
export default function CollectionEditSheet() {
  const { collectionId } = useLocalSearchParams<{ collectionId?: string }>();
  const router = useRouter();
  const list = useCollections();
  const detail = useCollection(collectionId ?? '', null);
  const fromList = collectionId ? list.data?.collections.find((c) => c.id === collectionId) : undefined;
  const initial = collectionId ? (detail.data?.collection ?? fromList) : undefined;

  if (collectionId && !initial) return <View style={styles.loading} />;

  return (
    <CollectionForm
      initial={initial}
      onClose={() => router.back()}
      onCreated={(id, name) => {
        router.back();
        setTimeout(() => router.push({ pathname: '/manage/collections/[collectionId]', params: { collectionId: id, name } }), 420);
      }}
    />
  );
}

function CollectionForm({
  initial,
  onClose,
  onCreated,
}: {
  initial: { id: string; name: string; description: string | null; kind: CollectionKind; isMandatory: boolean; defaultAmount: number } | undefined;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<CollectionKind>(initial?.kind ?? 'recurring');
  const [amount, setAmount] = useState(initial && initial.defaultAmount > 0 ? String(initial.defaultAmount) : '');
  const [mandatory, setMandatory] = useState(initial?.isMandatory ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const title = name.trim();
    if (title.length < 2) return Alert.alert('Название — минимум 2 символа');
    const defaultAmount = amount.trim() ? parseAmount(amount) : 0;
    if (defaultAmount === null) return Alert.alert('Проверьте сумму взноса');
    const input = { name: title, description: description.trim() || null, defaultAmount, isMandatory: mandatory };

    haptic.medium();
    setBusy(true);
    try {
      if (initial) {
        await updateCollection(initial.id, input);
        haptic.success();
        onClose();
      } else {
        const created = await createCollection({ ...input, kind });
        haptic.success();
        onCreated(created.id, title);
      }
    } catch (error) {
      haptic.error();
      Alert.alert('Сбор не сохранён', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS}
        showsVerticalScrollIndicator={false}>
        <SheetHeader title={initial ? 'Сбор' : 'Новый сбор'} onClose={onClose} />

        {!initial && (
          <Host matchContents={{ vertical: true }} style={styles.stretch}>
            <Picker
              selection={kind}
              onSelectionChange={(value) => {
                haptic.selection();
                setKind(value as CollectionKind);
              }}
              modifiers={[pickerStyle('segmented')]}>
              <SwiftText modifiers={[tag('recurring')]}>Ежемесячный</SwiftText>
              <SwiftText modifiers={[tag('oneoff')]}>Разовый</SwiftText>
            </Picker>
          </Host>
        )}

        <FormSection title="НАЗВАНИЕ">
          <GlassCard style={styles.card}>
            <FormField icon="banknote" value={name} onChange={setName} placeholder={kind === 'recurring' ? 'Например, Фонд клуба' : 'Например, Подарок ведущему'} autoCapitalize="sentences" autoFocus={!initial} />
            <View style={sheetStyles.separator} />
            <FormField icon="text.alignleft" value={description} onChange={setDescription} placeholder="На что собираем" autoCapitalize="sentences" />
          </GlassCard>
        </FormSection>

        <FormSection
          title={kind === 'recurring' ? 'ВЗНОС В МЕСЯЦ' : 'ВЗНОС'}
          footer="Единый для всех. Участнику можно задать свою сумму прямо в сборе. Новая сумма действует на следующие периоды.">
          <GlassCard style={styles.card}>
            <FormField icon="rublesign" value={amount} onChange={setAmount} placeholder="Сумма взноса" keyboardType="decimal-pad" suffix="₽" />
          </GlassCard>
        </FormSection>

        <FormSection title="УЧАСТИЕ" footer="Участвуют резиденты, студенты и новички клуба.">
          <GlassCard style={styles.card}>
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <Toggle
                label="Обязательный для резидентов"
                isOn={mandatory}
                onIsOnChange={(on) => {
                  haptic.selection();
                  setMandatory(on);
                }}
                modifiers={[tint(accent)]}
              />
            </Host>
          </GlassCard>
        </FormSection>

        <PrimaryButton title={busy ? 'Сохраняем…' : initial ? 'Сохранить' : 'Создать сбор'} icon="checkmark" busy={busy} disabled={name.trim().length < 2} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { height: 300 },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  stretch: { alignSelf: 'stretch' },
  card: { paddingHorizontal: space.lg },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
});
