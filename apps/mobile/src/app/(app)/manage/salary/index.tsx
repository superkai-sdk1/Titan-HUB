import { Button, ContentUnavailableView, DatePicker, Form, HStack, Host, LabeledContent, Picker, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, font, foregroundStyle, frame, monospacedDigit, pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { RankRow } from '@/components/analytics/native';
import { FieldRow, secondary } from '@/components/native-form';
import { fromDateTime, toDateString, useStaffList } from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useShiftSummary } from '@/lib/queries';
import { currentBusinessDay, paySalary, useBusinessDayStartHour, useSalaryEstimate, useSalaryPayments } from '@/lib/salary-api';
import { useSession } from '@/lib/session';
import { newIdempotencyKey, parseAmount, useCashOps } from '@/lib/shift-api';
import { colors } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const dayTitle = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const paidAt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const METHOD_LABEL: Record<string, string> = { cash: 'наличными', transfer: 'переводом', card: 'картой' };
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const periodText = (period: string | null) => {
  if (!period) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return `за ${dayTitle.format(new Date(`${period}T12:00:00Z`))}`;
  return `за ${period}`;
};

/**
 * Зарплата сотрудникам: выбор человека и бизнес-дня, оценка по его выручке и формуле клуба,
 * выплата наличными из кассы или переводом. Вторая выплата за тот же день не создаётся —
 * экран предупреждает заранее. Ниже — история выплат.
 */
export default function SalaryScreen() {
  const isOwner = useSession((s) => s.user?.role === 'owner');
  if (!isOwner) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ContentUnavailableView title="Только для владельца" systemImage="lock" description="Раздел «Зарплата» доступен только владельцу клуба." />
      </Host>
    );
  }
  return <SalaryOwnerScreen />;
}

