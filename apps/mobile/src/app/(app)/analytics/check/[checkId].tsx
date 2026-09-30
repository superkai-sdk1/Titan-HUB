import { ContentUnavailableView, Form, HStack, Host, LabeledContent, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { LegendRow } from '@/components/analytics/native';
import { methodLook, money } from '@/components/analytics/parts';
import { ActionRow, primary, secondary } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { analyticsErrorText, useAnalyticsCheck } from '@/lib/analytics-api';
import { REFUND_REASONS, type RefundReason } from '@/lib/refunds-api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const when = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Состав чека из аналитики: позиции, скидки, оплата, возвраты; владельцу — себестоимость и маржа. */
export default function AnalyticsCheckSheet() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const detail = useAnalyticsCheck(checkId);
  const data = detail.data;

  const done = (
    <Stack.Toolbar placement="right">
      <ToolbarButton variant="done" onPress={() => router.back()}>
        Готово
      </ToolbarButton>
    </Stack.Toolbar>
  );

  if (!data) {
    return (
      <>
        {done}
        <Host style={{ flex: 1 }} useViewportSizeMeasurement>
          {detail.error ? <ContentUnavailableView title="Чек не загрузился" systemImage="receipt" description={analyticsErrorText(detail.error)} /> : <ProgressView />}
        </Host>
      </>
    );
  }

  const badges = [
    data.check.status !== 'closed' ? (data.check.status === 'open' ? 'открыт' : 'отменён') : null,
    data.staffComp ? 'списание на персонал' : null,
    data.refunds.length > 0 ? 'был возврат' : null,
  ].filter(Boolean);
  const adjustments: { label: string; value: number }[] = [
    ...data.discounts.map((d) => ({ label: `${d.name}${d.type === 'percent' ? ` · ${d.value}%` : ''}`, value: -d.amount })),
    ...((data.check.eventBaseAmount ?? 0) > 0 ? [{ label: 'Мероприятие', value: data.check.eventBaseAmount ?? 0 }] : []),
    ...(data.check.bonusUsed > 0 ? [{ label: 'Бонусы', value: -data.check.bonusUsed }] : []),
    ...(data.check.certificateUsed > 0 ? [{ label: 'Сертификат', value: -data.check.certificateUsed }] : []),
    ...(data.check.tipAmount > 0 ? [{ label: 'Чаевые (СБП)', value: data.check.tipAmount }] : []),
  ];

  return (
    <>
      {done}
      <Stack.Title>Чек</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section>
            <VStack alignment="leading" spacing={3}>
              <Text modifiers={[font({ size: 36, weight: 'bold', design: 'rounded' }), primary, monospacedDigit()]}>{money(data.check.totalAmount)}</Text>
              <Text modifiers={[secondary]}>{when.format(new Date(data.check.closedAt ?? data.check.createdAt))}</Text>
              <Text modifiers={[primary, lineLimit(1)]}>
                {[data.player?.nickname ?? data.guestName ?? 'Гость', data.staff ? `кассир ${data.staff.nickname}` : null].filter(Boolean).join(' · ')}
              </Text>
              {badges.length > 0 ? <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle(colors.orange)]}>{badges.join(' · ')}</Text> : null}
            </VStack>
          </Section>

          <Section title="Позиции">
            {data.items.length === 0 ? (
              <Text modifiers={[secondary]}>Позиций нет</Text>
            ) : (
              data.items.map((item) => (
                <HStack key={item.id} spacing={10}>
                  <VStack alignment="leading" spacing={1}>
                    <Text modifiers={[primary, lineLimit(2)]}>{item.name ?? 'Позиция'}</Text>
                    <Text modifiers={[font({ textStyle: 'footnote' }), secondary]}>
                      {`${item.quantity} × ${money(item.priceAtTime)}${isOwner && item.lineCost > 0 ? ` · себестоимость ${money(item.lineCost)}` : ''}`}
                    </Text>
                  </VStack>
                  <Spacer />
                  <Text modifiers={[primary, monospacedDigit()]}>{money(item.lineTotal)}</Text>
                </HStack>
              ))
            )}
          </Section>

          {adjustments.length > 0 && (
            <Section title="Скидки и доплаты">
              {adjustments.map((a) => (
                <LabeledContent key={a.label} label={a.label}>
                  <Text modifiers={[a.value < 0 ? foregroundStyle(colors.red) : primary, monospacedDigit()]}>{money(a.value)}</Text>
                </LabeledContent>
              ))}
            </Section>
          )}

          {data.payments.length > 0 && (
            <Section title="Как оплачено">
              {data.payments.map((p, index) => {
                const look = methodLook(p.method);
                return <LegendRow key={`${p.method}-${index}`} color={look.color} label={look.title} value={money(p.amount)} />;
              })}
            </Section>
          )}

          {data.refunds.length > 0 && (
            <Section title="Возвраты">
              {data.refunds.map((r) => (
                <LegendRow
                  key={r.id}
                  color={colors.red}
                  label={REFUND_REASONS[r.reason as RefundReason] ?? r.reason}
                  caption={[when.format(new Date(r.createdAt)), r.tenders?.map((t) => `${methodLook(t.method).title} ${money(t.amount)}`).join(', ')].filter(Boolean).join(' · ')}
                  value={money(-r.totalAmount)}
                />
              ))}
            </Section>
          )}

          {isOwner && data.costTotal > 0 && (
            <Section title="Для владельца">
              <LabeledContent label="Себестоимость">
                <Text modifiers={[secondary, monospacedDigit()]}>{money(data.costTotal)}</Text>
              </LabeledContent>
              <LabeledContent label="Маржа">
                <Text modifiers={[font({ weight: 'semibold' }), primary, monospacedDigit()]}>{money(data.retailTotal - data.costTotal)}</Text>
              </LabeledContent>
            </Section>
          )}

          <Section>
            <ActionRow
              title="Открыть чек в кассе"
              icon="receipt"
              onPress={() => {
                router.back();
                setTimeout(() => router.push({ pathname: '/pos/[checkId]', params: { checkId: data.check.id } }), 380);
              }}
            />
          </Section>
        </Form>
      </Host>
    </>
  );
}
