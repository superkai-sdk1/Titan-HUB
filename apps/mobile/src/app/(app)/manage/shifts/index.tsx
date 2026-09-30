import { Button, ContentUnavailableView, Form, HStack, Host, LabeledContent, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  buttonStyle,
  contentTransition,
  controlSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  refreshable,
} from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ActionRow, LinkRow, primary, secondary } from '@/components/native-form';
import { formatDuration, formatMoney, formatTime, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useShiftSummary } from '@/lib/queries';
import { EVENING_LABEL, useCashOps, useShiftHistory, type CashOpItem } from '@/lib/shift-api';
import { colors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', weekday: 'short' });

const OP_LOOK: Record<CashOpItem['type'], { title: string; symbol: SFSymbol; color: string; sign: 1 | -1 }> = {
  deposit: { title: 'Внесение', symbol: 'arrow.down.circle.fill', color: '#34C759', sign: 1 },
  withdrawal: { title: 'Изъятие', symbol: 'arrow.up.circle.fill', color: '#FF9500', sign: -1 },
  salary: { title: 'Зарплата', symbol: 'person.crop.circle.badge.checkmark', color: '#32ADE6', sign: -1 },
};

const money = (value: number, sign = false) => formatMoney(value, { sign, kopecks: 'auto' });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * «Смены»: текущая смена — сколько в кассе и откуда, операции с наличными, быстрые действия;
 * ниже история смен, каждая открывается подробным отчётом.
 */
export default function ShiftsScreen() {
  const router = useRouter();
  const now = useNow(60_000);
  const summary = useShiftSummary();
  const open = summary.data?.shift ? summary.data : null;
  const shift = open?.shift ?? null;
  const cashOps = useCashOps(!!shift);
  const history = useShiftHistory();

  const balance = cashOps.data?.balance;
  const operations = cashOps.data?.operations ?? [];
  const pastShifts = (history.data?.pages.flat() ?? []).filter((row) => row.shift.status === 'closed');
  const inRegister = balance?.expected ?? open?.cashInRegister ?? 0;

  const line = (label: string, value: number, sign = false, positive = false) => (
    <LabeledContent key={label} label={label}>
      <Text modifiers={[positive ? foregroundStyle(colors.green) : secondary, monospacedDigit()]}>{money(value, sign)}</Text>
    </LabeledContent>
  );

  return (
    <>
      <Stack.Title>Смены</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([summary.refetch(), cashOps.refetch(), history.refetch()])))]}>
          {summary.isLoading ? (
            <Section>
              <ProgressView />
            </Section>
          ) : shift ? (
            <>
              <Section footer={<Text>{`Открыта в ${formatTime(shift.openedAt)} · идёт ${formatDuration(shift.openedAt, now)}${EVENING_LABEL[shift.eveningType] ? ` · ${EVENING_LABEL[shift.eveningType]}` : ''}`}</Text>}>
                <VStack alignment="leading" spacing={2}>
                  <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), secondary]}>В КАССЕ</Text>
                  <Text
                    modifiers={[
                      font({ size: 36, weight: 'bold', design: 'rounded' }),
                      primary,
                      monospacedDigit(),
                      contentTransition('numericText'),
                      animation(Animation.default, inRegister),
                    ]}>
                    {money(inRegister)}
                  </Text>
                </VStack>
                <HStack spacing={10}>
                  <Button
                    label="Внести"
                    systemImage="arrow.down.circle"
                    onPress={() => {
                      haptic.light();
                      router.push({ pathname: '/shift/cash', params: { type: 'deposit' } });
                    }}
                    modifiers={[buttonStyle('bordered'), controlSize('large'), frame({ maxWidth: 10_000 })]}
                  />
                  <Button
                    label="Изъять"
                    systemImage="arrow.up.circle"
                    onPress={() => {
                      haptic.light();
                      router.push({ pathname: '/shift/cash', params: { type: 'withdrawal' } });
                    }}
                    modifiers={[buttonStyle('bordered'), controlSize('large'), frame({ maxWidth: 10_000 })]}
                  />
                </HStack>
              </Section>

              {balance && (
                <Section title="Откуда наличные">
                  {line('Начало смены', balance.cashStart)}
                  {!!balance.cashPayments && line('Наличные оплаты', balance.cashPayments, true)}
                  {!!balance.deposits && line('Внесения', balance.deposits, true, true)}
                  {!!balance.withdrawals && line('Изъятия', -balance.withdrawals)}
                  {!!balance.salaries && line('Зарплаты', -balance.salaries)}
                  {!!balance.cashRefundTotal && line('Возвраты наличными', -balance.cashRefundTotal)}
                </Section>
              )}

              {operations.length > 0 && (
                <Section title="Операции с наличными">
                  {operations.map((op) => {
                    const look = OP_LOOK[op.type];
                    return (
                      <LinkRow
                        key={op.id}
                        icon={look.symbol}
                        color={look.color}
                        title={op.description || look.title}
                        subtitle={[formatTime(op.createdAt), op.createdBy].filter(Boolean).join(' · ')}
                        value={money(look.sign * toNumber(op.amount), look.sign > 0)}
                        valueColor={look.sign > 0 ? colors.green : undefined}
                      />
                    );
                  })}
                </Section>
              )}

              <Section>
                <ActionRow
                  title="Закрыть смену"
                  icon="moon"
                  destructive
                  onPress={() => {
                    haptic.light();
                    router.push('/shift/close');
                  }}
                />
              </Section>
            </>
          ) : (
            <Section>
              <ContentUnavailableView title="Смена закрыта" systemImage="moon.zzz" description="Чтобы открывать чеки, начните смену и пересчитайте наличные." />
              <Button
                label="Открыть смену"
                systemImage="sunrise"
                onPress={() => {
                  haptic.light();
                  router.push('/shift/open');
                }}
                modifiers={[buttonStyle('borderedProminent'), controlSize('large'), frame({ maxWidth: 10_000 })]}
              />
            </Section>
          )}

          <Section title="История" footer={history.hasNextPage ? undefined : <Text>Нажмите на смену — откроется отчёт: итоги, чеки, товары, игроки.</Text>}>
            {history.isLoading ? (
              <ProgressView />
            ) : pastShifts.length === 0 ? (
              <Text modifiers={[secondary]}>Закрытых смен пока нет</Text>
            ) : (
              pastShifts.map(({ shift: row, openedByNickname }) => (
                <Button
                  key={row.id}
                  onPress={() => {
                    haptic.selection();
                    router.push({ pathname: '/manage/shifts/[shiftId]', params: { shiftId: row.id } });
                  }}>
                  <HStack spacing={10}>
                    <VStack alignment="leading" spacing={1}>
                      <Text modifiers={[primary, lineLimit(1)]}>{capitalize(dateFormat.format(new Date(row.openedAt)))}</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), secondary, lineLimit(1)]}>
                        {[`${formatTime(row.openedAt)}–${row.closedAt ? formatTime(row.closedAt) : '…'}`, openedByNickname, EVENING_LABEL[row.eveningType]].filter(Boolean).join(' · ')}
                      </Text>
                    </VStack>
                    <Spacer />
                    <VStack alignment="trailing" spacing={1}>
                      <Text modifiers={[primary, monospacedDigit()]}>{row.cashEnd !== null ? money(toNumber(row.cashEnd)) : '—'}</Text>
                      <Text modifiers={[font({ textStyle: 'caption2' }), secondary]}>в кассе</Text>
                    </VStack>
                  </HStack>
                </Button>
              ))
            )}
            {history.hasNextPage && (
              <ActionRow title={history.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'} icon="arrow.down.circle" disabled={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} />
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}

