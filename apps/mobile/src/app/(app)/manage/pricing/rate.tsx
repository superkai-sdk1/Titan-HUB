import { Form, HStack, Host, LabeledContent, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { monospacedDigit } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, secondary } from '@/components/native-form';
import { deleteEventRate, saveEventRate } from '@/lib/catalog-api';
import { useEventRates, type EventRate } from '@/lib/events-api';
import { formatMoney, moneyText, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Пакет мероприятия: цена за весь период на N часов. Раньше пакет правился системным
 * диалогом, а удалить ошибочно заведённый было нельзя вовсе.
 */
export default function EventRateEditor() {
  const { hours } = useLocalSearchParams<{ hours?: string }>();
  const rates = useEventRates();

  if (hours && !rates.data) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }
  const original = hours ? (rates.data?.find((r) => r.hours === Number(hours)) ?? null) : null;
  return <RateForm key={original?.hours ?? 'new'} original={original} taken={(rates.data ?? []).map((r) => r.hours)} />;
}

function RateForm({ original, taken }: { original: EventRate | null; taken: number[] }) {
  const router = useRouter();
  const [hoursText, setHoursText] = useState(original ? String(original.hours) : '');
  const [price, setPrice] = useState(original ? moneyText(original.price) : '');
  const [busy, setBusy] = useState(false);

  const hours = original ? original.hours : Number(hoursText.trim());
  const hoursValid = Number.isInteger(hours) && hours >= 1 && hours <= 24;
  const duplicate = !original && hoursValid && taken.includes(hours);
  const amount = parseAmount(price);
  const canSave = hoursValid && !duplicate && amount !== null;

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
    Alert.alert(`Удалить пакет на ${original.hours} ${plural(original.hours, ['час', 'часа', 'часов'])}?`, 'Уже посчитанные мероприятия сохранят свою сумму.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void run(() => deleteEventRate(original.hours), 'Пакет не удалён') },
    ]);

  const hint = !hoursValid && hoursText.trim() ? 'От 1 до 24 часов.' : duplicate ? 'Такой пакет уже есть — откройте его из списка.' : 'Сколько часов длится мероприятие по этому пакету.';

  return (
    <>
      <EditorToolbar
        title={original ? `Пакет на ${original.hours} ${plural(original.hours, ['час', 'часа', 'часов'])}` : 'Новый пакет'}
        canSave={canSave}
        busy={busy}
        onSave={() => amount !== null && void run(() => saveEventRate(hours, amount), 'Пакет не сохранён')}
      />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          {!original && (
            <Section title="Часов" footer={<Text>{hint}</Text>}>
              <FieldRow value={hoursText} placeholder="Например, 7" keyboard="numeric" autoFocus onChange={setHoursText} />
            </Section>
          )}

          <Section title="Цена за весь период">
            <HStack spacing={8}>
              <FieldRow value={price} placeholder="0" keyboard="decimal-pad" autoFocus={!!original} onChange={setPrice} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
          </Section>

          {amount !== null && amount > 0 && hoursValid && (
            <Section>
              <LabeledContent label="Выходит в час">
                <Text modifiers={[secondary, monospacedDigit()]}>{formatMoney(Math.round(amount / hours))}</Text>
              </LabeledContent>
              {original && toNumber(original.price) !== amount && (
                <LabeledContent label="Было">
                  <Text modifiers={[secondary, monospacedDigit()]}>{formatMoney(toNumber(original.price))}</Text>
                </LabeledContent>
              )}
            </Section>
          )}

          {original && (
            <Section>
              <ActionRow title="Удалить пакет" icon="trash" destructive disabled={busy} onPress={remove} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