function SalaryOwnerScreen() {
  const staff = useStaffList();
  const payments = useSalaryPayments(true);
  const shiftSummary = useShiftSummary();
  const cashOps = useCashOps();
  const startHour = useBusinessDayStartHour();
  const today = currentBusinessDay(startHour);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(() => fromDateTime(today, '12:00'));
  const [amountText, setAmountText] = useState('');
  const [comment, setComment] = useState('');
  // Смена сотрудника, дня или выплата очищают поля — пересоздаём их по ключу.
  const [fields, setFields] = useState(0);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const dayKey = toDateString(day);
  const estimate = useSalaryEstimate(staffId, dayKey);
  const member = (staff.data ?? []).find((m) => m.id === staffId) ?? null;
  const manual = parseAmount(amountText);
  const amount = amountText.trim() ? (manual ?? 0) : (estimate.data?.salary ?? 0);
  const existing = (payments.data ?? []).find((p) => p.staffId === staffId && p.period === dayKey) ?? null;
  const future = dayKey > today;
  const canPay = !!member && amount > 0 && !existing && !future && !busy;

  const reset = () => {
    setAmountText('');
    setComment('');
    setFields((n) => n + 1);
  };

  const pay = async (method: 'cash' | 'transfer') => {
    if (!member) return;
    haptic.medium();
    setBusy(true);
    try {
      const result = await paySalary({ profileId: member.id, amount, method, day: dayKey, comment, idempotencyKey });
      if (result.duplicate) {
        haptic.warning();
        Alert.alert(
          'Выплата уже была',
          `За ${dayTitle.format(new Date(`${dayKey}T12:00:00Z`))} ${member.nickname} уже выплачено ${money(toNumber(result.payment.amount))} ${METHOD_LABEL[result.payment.paymentMethod] ?? ''}. Новая выплата не создана.`,
        );
      } else {
        haptic.success();
        reset();
      }
      setIdempotencyKey(newIdempotencyKey());
    } catch (error) {
      haptic.error();
      Alert.alert('Зарплата не выплачена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  /** Наличные: касса может уйти в минус, а без смены деньги из кассы не спишутся — предупреждаем. */
  const confirmCash = () => {
    const shiftOpen = !!shiftSummary.data?.shift;
    const inRegister = cashOps.data?.balance.expected ?? 0;
    if (!shiftOpen) {
      Alert.alert('Смена закрыта', 'Выплата запишется, но из кассы не спишется — кассовой операции не будет. Выплатить?', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выплатить', onPress: () => void pay('cash') },
      ]);
    } else if (amount > inRegister + 0.004) {
      Alert.alert(`В кассе ${money(inRegister)}`, `После выплаты касса уйдёт в минус на ${money(amount - inRegister)}. Выплатить?`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выплатить', style: 'destructive', onPress: () => void pay('cash') },
      ]);
    } else void pay('cash');
  };

  const choose = () => {
    if (!canPay || !member) return;
    haptic.light();
    const title = `${member.nickname} · ${money(amount)}`;
    const message = 'Наличными — спишется из кассы смены. Переводом — попадёт в расходы на зарплату.';
    // ActionSheetIOS есть только на iOS; на Android тот же выбор даёт системный диалог.
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title, message, options: ['Наличными из кассы', 'Переводом', 'Отмена'], cancelButtonIndex: 2 }, (index) => {
        if (index === 0) confirmCash();
        if (index === 1) void pay('transfer');
      });
      return;
    }
    Alert.alert(title, message, [
      { text: 'Наличными из кассы', onPress: confirmCash },
      { text: 'Переводом', onPress: () => void pay('transfer') },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Stack.Title>Зарплата</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([staff.refetch(), payments.refetch(), estimate.refetch(), cashOps.refetch()])))]}>
          <Section title="Кому и за какой день" footer={future ? <Text>Этот день ещё не наступил.</Text> : undefined}>
            {staff.isLoading ? (
              <ProgressView />
            ) : (
              <Picker
                label="Сотрудник"
                selection={staffId}
                onSelectionChange={(value) => {
                  haptic.selection();
                  setStaffId(String(value));
                  reset();
                }}
                modifiers={[pickerStyle('menu')]}>
                {(staff.data ?? []).map((m) => (
                  <Text key={m.id} modifiers={[tag(m.id)]}>
                    {m.nickname}
                  </Text>
                ))}
              </Picker>
            )}
            <DatePicker
              title="Бизнес-день"
              selection={day}
              displayedComponents={['date']}
              range={{ end: fromDateTime(today, '12:00') }}
              onDateChange={(next) => {
                setDay(next);
                reset();
              }}
            />
          </Section>

          {member && (
            <Section title="Расчёт" footer={<Text>По закрытым чекам, которые открыл сотрудник, без мероприятий. 700 ₽ + 100 ₽ за каждую начатую 1 000 ₽ сверх 7 000 ₽.</Text>}>
              <LabeledContent label="Выручка за день">
                <Text modifiers={[secondary, monospacedDigit()]}>{estimate.data ? money(estimate.data.revenue) : '…'}</Text>
              </LabeledContent>
              <LabeledContent label="По формуле">
                <Text modifiers={[font({ weight: 'semibold' }), foregroundStyle(colors.accent), monospacedDigit()]}>{estimate.data ? money(estimate.data.salary) : '…'}</Text>
              </LabeledContent>
            </Section>
          )}

          {existing && (
            <Section>
              <Text modifiers={[foregroundStyle(colors.orange)]}>
                {`За этот день уже выплачено ${money(toNumber(existing.amount))} ${METHOD_LABEL[existing.paymentMethod] ?? ''}. Вторую выплату за тот же день сервер не создаст.`}
              </Text>
            </Section>
          )}

          {member && (
            <Section title="К выплате" footer={<Text>Пусто — выплатится сумма по формуле.</Text>}>
              <HStack spacing={8}>
                <FieldRow key={`amount-${fields}`} value="" placeholder={estimate.data ? String(estimate.data.salary) : '0'} keyboard="decimal-pad" onChange={setAmountText} />
                <Text modifiers={[secondary]}>₽</Text>
              </HStack>
              <FieldRow key={`comment-${fields}`} value="" placeholder="Комментарий: аванс, премия…" onChange={setComment} />
              <Button
                label={busy ? 'Выплачиваем…' : amount > 0 ? `Выплатить ${money(amount)}` : 'Выплатить'}
                systemImage="banknote"
                onPress={choose}
                modifiers={[buttonStyle('borderedProminent'), controlSize('large'), frame({ maxWidth: 10_000 }), ...(canPay ? [] : [foregroundStyle('secondary')])]}
              />
            </Section>
          )}

          {!member && (
            <Section>
              <Text modifiers={[secondary]}>Выберите сотрудника — посчитаем зарплату за день.</Text>
            </Section>
          )}

          <Section title="История выплат" footer={(payments.data?.length ?? 0) >= 100 ? <Text>Показаны последние 100 выплат.</Text> : undefined}>
            {payments.isLoading ? (
              <ProgressView />
            ) : !payments.data?.length ? (
              <Text modifiers={[secondary]}>Выплат пока не было</Text>
            ) : (
              payments.data.map((p) => (
                <RankRow
                  key={p.id}
                  photo={{ name: p.staffName ?? '··', url: (staff.data ?? []).find((m) => m.id === p.staffId)?.photoUrl }}
                  name={p.staffName ?? 'Сотрудник'}
                  caption={[periodText(p.period), p.note, paidAt.format(new Date(p.createdAt)), METHOD_LABEL[p.paymentMethod]].filter(Boolean).join(' · ')}
                  value={money(toNumber(p.amount))}
                />
              ))
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}

