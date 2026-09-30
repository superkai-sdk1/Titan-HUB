import { Button, Chart, Form, HStack, Host, LabeledContent, Section, Text } from '@expo/ui/swift-ui';
import { frame, monospacedDigit, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';

import { LegendRow, PeriodMenu, PeriodSection, RankRow, share, StateSection, Tile } from '@/components/analytics/native';
import { money } from '@/components/analytics/parts';
import { LinkRow, primary } from '@/components/native-form';
import { useAnalyticsPeriod, useClientsAnalytics, type SegmentKey } from '@/lib/analytics-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const SEGMENTS: { key: SegmentKey; title: string; subtitle: string; icon: SFSymbol; color: string }[] = [
  { key: 'new', title: 'Новые', subtitle: 'Зарегистрированы, но ещё без визитов', icon: 'sparkles', color: '#007AFF' },
  { key: 'active', title: 'Активные', subtitle: 'Приходили за последние 14 дней', icon: 'flame.fill', color: '#34C759' },
  { key: 'sleeping', title: 'Спящие', subtitle: 'Не приходили 14 дней и дольше', icon: 'moon.zzz.fill', color: '#8E8E93' },
];

/** Игроки: база, новые за период, удержание, сегменты, статусы и топ гостей по тратам. */
export default function PlayersScreen() {
  const router = useRouter();
  const period = useAnalyticsPeriod();
  const clients = useClientsAnalytics(period.from, period.to);
  const tiers = useClientTiers();
  const data = clients.data;

  const tierRows = [...(data?.tierDist ?? [])].sort((a, b) => b.count - a.count).map((t) => ({ ...t, look: tierLook(t.tier, tiers.data) }));
  const tierTotal = tierRows.reduce((s, t) => s + t.count, 0);

  return (
    <>
      <Stack.Title>Игроки</Stack.Title>
      <PeriodMenu period={period} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await clients.refetch()))]}>
          <PeriodSection period={period} />
          {!data ? (
            <StateSection error={clients.error} />
          ) : (
            <>
              <Section footer={<Text>Удержание — доля гостей, вернувшихся в течение 14 дней.</Text>}>
                <HStack spacing={12}>
                  <Tile label="Всего игроков" value={String(data.total)} caption={`новых за период: ${data.newThisPeriod}`} />
                  <Tile label="Удержание" value={`${Math.round(data.retentionRate)}%`} caption="за 14 дней" />
                </HStack>
              </Section>

              <Section title="Сегменты · 90 дней" footer={<Text>Нажмите на сегмент — откроется список игроков, например чтобы пригласить спящих.</Text>}>
                {SEGMENTS.map((s) => (
                  <LinkRow
                    key={s.key}
                    icon={s.icon}
                    color={s.color}
                    title={s.title}
                    subtitle={s.subtitle}
                    value={String(data.segments[s.key])}
                    onPress={() => router.push({ pathname: '/analytics/segment', params: { segment: s.key } })}
                  />
                ))}
              </Section>

              {tierRows.length > 0 && (
                <Section title="Статусы">
                  <Chart
                    type="bar"
                    animate
                    data={tierRows.map((t) => ({ x: t.look.label, y: t.count, color: t.look.color }))}
                    barStyle={{ cornerRadius: 4 }}
                    modifiers={[frame({ height: 150 })]}
                  />
                  {tierRows.map((t) => (
                    <LegendRow key={t.tier} color={t.look.color} label={t.look.label} value={String(t.count)} percent={share(t.count, tierTotal)} />
                  ))}
                </Section>
              )}

              <Section title="Топ гостей за период">
                {data.topSpenders.length === 0 ? (
                  <Text modifiers={[primary]}>За период гостей с профилем не было</Text>
                ) : (
                  data.topSpenders.map((p, index) => {
                    const look = tierLook(p.clientTier ?? 'guest', tiers.data);
                    return (
                      <Button
                        key={p.playerId}
                        onPress={() => {
                          haptic.selection();
                          router.push({ pathname: '/analytics/player/[playerId]', params: { playerId: p.playerId, ...(p.photoUrl ? { photo: p.photoUrl } : {}) } });
                        }}>
                        <RankRow
                          rank={index + 1}
                          photo={{ name: p.nickname ?? '··', url: p.photoUrl }}
                          name={p.nickname ?? 'Игрок'}
                          caption={`${look.label} · ${p.visits} ${plural(p.visits, ['чек', 'чека', 'чеков'])}${p.refundsTotal > 0 ? ` · возвраты ${money(p.refundsTotal)}` : ''}`}
                          value={money(p.total)}
                        />
                      </Button>
                    );
                  })
                )}
              </Section>

              <Section footer={<Text>Чеки, где не выбран игрок.</Text>}>
                <LabeledContent label={`Гости без профиля · ${data.guestSales.visits} ${plural(data.guestSales.visits, ['чек', 'чека', 'чеков'])}`}>
                  <Text modifiers={[primary, monospacedDigit()]}>{money(data.guestSales.total)}</Text>
                </LabeledContent>
              </Section>
            </>
          )}
        </Form>
      </Host>
    </>
  );
}
