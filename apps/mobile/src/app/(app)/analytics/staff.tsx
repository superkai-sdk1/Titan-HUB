import { Button, ContentUnavailableView, Form, HStack, Host, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import { PeriodMenu, PeriodSection, RankRow, StateSection, Tile } from '@/components/analytics/native';
import { money } from '@/components/analytics/parts';
import { useAnalyticsPeriod, useStaffComp } from '@/lib/analytics-api';
import { plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';

const when = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Списания на персонал (только владелец): по цене меню и по себестоимости, по сотрудникам и списком. */
export default function StaffAnalyticsScreen() {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const period = useAnalyticsPeriod();
  const staff = useStaffComp(period.from, period.to, isOwner);
  const data = staff.data;

  if (!isOwner) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ContentUnavailableView title="Только для владельца" systemImage="lock" description="Отчёт по персоналу видит только владелец клуба." />
      </Host>
    );
  }

  // Сервер склеивает количество строками («032») — считаем сами.
  const checks = (data?.staff ?? []).reduce((sum, s) => sum + toNumber(s.checksCount), 0);

  return (
    <>
      <Stack.Title>Персонал</Stack.Title>
      <PeriodMenu period={period} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await staff.refetch()))]}>
          <PeriodSection period={period} />
          {!data ? (
            <StateSection error={staff.error} />
          ) : (
            <>
              <Section footer={<Text>Себестоимость — реальные затраты клуба на то, что съели и выпили сотрудники.</Text>}>
                <HStack spacing={12}>
                  <Tile label="По цене меню" value={money(data.totals.retail)} caption={`${checks} ${plural(checks, ['списание', 'списания', 'списаний'])}`} />
                  <Tile label="Себестоимость" value={money(data.totals.cost)} />
                </HStack>
              </Section>

              {data.staff.length === 0 ? (
                <Section>
                  <Text>За период списаний на персонал не было</Text>
                </Section>
              ) : (
                <>
                  <Section title="По сотрудникам">
                    {data.staff.map((s) => (
                      <RankRow
                        key={s.staffId}
                        photo={{ name: s.nickname, url: s.photoUrl }}
                        name={s.nickname}
                        caption={`${toNumber(s.checksCount)} ${plural(toNumber(s.checksCount), ['чек', 'чека', 'чеков'])} · по меню ${money(s.retail)}`}
                        value={money(s.cost)}
                      />
                    ))}
                  </Section>

                  <Section title="Списания">
                    {data.transactions.map((t) => (
                      <Button
                        key={t.id}
                        onPress={() => {
                          haptic.selection();
                          router.push({ pathname: '/analytics/check/[checkId]', params: { checkId: t.id } });
                        }}>
                        <RankRow name={t.nickname} caption={`${when.format(new Date(t.createdAt))} · по меню ${money(t.retail)}`} value={money(t.cost)} />
                      </Button>
                    ))}
                  </Section>
                </>
              )}
            </>
          )}
        </Form>
      </Host>
    </>
  );
}
