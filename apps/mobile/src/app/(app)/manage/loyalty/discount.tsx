import { Form, HStack, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, secondary } from '@/components/native-form';
import { deleteDiscount, saveDiscount, useDiscounts, type Discount } from '@/lib/admin-api';
import { moneyText } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Скидка: процент или сумма, ручная или автоматическая, порог по количеству. */
export default function DiscountEditor() {
  const { discountId } = useLocalSearchParams<{ discountId?: string }>();
  const discounts = useDiscounts();

  if (discountId && !discounts.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }
  const original = discountId ? (discounts.data?.find((d) => d.id === discountId) ?? null) : null;
  return <DiscountForm key={original?.id ?? 'new'} original={original} />;
}

function DiscountForm({ original }: { original: Discount | null }) {
  const router = useRouter();
  const [name, setName] = useState(original?.name ?? '');
  const [kind, setKind] = useState<'percent' | 'fixed'>(original?.type ?? 'percent');
  const [value, setValue] = useState(original ? moneyText(original.value) : '');
  const [minQuantity, setMinQuantity] = useState(original?.minQuantity && original.minQuantity > 1 ? String(original.minQuantity) : '');
  const [isAuto, setIsAuto] = useState(original?.isAuto ?? false);
  const [isActive, setIsActive] = useState(original?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(value);
  const quantity = minQuantity.trim() ? Number(minQuantity.trim()) : null;
  const amountValid = amount !== null && amount > 0 && (kind === 'fixed' || amount <= 100);
  const quantityValid = quantity === null || (Number.isInteger(quantity) && quantity >= 1);
  const canSave = name.trim().length > 0 && amountValid && quantityValid;

  const save = async () => {
    if (!canSave || amount === null) return;
    haptic.medium();
    setBusy(true);
    try {
      await saveDiscount(original?.id ?? null, {
        name,
        type: kind,
        value: amount,
        isActive,
        isAuto,
        minQuantity: quantity,
        itemId: original?.itemId ?? null,
        clientId: original?.clientId ?? null,
      });
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Скидка не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.name}»?`, 'Скидка исчезнет из кассы. Прошлые чеки сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void deleteDiscount(original.id)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Скидка не удалена', errorText(error))),
      },
    ]);

  return (
    <>
      <EditorToolbar title={original ? 'Скидка' : 'Новая скидка'} canSave={canSave} busy={busy} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section
            title="Название"
            footer={original?.itemId || original?.clientId ? <Text>Скидка привязана к позиции или клиенту — привязка сохранится. Изменить её можно в веб-кассе.</Text> : undefined}>
            <FieldRow value={name} placeholder="Например, «Студентам»" autoFocus={!original} maxLength={80} onChange={setName} />
          </Section>

          <Section title="Размер" footer={<Text>{kind === 'percent' ? (amount !== null && amount > 100 ? 'Процент — не больше 100.' : 'Процент от суммы чека или позиции.') : 'Фиксированная сумма в рублях.'}</Text>}>
            <Picker
              selection={kind}
              onSelectionChange={(next) => {
                haptic.selection();
                setKind(next as 'percent' | 'fixed');
              }}
              modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('percent')]}>Процент</Text>
              <Text modifiers={[tag('fixed')]}>Сумма</Text>
            </Picker>
            <HStack spacing={8}>
              <FieldRow value={value} placeholder="0" keyboard="decimal-pad" onChange={setValue} />
              <Text modifiers={[secondary]}>{kind === 'percent' ? '%' : '₽'}</Text>
            </HStack>
          </Section>

          <Section title="Когда применять" footer={<Text>Автоматическая скидка ложится в чек сама, ручную кассир выбирает в списке скидок.</Text>}>
            <Toggle label="Применять автоматически" isOn={isAuto} onIsOnChange={setIsAuto} />
            <Toggle label="Скидка работает" isOn={isActive} onIsOnChange={setIsActive} />
          </Section>

          <Section title="Порог" footer={<Text>{quantityValid ? 'Скидка включится, если в чеке столько позиций или больше. Пусто — без порога.' : 'Количество — целое число от 1.'}</Text>}>
            <HStack spacing={8}>
              <FieldRow value={minQuantity} placeholder="Без порога" keyboard="numeric" onChange={setMinQuantity} />
              <Text modifiers={[secondary]}>шт.</Text>
            </HStack>
          </Section>

          {original && (
            <Section>
              <ActionRow title="Удалить скидку" icon="trash" destructive disabled={busy} onPress={remove} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
