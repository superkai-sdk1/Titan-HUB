import { Form, Host, Picker, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { FieldRow } from '@/components/native-form';
import { createStaff } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Новый сотрудник: никнейм и пароль для входа, PIN для быстрого входа, телефон, роль. */
export default function NewStaffSheet() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('staff');
  const [busy, setBusy] = useState(false);

  const pinValid = !pin || /^\d{4}$/.test(pin);
  const ready = nickname.trim().length >= 2 && password.length >= 4 && pinValid;

  const save = async () => {
    if (!ready) return;
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
    <>
      <EditorToolbar title="Новый сотрудник" canSave={ready} busy={busy} saveLabel="Добавить" onSave={() => void save()} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section title="Никнейм" footer={<Text>Под ним сотрудник входит в кассу и виден в чеках.</Text>}>
            <FieldRow value={nickname} placeholder="Например, Кай" autoFocus maxLength={40} onChange={setNickname} />
          </Section>
          <Section title="Пароль" footer={<Text>Не меньше 4 символов — для первого входа.</Text>}>
            <FieldRow value={password} placeholder="Пароль" secure onChange={setPassword} />
          </Section>
          <Section title="PIN и телефон" footer={<Text>{pinValid ? 'PIN — 4 цифры для быстрого входа на устройстве кассы. Необязательно.' : 'PIN — ровно 4 цифры.'}</Text>}>
            <FieldRow value={pin} placeholder="PIN, необязательно" keyboard="numeric" maxLength={4} onChange={setPin} />
            <FieldRow value={phone} placeholder="Телефон, необязательно" keyboard="phone-pad" onChange={setPhone} />
          </Section>
          <Section title="Роль" footer={<Text>{role === 'owner' ? 'Владелец видит деньги, аналитику и настройки клуба.' : 'Сотруднику потом можно настроить права на разделы «Управления».'}</Text>}>
            <Picker
              selection={role}
              onSelectionChange={(value) => {
                haptic.selection();
                setRole(value as 'owner' | 'staff');
              }}
              modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('staff')]}>Сотрудник</Text>
              <Text modifiers={[tag('owner')]}>Владелец</Text>
            </Picker>
          </Section>
        </Form>
      </Host>
    </>
  );
}
