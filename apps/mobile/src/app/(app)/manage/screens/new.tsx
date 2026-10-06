import { Form, Picker, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { FieldRow, FormHost } from '@/components/native-form';
import { haptic } from '@/lib/haptics';
import { KINDS, createScreen, type ScreenKind } from '@/lib/screens-api';

/** Новый экран: название и что показывает. Остальное — в его настройках. */
export default function NewScreenEditor() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ScreenKind>('slideshow');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    haptic.medium();
    setBusy(true);
    try {
      const screen = await createScreen({ name: name.trim(), kind });
      haptic.success();
      router.replace({ pathname: '/manage/screens/[screenId]', params: { screenId: screen.id } });
    } catch (error) {
      haptic.error();
      Alert.alert('Экран не создан', error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  return (
    <>
      <EditorToolbar title="Новый экран" canSave={!!name.trim()} busy={busy} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section title="Название">
            <FieldRow value={name} placeholder="Например: ТВ у бара" autoFocus maxLength={60} onChange={setName} />
          </Section>
          <Section footer={<Text>{KINDS.find((k) => k.key === kind)?.note}</Text>}>
            <Picker
              label="Что показывает"
              selection={kind}
              onSelectionChange={(next) => {
                haptic.selection();
                setKind(next as ScreenKind);
              }}
              modifiers={[pickerStyle('menu')]}>
              {KINDS.map((k) => (
                <Text key={k.key} modifiers={[tag(k.key)]}>
                  {k.label}
                </Text>
              ))}
            </Picker>
          </Section>
        </Form>
      </FormHost>
    </>
  );
}
