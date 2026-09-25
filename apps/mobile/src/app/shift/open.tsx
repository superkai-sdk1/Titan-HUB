import { Form, Host, LabeledContent, Picker, ProgressView, Section, Text, TextField } from '@expo/ui/swift-ui';
import { foregroundStyle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useMutation } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { CashField } from '@/components/cash-field';

import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import {
  type EveningKey,
  invalidateShift,
  OPEN_SHIFT_EVENING_KEYS,
  parseAmount,
  useEveningTypes,
  useLastCashEnd,
} from '@/lib/shift-api';
import { ToolbarButton } from '@/components/toolbar';

const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

/** Открытие смены: наличные сверяются с концом прошлой смены, расхождение — только с причиной. */
export default function OpenShift() {
  const router = useRouter();
  const lastCashEnd = useLastCashEnd();
  const eveningTypes = useEveningTypes();
  const [typed, setTyped] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [evening, setEvening] = useState<EveningKey>('none');

  // Предзаполняем наличными с конца прошлой смены, как веб-касса.
  const prefill = lastCashEnd.isSuccess ? (lastCashEnd.data !== null ? String(lastCashEnd.data) : '0') : null;
  const cashText = typed ?? prefill ?? '';

  const expected = lastCashEnd.data ?? null;
  const cash = parseAmount(cashText);
  // Сервер сравнивает строго (`!== 0`): копеечный шум float не должен требовать причину.
  const matches = expected !== null && cash !== null && Math.abs(cash - expected) < 0.005;
  const needsReason = expected !== null && cash !== null && !matches;
  const diff = needsReason ? Math.round((cash - expected) * 100) / 100 : 0;
  const canSubmit = cash !== null && (!needsReason || reason.trim().length > 0);

  // Сервер принимает только эти ключи вечера; свои типы из справочника пока не отправить.
  const eveningOptions = (eveningTypes.data ?? []).filter((t) =>
    (OPEN_SHIFT_EVENING_KEYS as readonly string[]).includes(t.key) && t.key !== 'none',
  );

  const open = useMutation({
    mutationFn: () =>
      api.post('/shifts/open', {
        cashStart: matches ? expected : cash,
        eveningType: evening,
        adjustmentReason: needsReason ? reason.trim() : undefined,
      }),
    onSuccess: () => {
      haptic.success();
      invalidateShift();
      router.back();
    },
    onError: () => haptic.error(),
  });

  return (
    <>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="prominent" disabled={!canSubmit || open.isPending} onPress={() => open.mutate()}>
          {open.isPending ? 'Открываем…' : 'Открыть'}
        </ToolbarButton>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section
            title="Наличные в начале"
            footer={
              <Text>
                {lastCashEnd.isLoading
                  ? 'Смотрим, сколько осталось с прошлой смены…'
                  : expected !== null
                    ? `С прошлой смены ожидается ${formatMoney(expected, { kopecks: 'auto' })}.`
                    : 'Пересчитайте наличные в кассе.'}
              </Text>
            }>
            {prefill === null ? <ProgressView /> : <CashField initial={prefill} onChange={setTyped} />}
          </Section>

          {needsReason && (
            <Section
              title={diff > 0 ? `Излишек ${formatMoney(diff, { sign: true, kopecks: 'auto' })}` : `Недостача ${formatMoney(-diff, { kopecks: 'auto' })}`}
              footer={<Text>{diff > 0 ? 'Разница будет проведена внесением.' : 'Разница будет проведена изъятием.'}</Text>}>
              <TextField placeholder="Причина расхождения" onTextChange={setReason} />
            </Section>
          )}

          <Section title="Вечер">
            <Picker selection={evening} onSelectionChange={(value) => setEvening(value as EveningKey)} modifiers={[pickerStyle('inline')]}>
              <Text modifiers={[tag('none')]}>Без вечера</Text>
              {eveningOptions.map((t) => (
                <Text key={t.key} modifiers={[tag(t.key)]}>
                  {t.label}
                </Text>
              ))}
            </Picker>
          </Section>

          {open.isError && (
            <Section>
              <LabeledContent label="Смена не открыта">
                <Text modifiers={[foregroundStyle('red'), secondary]}>{open.error.message === 'Shift already open' ? 'Смена уже открыта' : open.error.message}</Text>
              </LabeledContent>
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
