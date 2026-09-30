import { Form, HStack, Host, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { FieldRow, secondary } from '@/components/native-form';
import { createCollection, updateCollection, useCollection, useCollections, type CollectionKind } from '@/lib/collections-api';
import { moneyText } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Initial = { id: string; name: string; description: string | null; kind: CollectionKind; defaultAmount: number; isMandatory: boolean };

/** Новый сбор или правка: название, описание, тип (только при создании), сумма взноса, обязательность. */
export default function CollectionEditSheet() {
  const { collectionId } = useLocalSearchParams<{ collectionId?: string }>();
  const router = useRouter();
  const list = useCollections();
  const detail = useCollection(collectionId ?? '', null);
  const fromList = collectionId ? list.data?.collections.find((c) => c.id === collectionId) : undefined;
  const initial = collectionId ? (detail.data?.collection ?? fromList) : undefined;

  if (collectionId && !initial) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }

  return (
    <CollectionForm
      key={initial?.id ?? 'new'}
      initial={initial}
      onCreated={(id, name) => {
        router.back();
        setTimeout(() => router.push({ pathname: '/manage/collections/[collectionId]', params: { collectionId: id, name } }), 420);
      }}
    />
  );
}

function CollectionForm({ initial, onCreated }: { initial: Initial | undefined; onCreated: (id: string, name: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<CollectionKind>(initial?.kind ?? 'recurring');
  const [amount, setAmount] = useState(initial && initial.defaultAmount > 0 ? moneyText(initial.defaultAmount) : '');
  const [mandatory, setMandatory] = useState(initial?.isMandatory ?? true);
  const [busy, setBusy] = useState(false);

  const defaultAmount = amount.trim() ? parseAmount(amount) : 0;
  const canSave = name.trim().length >= 2 && defaultAmount !== null;

  const save = async () => {
    if (!canSave || defaultAmount === null) return;
    const title = name.trim();
    const input = { name: title, description: description.trim() || null, defaultAmount, isMandatory: mandatory };
    haptic.medium();
    setBusy(true);
    try {
      if (initial) {
        await updateCollection(initial.id, input);
        haptic.success();
        router.back();
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
    <>
      <EditorToolbar title={initial ? 'Сбор' : 'Новый сбор'} canSave={canSave} busy={busy} saveLabel={initial ? 'Сохранить' : 'Создать'} onSave={() => void save()} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          {!initial && (
            <Section footer={<Text>{kind === 'recurring' ? 'Ежемесячный — новый период открывается каждый месяц (например, Фонд клуба).' : 'Разовый — один сбор на конкретную цель.'}</Text>}>
              <Picker
                selection={kind}
                onSelectionChange={(value) => {
                  haptic.selection();
                  setKind(value as CollectionKind);
                }}
                modifiers={[pickerStyle('segmented')]}>
                <Text modifiers={[tag('recurring')]}>Ежемесячный</Text>
                <Text modifiers={[tag('oneoff')]}>Разовый</Text>
              </Picker>
            </Section>
          )}

          <Section title="Название">
            <FieldRow value={name} placeholder={kind === 'recurring' ? 'Например, Фонд клуба' : 'Например, Подарок ведущему'} autoFocus={!initial} maxLength={120} onChange={setName} />
            <FieldRow value={description ?? ''} placeholder="На что собираем" multiline onChange={setDescription} />
          </Section>

          <Section
            title={kind === 'recurring' ? 'Взнос в месяц' : 'Взнос'}
            footer={<Text>Единый для всех. Участнику можно задать свою сумму прямо в сборе. Новая сумма действует на следующие периоды.</Text>}>
            <HStack spacing={8}>
              <FieldRow value={amount} placeholder="0" keyboard="decimal-pad" onChange={setAmount} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
          </Section>

          <Section title="Участие" footer={<Text>Участвуют резиденты, студенты и новички клуба.</Text>}>
            <Toggle label="Обязательный для резидентов" isOn={mandatory} onIsOnChange={setMandatory} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
