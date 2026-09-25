import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from '@/components/form-parts';
import { DangerRow, GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { deleteCustomer, saveCustomer, type CustomerRow } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { cleanPhone, pickContact } from '@/lib/phone-book';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Новый заказчик или правка: имя контактного лица и телефон; удалить — с подтверждением. */
export default function CustomerSheet() {
  const params = useLocalSearchParams<{ customerId?: string; name?: string; phone?: string }>();
  const router = useRouter();
  // Отдельного GET у заказчиков нет — данные строки приходят параметрами из списка.
  const customer: CustomerRow | undefined = params.customerId
    ? { id: params.customerId, name: params.name || null, phone: params.phone || null, createdAt: '' }
    : undefined;

  return <CustomerForm initial={customer} onClose={() => router.back()} />;
}

function CustomerForm({ initial, onClose }: { initial: CustomerRow | undefined; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const empty = !name.trim() && !phone.trim();

  const save = async () => {
    if (empty) return;
    haptic.medium();
    setBusy(true);
    try {
      await saveCustomer(initial?.id ?? null, { name: name.trim() || null, phone: phone.trim() || null });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Заказчик не сохранён', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    initial &&
    Alert.alert('Удалить заказчика?', 'Мероприятия сохранят его имя и телефон.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteCustomer(initial.id)
            .then(() => {
              haptic.success();
              onClose();
            })
            .catch((error: unknown) => {
              haptic.error();
              Alert.alert('Заказчик не удалён', errorText(error));
            }),
      },
    ]);

  /** Имя и телефон из адресной книги — системный выбор карточки. */
  const fromContacts = () => {
    haptic.light();
    void pickContact().then((contact) => {
      if (!contact) return;
      if (contact.name) setName(contact.name);
      if (contact.phone) setPhone(cleanPhone(contact.phone));
      haptic.success();
    });
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title={initial ? 'Заказчик' : 'Новый заказчик'} onClose={onClose} />
      <GlassCard style={styles.card}>
        <FormField icon="person" value={name} onChange={setName} placeholder="Имя контактного лица" autoCapitalize="words" autoFocus={!initial} />
        <View style={sheetStyles.separator} />
        <FormField icon="phone" value={phone} onChange={setPhone} placeholder="+7 900 000-00-00" keyboardType="phone-pad" />
        <View style={sheetStyles.separator} />
        <Pressable onPress={fromContacts} style={({ pressed }) => [styles.contactRow, pressed && sheetStyles.pressedRow]} accessibilityRole="button">
          <SymbolView name="person.crop.circle.badge.plus" size={18} tintColor={colors.accent} />
          <Text style={[type.body, styles.contactText]}>Взять из контактов</Text>
        </Pressable>
      </GlassCard>
      <PrimaryButton title={busy ? 'Сохраняем…' : initial ? 'Сохранить' : 'Добавить заказчика'} icon="checkmark" busy={busy} disabled={empty} onPress={() => void save()} />
      {initial && (
        <DangerRow title="Удалить заказчика" icon="trash" onPress={remove} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  contactText: { color: colors.accent, fontWeight: '600' },
  sheet: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
});
