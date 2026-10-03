import { ColorPicker, Form, HStack, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, normalizeHex, secondary } from '@/components/native-form';
import { deleteTariff, restoreTariff, saveTariff, useTariffsAdmin, type AdminTariff } from '@/lib/catalog-api';
import { moneyText } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Тариф или статус клиента: название, сумма за вечер, цвет. Базовые статусы не скрываются. */
export default function TariffEditor() {
  const { tariffId } = useLocalSearchParams<{ tariffId?: string }>();
  const tariffs = useTariffsAdmin();

  if (tariffId && !tariffs.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }
  const original = tariffId ? (tariffs.data?.find((t) => t.id === tariffId) ?? null) : null;
  return <TariffForm key={original?.id ?? 'new'} original={original} />;
}

function TariffForm({ original }: { original: AdminTariff | null }) {
  const router = useRouter();
  const [name, setName] = useState(original?.name ?? '');
  const [price, setPrice] = useState(original ? moneyText(original.price) : '');
  const [color, setColor] = useState(normalizeHex(original?.color, '#8B5CF6'));
  const [onScreen, setOnScreen] = useState(original?.isScreenVisible ?? true);
  const [busy, setBusy] = useState(false);

  const isStatus = !!original?.key;
  const hidden = original?.isActive === false;
  const amount = price.trim() ? parseAmount(price) : 0;
  const canSave = name.trim().length > 0 && amount !== null;

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

  const save = () => {
    if (!canSave || amount === null) return;
    void run(() => saveTariff(original?.id ?? null, { name, price: amount, color, isScreenVisible: onScreen }), 'Тариф не сохранён');
  };

  const hide = () =>
    original &&
    Alert.alert(`Убрать «${original.name}» из кассы?`, 'Тариф пропадёт из кассы и меню. Прошлые чеки и аналитика сохранятся, а вернуть его можно в разделе «Скрытые».', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Убрать', style: 'destructive', onPress: () => void run(() => deleteTariff(original.id), 'Тариф не убран') },
    ]);

  return (
    <>
      <EditorToolbar title={original ? (isStatus ? 'Статус клиента' : 'Тариф') : 'Новый тариф'} canSave={canSave} busy={busy} onSave={save} />
      <FormHost>
        <Form>
          <Section title="Название">
            <FieldRow value={name} placeholder="Например, «Одна игра»" autoFocus={!original} maxLength={120} onChange={setName} />
          </Section>

          <Section
            title="Сумма за вечер"
            footer={
              <Text>
                {isStatus
                  ? 'Касса предлагает эту сумму игрокам со статусом. Новая цена действует для новых позиций в чеках.'
                  : 'Касса добавляет тариф в чек как позицию. Новая цена действует для новых позиций в чеках.'}
              </Text>
            }>
            <HStack spacing={8}>
              <FieldRow value={price} placeholder="0" keyboard="decimal-pad" onChange={setPrice} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
          </Section>

          <Section>
            <ColorPicker label="Цвет" selection={color} supportsOpacity={false} onSelectionChange={(next) => setColor(normalizeHex(next, color))} />
          </Section>

          {original?.itemId && (
            <Section title="Экран ТВ" footer={<Text>Тариф в меню на телевизоре. Выключите — пропадёт с экрана, в кассе останется.</Text>}>
              <Toggle label="На экране ТВ" isOn={onScreen} onIsOnChange={setOnScreen} />
            </Section>
          )}

          {original && !original.isSystem && (
            <Section footer={<Text>{hidden ? 'Тариф снова появится в кассе и меню.' : 'Прошлые чеки сохранят тариф, вернуть его можно в разделе «Скрытые».'}</Text>}>
              {hidden ? (
                <ActionRow title="Вернуть в кассу" icon="arrow.uturn.backward.circle" disabled={busy} onPress={() => void run(() => restoreTariff(original.id), 'Тариф не вернулся')} />
              ) : (
                <ActionRow title="Убрать из кассы" icon="eye.slash" destructive disabled={busy} onPress={hide} />
              )}
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
