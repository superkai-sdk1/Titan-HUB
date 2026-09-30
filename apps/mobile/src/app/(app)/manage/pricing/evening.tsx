import { ColorPicker, Form, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, normalizeHex } from '@/components/native-form';
import { deleteEveningType, saveEveningType, useEveningTypesAdmin, type EveningTypeRow } from '@/lib/catalog-api';
import { haptic } from '@/lib/haptics';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Тип игрового вечера: название и цвет. Системные типы переименовываются, но не удаляются. */
export default function EveningTypeEditor() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const evenings = useEveningTypesAdmin();

  if (key && !evenings.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }
  const original = key ? (evenings.data?.find((e) => e.key === key) ?? null) : null;
  return <EveningForm key={original?.key ?? 'new'} original={original} />;
}

function EveningForm({ original }: { original: EveningTypeRow | null }) {
  const router = useRouter();
  const [label, setLabel] = useState(original?.label ?? '');
  const [color, setColor] = useState(normalizeHex(original?.color, '#10B981'));
  const [busy, setBusy] = useState(false);
  const system = !!original && (original.isSystem || original.key === 'none');

  const run = async (action: () => Promise<void>, failure: string) => {
    haptic.medium();
    setBusy(true);
    try {
      await action();
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert(failure, errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.label}»?`, 'Прошлые смены сохранят этот тип вечера.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void run(() => deleteEveningType(original.key), 'Тип вечера не удалён') },
    ]);

  return (
    <>
      <EditorToolbar
        title={original ? 'Тип вечера' : 'Новый тип вечера'}
        canSave={label.trim().length > 0}
        busy={busy}
        onSave={() => void run(() => saveEveningType(original?.key ?? null, { label, color }), 'Тип вечера не сохранён')}
      />
      <FormHost>
        <Form>
          <Section title="Название" footer={<Text>Выбирается при открытии смены; по нему аналитика делит игровые вечера.</Text>}>
            <FieldRow value={label} placeholder="Спортивная мафия, настолки…" autoFocus={!original} maxLength={60} onChange={setLabel} />
          </Section>
          <Section>
            <ColorPicker label="Цвет" selection={color} supportsOpacity={false} onSelectionChange={(next) => setColor(normalizeHex(next, color))} />
          </Section>
          {original && !system && (
            <Section>
              <ActionRow title="Удалить тип вечера" icon="trash" destructive disabled={busy} onPress={remove} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
