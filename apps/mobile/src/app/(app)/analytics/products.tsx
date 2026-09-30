import { Chart, Form, HStack, Host, Picker, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, frame, lineLimit, monospacedDigit, pickerStyle, refreshable, shapes, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { LegendRow, PeriodMenu, PeriodSection, share, StateSection, Tile } from '@/components/analytics/native';
import { money } from '@/components/analytics/parts';
import { primary, secondary } from '@/components/native-form';
import { pct, previousPeriod, useAnalyticsPeriod, useProductsAnalytics } from '@/lib/analytics-api';
import { toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';

type Tab = 'items' | 'categories';

const ABC_COLOR = { A: '#34C759', B: '#FF9500', C: '#8E8E93' } as const;
const CATEGORY_COLORS = ['#FF9500', '#8B5CF6', '#30B0C7', '#FF2D55', '#34C759', '#5856D6', '#A2845E', '#8E8E93'];

/** Бар и товары: выручка по позициям с ABC-анализом и по категориям, сравнение с прошлым периодом. */
export default function ProductsScreen() {
  const period = useAnalyticsPeriod();
  const previous = previousPeriod(period);
  const products = useProductsAnalytics(period.from, period.to);
  const before = useProductsAnalytics(previous.from, previous.to);
  const [tab, setTab] = useState<Tab>('items');
  const data = products.data;

  const rows = (data?.products ?? []).map((p) => ({ ...p, qty: toNumber(p.totalQty), revenue: toNumber(p.totalRev) }));
  const categories = [
    ...rows
      .reduce((map, r) => {
        const key = r.category ?? 'Без категории';
        const current = map.get(key) ?? { name: key, revenue: 0, qty: 0, count: 0 };
        return map.set(key, { name: key, revenue: current.revenue + r.revenue, qty: current.qty + r.qty, count: current.count + 1 });
      }, new Map<string, { name: string; revenue: number; qty: number; count: number }>())
      .values(),
  ].sort((a, b) => b.revenue - a.revenue);
  const soldQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRev = data?.totalRev ?? 0;

  return (
    <>
      <Stack.Title>Бар и товары</Stack.Title>
      <PeriodMenu period={period} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([products.refetch(), before.refetch()])))]}>
          <PeriodSection period={period} />
          {!data ? (
            <StateSection error={products.error} />
          ) : (
            <>
              <Section>
                <HStack spacing={12}>
                  <Tile label="Выручка позиций" value={money(totalRev)} delta={before.data ? pct(totalRev, before.data.totalRev) : undefined} />
                  <Tile label="Продано штук" value={String(Math.round(soldQty))} caption={`${rows.length} позиций`} />
                </HStack>
              </Section>

              <Section>
                <Picker
                  selection={tab}
                  onSelectionChange={(value) => {
                    haptic.selection();
                    setTab(value as Tab);
                  }}
                  modifiers={[pickerStyle('segmented')]}>
                  <Text modifiers={[tag('items')]}>Позиции</Text>
                  <Text modifiers={[tag('categories')]}>Категории</Text>
                </Picker>
              </Section>

              {rows.length === 0 ? (
                <Section>
                  <Text modifiers={[secondary]}>За период продаж не было</Text>
                </Section>
              ) : tab === 'items' ? (
                <Section title="ABC-анализ" footer={<Text>A — позиции, дающие 80% выручки, B — ещё 15%, C — остальные. Считается по 50 самым продаваемым позициям.</Text>}>
                  {rows.map((row) => (
                    <HStack key={row.itemId} spacing={12}>
                      <Text
                        modifiers={[
                          font({ textStyle: 'caption', weight: 'heavy' }),
                          foregroundStyle(ABC_COLOR[row.abc]),
                          frame({ width: 26, height: 26 }),
                          background(`${ABC_COLOR[row.abc]}26`, shapes.roundedRectangle({ cornerRadius: 7 })),
                        ]}>
                        {row.abc}
                      </Text>
                      <VStack alignment="leading" spacing={1}>
                        <Text modifiers={[primary, lineLimit(1)]}>{row.name ?? 'Позиция'}</Text>
                        <Text modifiers={[font({ textStyle: 'footnote' }), secondary, lineLimit(1)]}>
                          {`${Math.round(row.qty)} шт · ${String(row.share).replace('.', ',')}%${row.category ? ` · ${row.category}` : ''}`}
                        </Text>
                      </VStack>
                      <Spacer />
                      <Text modifiers={[primary, monospacedDigit()]}>{money(row.revenue)}</Text>
                    </HStack>
                  ))}
                </Section>
              ) : (
                <Section title="По категориям">
                  <Chart
                    type="pie"
                    animate
                    data={categories.map((c, index) => ({ x: c.name, y: c.revenue, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }))}
                    pieStyle={{ innerRadius: 0.62, angularInset: 1.5 }}
                    modifiers={[frame({ height: 180 })]}
                  />
                  {categories.map((c, index) => (
                    <LegendRow
                      key={c.name}
                      color={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      label={c.name}
                      caption={`${Math.round(c.qty)} шт · ${c.count} поз.`}
                      value={money(Math.round(c.revenue))}
                      percent={share(c.revenue, totalRev)}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </Form>
      </Host>
    </>
  );
}
