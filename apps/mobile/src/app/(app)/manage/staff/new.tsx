import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { createStaff } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { space } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Новый сотрудник: никнейм и пароль для входа, PIN для быстрого входа, роль. */
export default function NewStaffSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('staff');
  const [busy, setBusy] = useState(false);

  const ready = nickname.trim().length >= 2 && password.length >= 4;

  const save = async () => {
    if (!ready) return;
    if (pin && !/^\d{4}$/.test(pin)) return Alert.alert('PIN — ровно 4 цифры');
    haptic.medium();
    setBusy(true);
    try {
      await createStaff({ nickname, password, pin: pin || null, phone: phone || null, role });
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Сотрудник не добавлен', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={KEYBOARD_DISMISS} showsVerticalScrollIndicator={false}>
        <SheetHeader title="Новый сотрудник" onClose={() => router.back()} />

        <FormSection title="ВХОД" footer="Никнейм и пароль сотрудник вводит при первом входе. PIN — быстрый вход на устройстве кассы.">
          <GlassCard style={styles.card}>
            <FormField icon="person" value={nickname} onChange={setNickname} placeholder="Никнейм" autoFocus />
            <View style={sheetStyles.separator} />
            <FormField icon="key" value={password} onChange={setPassword} placeholder="Пароль, не меньше 4 символов" />
            <View style={sheetStyles.separator} />
            <FormField icon="number.circle" value={pin} onChange={setPin} placeholder="PIN из 4 цифр, необязательно" keyboardType="number-pad" />
            <View style={sheetStyles.separator} />
            <FormField icon="phone" value={phone} onChange={setPhone} placeholder="Телефон, необязательно" keyboardType="phone-pad" />
          </GlassCard>
        </FormSection>

        <FormSection title="РОЛЬ" footer={role === 'owner' ? 'Владелец видит деньги, аналитику и настройки клуба.' : 'Сотруднику потом можно настроить права на разделы «Управления».'}>
          <View style={styles.chips}>
            <GlassChip
              label="Сотрудник"
              icon="person"
              active={role === 'staff'}
              onPress={() => {
                haptic.selection();
                setRole('staff');
              }}
            />
            <GlassChip
              label="Владелец"
              icon="crown"
              active={role === 'owner'}
              onPress={() => {
                haptic.selection();
                setRole('owner');
              }}
            />
          </View>
        </FormSection>

        <PrimaryButton title={busy ? 'Добавляем…' : 'Добавить сотрудника'} icon="person.badge.plus" busy={busy} disabled={!ready} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
  chips: { flexDirection: 'row', gap: space.sm },
});
