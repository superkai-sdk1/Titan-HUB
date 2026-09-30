import { Button, Form, Host, LabeledContent, Picker, Section, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { PeriodMenu, PeriodSection, RankRow, StateSection } from '@/components/analytics/native';
import { methodLook, money } from '@/components/analytics/parts';
import { ActionRow, primary, secondary } from '@/components/native-form';
import { useAnalyticsChecks, useAnalyticsPeriod, type AnalyticsCheck, type NetBreakdown } from '@/lib/analytics-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const dayTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

type Sort = 'time' | 'amount';
const PAGE = 100;

/**
 * Чеки периода: итог «от валовой выручки к чистой прибыли» (себестоимость и расходы — только
 * владельцу), фильтр по способу оплаты, сортировка и список закрытых чеков порциями;
 * тап открывает состав чека.
 */
export default function AnalyticsChecksScreen() {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const period = useAnalyticsPeriod();
  const checks = useAnalyticsChecks(period.from, period.to);
  const [method, setMethod] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('time');
  const [limit, setLimit] = useState(PAGE);

  const all = checks.data?.checks ?? [];
  const methods = [...new Set(all.flatMap((c) => c.payments.map((p) => p.method)))];
  const filtered = (method === 'all' ? all : method === 'event' ? all.filter((c) => c.linkedEventId) : all.filter((c) => c.payments.some((p) => p.method === method)))
    .slice()
    .sort((a, b) => (sort === 'amount' ? b.totalAmount - a.totalAmount : Date.parse(b.closedAt ?? b.createdAt) - Date.parse(a.closedAt ?? a.createdAt)));
  const shown = filtered.slice(0, limit);
  const filteredTotal = filtered.reduce((s, c) => s + c.totalAmount, 0);

  return (
    <>
      <Stack.Title>Чеки</Stack.Title>
      <PeriodMenu period={period} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await checks.refetch()))]}>
          <PeriodSection period={period} />
          {!checks.data ? (
            <StateSection error={checks.error} />
          ) : (
            <>
              <Summary summary={checks.data.summary} isOwner={isOwner} />

              <Section>
                <Picker
                  label="Оплата"
                  selection={method}
                  onSelectionChange={(value) => {
                    haptic.selection();
                    setMethod(String(value));
                    setLimit(PAGE);
                  }}
                  modifiers={[pickerStyle('menu')]}>
                  <Text modifiers={[tag('all')]}>Все чеки</Text>
                  {methods.map((m) => (
                    <Text key={m} modifiers={[tag(m)]}>
                      {methodLook(m).title}
                    </Text>
                  ))}
                  <Text modifiers={[tag('event')]}>Мероприятия</Text>
                </Picker>
                <Picker selection={sort} onSelectionChange={(value) => setSort(value as Sort)} modifiers={[pickerStyle('segmented')]}>
                  <Text modifiers={[tag('time')]}>Сначала новые</Text>
                  <Text modifiers={[tag('amount')]}>Сначала крупные</Text>
                </Picker>
              </Section>

              <Section
                title={`${filtered.length} ${plural(filtered.length, ['чек', 'чека', 'чеков'])} · ${money(filteredTotal)}`}
                footer={all.length >= 1000 ? <Text>Показаны первые 1000 чеков периода — сузьте период, чтобы увидеть остальные.</Text> : undefined}>
                {shown.length === 0 ? (
                  <Text modifiers={[secondary]}>{all.length === 0 ? 'За период закрытых чеков нет' : 'Таких чеков нет'}</Text>
                ) : (
                  shown.map((check) => <CheckRow key={check.id} check={check} multiDay={period.days > 1} onPress={() => router.push({ pathname: '/analytics/check/[checkId]', params: { checkId: check.id } })} />)
                )}
                {filtered.length > shown.length && <ActionRow title={`Показать ещё ${Math.min(PAGE, filtered.length - shown.length)}`} icon="arrow.down.circle" onPress={() => setLimit((n) => n + PAGE)} />}
              </Section>
            </>
          )}
        </Form>
      </Host>
    </>
  );
}

function Summary({ summary, isOwner }: { summary: NetBreakdown; isOwner: boolean }) {
  const minus = (label: string, value: number) => (
    <LabeledContent key={label} label={label}>
      <Text modifiers={[secondary, monospacedDigit()]}>{`${value > 0 ? '−' : ''}${money(value)}`}</Text>
    </LabeledContent>
  );
  const net = summary.net ?? 0;
  return (
    <Section title="Итог за период" footer={<Text>{`${summary.checks} ${plural(summary.checks, ['чек', 'чека', 'чеков'])} · средний клубный ${money(Math.round(summary.avgCheck))}`}</Text>}>
      <LabeledContent label="Выручка валовая">
        <Text modifiers={[primary, monospacedDigit()]}>{money(summary.gross)}</Text>
      </LabeledContent>
      {minus('Возвраты', summary.refunds)}
      {isOwner ? (
        <>
          {minus('Эквайринг', summary.commission ?? 0)}
          {minus('Себестоимость', summary.cogs ?? 0)}
          {minus('Расходы', summary.opex ?? 0)}
          {minus('Зарплата', summary.salary ?? 0)}
          <LabeledContent label="Чистая прибыль">
            <Text modifiers={[font({ weight: 'bold' }), foregroundStyle(net >= 0 ? colors.green : colors.red), monospacedDigit()]}>{money(net)}</Text>
          </LabeledContent>
        </>
      ) : (
        <LabeledContent label="Выручка после возвратов">
          <Text modifiers={[font({ weight: 'bold' }), primary, monospacedDigit()]}>{money(summary.revenueNet)}</Text>
        </LabeledContent>
      )}
    </Section>
  );
}

function CheckRow({ check, multiDay, onPress }: { check: AnalyticsCheck; multiDay: boolean; onPress: () => void }) {
  const when = check.closedAt ?? check.createdAt;
  const paid = check.payments.map((p) => methodLook(p.method).title).join(' + ');
  return (
    <Button
      onPress={() => {
        haptic.selection();
        onPress();
      }}>
      <RankRow
        name={check.guestName ?? 'Гость'}
        caption={[(multiDay ? dayTime : time).format(new Date(when)), `${check.itemCount} поз.`, paid, check.linkedEventId ? 'мероприятие' : null, check.staffNickname].filter(Boolean).join(' · ')}
        value={money(check.totalAmount)}
      />
    </Button>
  );
}
