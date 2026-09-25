import { Form, Host, Picker, Section, Text, TextField } from '@expo/ui/swift-ui';
import { foregroundStyle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { CashField } from '@/components/cash-field';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { invalidateShift, newIdempotencyKey, parseAmount, useCashBalance } from '@/lib/shift-api';
import { ToolbarButton } from '@/components/toolbar';

type CashOpType = 'deposit' | 'withdrawal';

/** Внесение или изъятие наличных. Один ключ идемпотентности на операцию — повтор не проведёт её дважды. */
export default function CashOperation() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: CashOpType }>();
  const balance = useCashBalance();
  const [type, setType] = useState<CashOpType>(params.type === 'withdrawal' ? 'withdrawal' : 'deposit');
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const idempotencyKey = useRef(newIdempotencyKey());

  const amount = parseAmount(amountText);
  const canSubmit = amount !== null && amount > 0;

  const submit = useMutation({
    mutationFn: () =>
      api.post('/cashops', {
        type,
        amount,
        description: description.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: () => {
      haptic.success();
      idempotencyKey.current = newIdempotencyKey();
      invalidateShift();
      router.back();
    },
    onError: async () => {
      haptic.error();
      // Проверка остатка идёт раньше дедупликации — перечитываем кассу перед повтором.
      await balance.refetch();
    },
  });

  const errorText =
    submit.error instanceof ApiError && submit.error.status >= 500 ? 'Не удалось сохранить операцию' : submit.error?.message;

  return (
    <>
      <Stack.Title>{type === 'deposit' ? 'Внесение' : 'Изъятие'}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="prominent" disabled={!canSubmit || submit.isPending} onPress={() => submit.mutate()}>
          {submit.isPending ? 'Проводим…' : 'Провести'}
        </ToolbarButton>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section>
            <Picker selection={type} onSelectionChange={(value) => setType(value as CashOpType)} modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('deposit')]}>Внести</Text>
              <Text modifiers={[tag('withdrawal')]}>Изъять</Text>
            </Picker>
          </Section>

          <Section
            title="Сумма"
            footer={<Text>{balance.data ? `Сейчас в кассе ${formatMoney(balance.data.expected, { kopecks: 'auto' })}.` : ' '}</Text>}>
            <CashField initial="" autoFocus onChange={setAmountText} />
          </Section>

          <Section title="Комментарий">
            <TextField placeholder={type === 'deposit' ? 'Например, размен' : 'Например, инкассация'} onTextChange={setDescription} />
          </Section>

          {submit.isError && (
            <Section>
              <Text modifiers={[foregroundStyle('red')]}>{errorText}</Text>
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
