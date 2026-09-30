import { Form, HStack, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, secondary } from '@/components/native-form';
import { createTabletLinkCode, saveSpace, useSpacesAdmin } from '@/lib/catalog-api';
import { moneyText } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { SPACE_TYPE_LABEL, type Space } from '@/lib/pos-api';
import { parseAmount } from '@/lib/shift-api';

const TYPES = Object.keys(SPACE_TYPE_LABEL) as Space['type'][];
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Зона аренды: название, тип, почасовая ставка, вместимость, работает ли; код привязки планшета. */
export default function SpaceEditor() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const spaces = useSpacesAdmin();

  if (spaceId && !spaces.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }
  const original = spaceId ? (spaces.data?.find((s) => s.id === spaceId) ?? null) : null;
  return <SpaceForm key={original?.id ?? 'new'} original={original} />;
}

function SpaceForm({ original }: { original: Space | null }) {
  const router = useRouter();
  const [name, setName] = useState(original?.name ?? '');
  const [kind, setKind] = useState<Space['type']>(original?.type ?? 'small_booth');
  const [rate, setRate] = useState(original ? moneyText(original.hourlyRate) : '');
  const [capacity, setCapacity] = useState(original?.capacity ? String(original.capacity) : '');
  const [active, setActive] = useState(original?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);

  const hourly = rate.trim() ? parseAmount(rate) : 0;
  const people = capacity.trim() ? Number(capacity.trim()) : null;
  const peopleValid = people === null || (Number.isInteger(people) && people >= 0 && people <= 100_000);
  const canSave = name.trim().length > 0 && hourly !== null && peopleValid;

  const save = async () => {
    if (!canSave || hourly === null) return;
    haptic.medium();
    setBusy(true);
    try {
      await saveSpace(original?.id ?? null, { name, type: kind, hourlyRate: hourly, capacity: people, isActive: active });
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Зона не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const linkTablet = async () => {
    if (!original) return;
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
    <>
      <EditorToolbar title={original ? 'Зона' : 'Новая зона'} canSave={canSave} busy={busy} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section title="Название">
            <FieldRow value={name} placeholder="Например, «Кабинка 3»" autoFocus={!original} maxLength={80} onChange={setName} />
          </Section>

          <Section>
            <Picker label="Тип" selection={kind} onSelectionChange={(value) => setKind(value as Space['type'])} modifiers={[pickerStyle('menu')]}>
              {TYPES.map((t) => (
                <Text key={t} modifiers={[tag(t)]}>
                  {SPACE_TYPE_LABEL[t]}
                </Text>
              ))}
            </Picker>
          </Section>

          <Section title="Ставка в час" footer={<Text>Аренда считается по начатым часам: 1 ч 10 мин — это 2 часа по ставке зоны.</Text>}>
            <HStack spacing={8}>
              <FieldRow value={rate} placeholder="0" keyboard="decimal-pad" onChange={setRate} />
              <Text modifiers={[secondary]}>₽/ч</Text>
            </HStack>
          </Section>

          <Section title="Вместимость" footer={<Text>{peopleValid ? 'Оставьте пустым, если не важно.' : 'Целое число человек.'}</Text>}>
            <HStack spacing={8}>
              <FieldRow value={capacity} placeholder="Не указана" keyboard="numeric" onChange={setCapacity} />
              <Text modifiers={[secondary]}>чел.</Text>
            </HStack>
          </Section>

          {original && (
            <Section footer={<Text>Выключенная зона не предлагается при аренде и бронировании.</Text>}>
              <Toggle label="Зона работает" isOn={active} onIsOnChange={setActive} />
            </Section>
          )}

          {original && (
            <Section title="Планшет кабинки" footer={<Text>Одноразовый код привязки, действует 5 минут.</Text>}>
              <ActionRow title={linking ? 'Получаем код…' : 'Получить код привязки'} icon="ipad.landscape" disabled={linking} onPress={() => void linkTablet()} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
