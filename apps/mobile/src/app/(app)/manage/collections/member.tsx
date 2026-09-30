import { ContentUnavailableView, Form, HStack, Host, ProgressView, RNHostView, Section, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionRow, FieldRow, primary, secondary } from '@/components/native-form';
import { Avatar } from '@/components/new-check-parts';
import { ToolbarButton } from '@/components/toolbar';
import { excludeMember, includeMember, setMemberAmount, useCollection, type ExcludeDuration, type RosterRow } from '@/lib/collections-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';
import { colors } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const untilFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

const DURATIONS: { key: ExcludeDuration; label: string }[] = [
  { key: '1m', label: 'Исключить на месяц' },
  { key: '3m', label: 'Исключить на 3 месяца' },
  { key: 'forever', label: 'Исключить навсегда' },
];

/** Участник сбора: своя сумма взноса и исключение на месяц, три месяца или навсегда. */
export default function MemberSheet() {
  const params = useLocalSearchParams<{ collectionId: string; periodKey?: string; playerId: string }>();
  const detail = useCollection(params.collectionId, params.periodKey || null);
  const row = detail.data?.roster.find((r) => r.playerId === params.playerId);

  if (!detail.data || !row) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {detail.isLoading ? <ProgressView /> : <ContentUnavailableView title="Участник не найден" systemImage="person.crop.circle.badge.questionmark" />}
      </Host>
    );
  }

  return <MemberForm key={row.playerId} collectionId={params.collectionId} periodAmount={detail.data.period.amount} row={row} />;
}

function MemberForm({ collectionId, periodAmount, row }: { collectionId: string; periodAmount: number; row: RosterRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState(row.amountOverride !== null ? String(row.amountOverride).replace('.', ',') : '');
  const [busy, setBusy] = useState<string | null>(null);
  const value = amount.trim() ? parseAmount(amount) : null;
  const amountValid = !amount.trim() || value !== null;

  const run = async (key: string, action: () => Promise<void>, failTitle: string) => {
    haptic.medium();
    setBusy(key);
    try {
      await action();
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert(failTitle, errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const exclude = (duration: ExcludeDuration) => {
    const doIt = () => void run(`exclude-${duration}`, () => excludeMember(collectionId, row.playerId, duration), 'Участник не исключён');
    if (duration === 'forever') {
      Alert.alert(`Исключить ${row.nickname} навсегда?`, 'Вернуть в сбор можно будет здесь же.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Исключить', style: 'destructive', onPress: doIt },
      ]);
    } else doIt();
  };

  return (
    <>
      <Stack.Title>Участник сбора</Stack.Title>
      <Stack.Toolbar placement="left">
        <ToolbarButton onPress={() => router.back()}>Отмена</ToolbarButton>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="done" disabled={!amountValid || !!busy} onPress={() => void run('amount', () => setMemberAmount(collectionId, row.playerId, value), 'Сумма не сохранена')}>
          {busy === 'amount' ? 'Сохраняем…' : 'Сохранить'}
        </ToolbarButton>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section>
            <HStack spacing={14}>
              <RNHostView matchContents>
                <Avatar name={row.nickname} photoUrl={row.photoUrl} size={56} />
              </RNHostView>
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[font({ textStyle: 'title3', weight: 'semibold' }), primary, lineLimit(1)]}>{row.nickname}</Text>
                {row.fullName ? <Text modifiers={[secondary, lineLimit(1)]}>{row.fullName}</Text> : null}
              </VStack>
            </HStack>
          </Section>

          <Section title="Персональная сумма взноса" footer={<Text>{amountValid ? 'Действует на все месяцы сбора, включая прошлые. Пустое поле — общая сумма.' : 'Проверьте сумму.'}</Text>}>
            <HStack spacing={8}>
              <FieldRow value={amount} placeholder={`По умолчанию ${formatMoney(periodAmount, { kopecks: 'auto' })}`} keyboard="decimal-pad" onChange={setAmount} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
          </Section>

          <Section title="Участие в сборе" footer={row.excluded ? undefined : <Text>Исключённый не должен взнос за эти месяцы и не считается в «оплатили из».</Text>}>
            {row.excluded ? (
              <>
                <Text modifiers={[foregroundStyle(colors.orange)]}>
                  {row.excludedForever ? 'Исключён навсегда' : row.excludedUntil ? `Исключён до ${untilFormat.format(new Date(row.excludedUntil))}` : 'Исключён'}
                </Text>
                <ActionRow title={busy === 'include' ? 'Возвращаем…' : 'Вернуть в сбор'} icon="person.crop.circle.badge.checkmark" disabled={!!busy} onPress={() => void run('include', () => includeMember(collectionId, row.playerId), 'Участник не возвращён')} />
              </>
            ) : (
              DURATIONS.map((d) => (
                <ActionRow key={d.key} title={busy === `exclude-${d.key}` ? 'Исключаем…' : d.label} icon="person.crop.circle.badge.xmark" destructive={d.key === 'forever'} disabled={!!busy} onPress={() => exclude(d.key)} />
              ))
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}
