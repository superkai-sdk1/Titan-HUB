import { Button, Chart, ContentUnavailableView, Form, HStack, Host, LabeledContent, Picker, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, frame, monospacedDigit, pickerStyle, shapes, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { LegendRow, RankRow, share, Tile } from '@/components/analytics/native';
import { funnyGuestName } from '@/lib/checks';
import { formatMoney, formatTime, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { METHODS } from '@/lib/payment';
import { TIER_LABEL } from '@/lib/pos-api';
import { useShiftReport } from '@/lib/shift-api';
import { colors } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';

type Tab = 'overview' | 'checks' | 'items' | 'players';

const ABC_COLOR: Record<'A' | 'B' | 'C', string> = { A: '#34C759', B: '#FF9500', C: '#8E8E93' };

function methodLook(method: PaymentMethod | null): { title: string; color: string } {
  if (method && method !== 'split') return METHODS[method];
  return { title: method === 'split' ? 'Раздельная' : 'Без оплаты', color: '#8E8E93' };
}

/** Отчёт смены, как в веб-кассе: итоги, закрытые чеки, товары с ABC-анализом и игроки. */
export default function ShiftReportScreen() {
  const { shiftId } = useLocalSearchParams<{ shiftId: string }>();
  const router = useRouter();
  const report = useShiftReport(shiftId);
  const [tab, setTab] = useState<Tab>('overview');
  const data = report.data;

  const payments = [...(data?.payments ?? [])].sort((a, b) => toNumber(b.total) - toNumber(a.total));
  const paymentsTotal = payments.reduce((sum, p) => sum + toNumber(p.total), 0);

  return (
    <>
      <Stack.Title>Отчёт смены</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section>
            <Picker
              selection={tab}
              onSelectionChange={(value) => {
                haptic.selection();
                setTab(value as Tab);
              }}
              modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('overview')]}>Итоги</Text>
              <Text modifiers={[tag('checks')]}>Чеки</Text>
              <Text modifiers={[tag('items')]}>Товары</Text>
              <Text modifiers={[tag('players')]}>Игроки</Text>
            </Picker>
          </Section>

          {!data ? (
            <Section>{report.isError ? <Text>{report.error.message}</Text> : <ProgressView />}</Section>
          ) : tab === 'overview' ? (
            <>
              <Section>
                <HStack spacing={12}>
                  <Tile label="Выручка" value={formatMoney(data.overview.totalRevenue)} />
                  <Tile label="Чеков" value={String(data.overview.checksCount)} />
                </HStack>
                <HStack spacing={12}>
                  <Tile label="Средний чек" value={formatMoney(data.overview.avgCheck)} />
                  <Tile label="Гостей" value={String(data.overview.uniquePlayers)} />
                </HStack>
                {data.overview.refundsTotal > 0 && (
                  <LabeledContent label="Возвраты">
                    <Text modifiers={[foregroundStyle(colors.red), monospacedDigit()]}>{formatMoney(-data.overview.refundsTotal)}</Text>
                  </LabeledContent>
                )}
              </Section>
              {payments.length > 0 && (
                <Section title="Способы оплаты">
                  <Chart
                    type="pie"
                    animate
                    data={payments.map((p) => ({ x: methodLook(p.method).title, y: toNumber(p.total), color: methodLook(p.method).color }))}
                    pieStyle={{ innerRadius: 0.62, angularInset: 1.5 }}
                    modifiers={[frame({ height: 150 })]}
                  />
                  {payments.map((p) => (
                    <LegendRow key={p.method} color={methodLook(p.method).color} label={methodLook(p.method).title} value={formatMoney(p.total)} percent={share(toNumber(p.total), paymentsTotal)} />
                  ))}
                </Section>
              )}
            </>
          ) : tab === 'checks' ? (
            <Section title={`${data.checks.length} ${plural(data.checks.length, ['чек', 'чека', 'чеков'])}`} footer={<Text>Нажмите на чек, чтобы открыть его в кассе.</Text>}>
              {data.checks.length === 0 ? (
                <ContentUnavailableView title="Закрытых чеков нет" systemImage="receipt" />
              ) : (
                [...data.checks]
                  .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
                  .map((check) => (
                    <Button
                      key={check.id}
                      onPress={() => {
                        haptic.selection();
                        router.push({ pathname: '/pos/[checkId]', params: { checkId: check.id } });
                      }}>
                      <RankRow
                        name={check.guestNames?.[0] ?? funnyGuestName(check.id)}
                        caption={`${formatTime(check.createdAt)}–${check.closedAt ? formatTime(check.closedAt) : '…'} · ${methodLook(check.paymentMethod).title}`}
                        value={formatMoney(check.totalAmount)}
                      />
                    </Button>
                  ))
              )}
            </Section>
          ) : tab === 'items' ? (
            <Section title="ABC-анализ" footer={<Text>A — позиции, дающие 80% выручки смены, B — ещё 15%, C — остальные.</Text>}>
              {data.topItems.length === 0 ? (
                <ContentUnavailableView title="Продаж нет" systemImage="cart" />
              ) : (
                data.topItems.map((item) => (
                  <HStack key={item.itemId} spacing={12}>
                    <Text
                      modifiers={[
                        font({ textStyle: 'caption', weight: 'heavy' }),
                        foregroundStyle(ABC_COLOR[item.abc]),
                        frame({ width: 26, height: 26 }),
                        background(`${ABC_COLOR[item.abc]}26`, shapes.roundedRectangle({ cornerRadius: 7 })),
                      ]}>
                      {item.abc}
                    </Text>
                    <RankRow name={item.name ?? 'Позиция'} caption={`${toNumber(item.totalQty)} шт · ${Math.round(item.share * 10) / 10}%`} value={formatMoney(item.totalRev)} />
                  </HStack>
                ))
              )}
            </Section>
          ) : (
            <Section title="Игроки">
              {data.playerStats.length === 0 ? (
                <ContentUnavailableView title="Игроков нет" systemImage="person.2" />
              ) : (
                data.playerStats.map((player, index) => (
                  <RankRow
                    key={player.playerId ?? `guest-${index}`}
                    rank={index + 1}
                    name={player.nickname ?? 'Гости без профиля'}
                    caption={[player.clientTier ? (TIER_LABEL[player.clientTier] ?? player.clientTier) : null, `${player.cnt} ${plural(player.cnt, ['чек', 'чека', 'чеков'])}`].filter(Boolean).join(' · ')}
                    value={formatMoney(player.total)}
                  />
                ))
              )}
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
