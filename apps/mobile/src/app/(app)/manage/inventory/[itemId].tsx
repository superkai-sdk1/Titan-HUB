import { Chart, ContentUnavailableView, Form, HStack, Host, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, lineLimit, monospacedDigit, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Tile } from '@/components/analytics/native';
import { footnote, LinkRow, primary, RowIcon, secondary } from '@/components/native-form';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { MOVEMENT_LOOK, STOCK_LOOK, stockLevel, thresholdOf, useInventory, useItemMovements, useItemStats, type StockMovement } from '@/lib/inventory-api';
import { colors, useAccentHex } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const movementDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const decimal = (n: number) => n.toFixed(1).replace('.', ',');

/**
 * Товар склада: остаток со статусом, себестоимость, цена и маржа, продажи за 30 дней
 * графиком, последняя закупка. Действия — списание, корректировка, точка заказа; ниже журнал.
 */
export default function InventoryItemScreen() {
  const { itemId, name } = useLocalSearchParams<{ itemId: string; name?: string }>();
  const router = useRouter();
  const accent = useAccentHex();
  const inventory = useInventory();
  const stats = useItemStats(itemId);
  const movements = useItemMovements(itemId);

  const item = inventory.data?.find((i) => i.id === itemId);
  const data = stats.data;

  if (!item || !data) {
    return (
      <>
        <Stack.Title>{name ?? 'Товар'}</Stack.Title>
        <Host style={{ flex: 1 }} useViewportSizeMeasurement>
          {stats.isError ? <ContentUnavailableView title="Товар не загрузился" systemImage="wifi.exclamationmark" description={stats.error.message} /> : <ProgressView />}
        </Host>
      </>
    );
  }

  const open = (mode: 'writeoff' | 'adjust' | 'params') => router.push({ pathname: '/manage/inventory/stock-action', params: { itemId, mode } });

  const level = stockLevel(item);
  const look = STOCK_LOOK[level];
  const cost = toNumber(item.costPrice);
  const price = toNumber(item.price);
  const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : null;
  const daysLeft = item.trackStock && data.sales.avgDaily > 0 && item.stockQuantity > 0 ? Math.floor(item.stockQuantity / data.sales.avgDaily) : null;
  const negative = item.trackStock && item.stockQuantity < 0;
  const threshold = thresholdOf(item);
  const series = data.sales.series;

  return (
    <>
      <Stack.Title>{item.name}</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([inventory.refetch(), stats.refetch(), movements.refetch()])))]}>
          <Section
            footer={
              item.trackStock ? (
                <Text>{`${look.label === 'Ок' ? 'Запаса достаточно' : `Статус: ${look.label.toLowerCase()}`}${threshold > 0 ? ` · точка заказа ${threshold} шт` : ' · точка заказа не задана'}${item.isActive ? '' : ' · скрыт из меню'}`}</Text>
              ) : (
                <Text>Остатки этого товара не учитываются — продажи не списывают его со склада.</Text>
              )
            }>
            <HStack spacing={12}>
              <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: 10_000, alignment: 'leading' })]}>
                <Text modifiers={[font({ textStyle: 'caption' }), secondary]}>Остаток</Text>
                <Text modifiers={[font({ textStyle: 'title2', weight: 'bold', design: 'rounded' }), monospacedDigit(), level === 'out' || level === 'low' ? foregroundStyle(look.color) : primary]}>
                  {item.trackStock ? `${item.stockQuantity} шт` : '—'}
                </Text>
                <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), foregroundStyle(look.color)]}>{item.trackStock ? look.label : 'Без учёта'}</Text>
              </VStack>
              <Tile label="На сумму" value={item.trackStock ? money(Math.max(0, item.stockQuantity) * cost) : '—'} caption="себестоимость" />
              <Tile label="Хватит на" value={daysLeft !== null ? `${daysLeft} ${plural(daysLeft, ['день', 'дня', 'дней'])}` : '—'} caption={daysLeft !== null ? 'по продажам' : 'нет продаж'} />
            </HStack>
          </Section>

          {negative && (
            <Section>
              <HStack spacing={12}>
                <RowIcon name="exclamationmark.triangle.fill" color={colors.red} />
                <Text modifiers={[footnote, primary]}>Остаток ушёл в минус из-за продаж. Сведите его ревизией или установите точный остаток — списание при минусе исказит журнал.</Text>
              </HStack>
            </Section>
          )}

          <Section title="Цена">
            <HStack spacing={12}>
              <Tile label="Себестоимость" value={money(cost)} />
              <Tile label="Цена в меню" value={money(price)} />
              <Tile label="Маржа" value={margin === null ? '—' : `${margin}%`} caption={margin === null ? undefined : money(price - cost)} />
            </HStack>
          </Section>

          {item.trackStock && (
            <Section title="Остаток" footer={<Text>Когда остаток дойдёт до точки заказа, товар попадёт в «Заканчивается» и сотрудникам придёт уведомление.</Text>}>
              {!negative && <LinkRow icon="trash.fill" color="#F43F5E" title="Списать" subtitle="Бой, порча, угощение" onPress={() => open('writeoff')} />}
              <LinkRow
                icon="slider.horizontal.3"
                color="#8B5CF6"
                title={negative ? 'Установить точный остаток' : 'Корректировка'}
                subtitle={negative ? 'Свести минус к факту' : 'Добавить, убрать или задать точно'}
                onPress={() => open('adjust')}
              />
              <LinkRow
                icon="bell.badge.fill"
                color="#F59E0B"
                title="Точка заказа"
                value={[threshold > 0 ? `≤ ${threshold}` : null, item.parLevel ? `до ${item.parLevel}` : null].filter(Boolean).join(' · ') || 'не задано'}
                onPress={() => open('params')}
              />
            </Section>
          )}

          <Section
            title="Продажи · 30 дней"
            footer={<Text>{`Выручка ${money(data.sales.totalRevenue)} · всего продано ${data.sales.allTimeQty} шт. По оси — дней назад, 0 — сегодня.`}</Text>}>
            <HStack spacing={12}>
              <Tile label="Продано" value={`${data.sales.totalQty} шт`} />
              <Tile label="В среднем" value={`${decimal(data.sales.avgDaily)} шт`} caption="в день" />
            </HStack>
            {series.length > 0 && (
              <Chart
                type="bar"
                animate
                showGrid={false}
                // Числовая ось «дней назад» — подписи не слипаются, как у 30 категорий-дат.
                data={series.map((point, index) => ({ x: index - (series.length - 1), y: point.qty, color: accent }))}
                barStyle={{ cornerRadius: 3 }}
                modifiers={[frame({ height: 150 })]}
              />
            )}
          </Section>

          <Section title="Последняя закупка">
            <LinkRow
              icon="shippingbox.fill"
              color="#10B981"
              title={data.lastSupply ? longDate.format(new Date(data.lastSupply.date)) : 'Закупок не было'}
              subtitle={data.lastSupply ? `${data.lastSupply.quantity} шт по ${money(data.lastSupply.costPerUnit)}` : undefined}
              value={data.lastSupply ? money(data.lastSupply.quantity * data.lastSupply.costPerUnit) : undefined}
            />
          </Section>

          <Section title="Движения склада">
            {movements.isLoading ? (
              <ProgressView />
            ) : !movements.data?.length ? (
              <Text modifiers={[secondary]}>Движений пока нет</Text>
            ) : (
              movements.data.map((m) => <MovementLine key={m.id} movement={m} />)
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}

/** Строка журнала: тип значком, причина и автор, изменение и остаток после. */
function MovementLine({ movement: m }: { movement: StockMovement }) {
  const look = MOVEMENT_LOOK[m.type];
  return (
    <HStack spacing={12}>
      <RowIcon name={look.symbol} color={look.color} />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[primary, lineLimit(2)]}>{m.reason && !m.reason.startsWith(look.label) ? `${look.label} · ${m.reason}` : (m.reason ?? look.label)}</Text>
        <Text modifiers={[footnote, secondary, lineLimit(1)]}>{[movementDate.format(new Date(m.createdAt)), m.author].filter(Boolean).join(' · ')}</Text>
      </VStack>
      <Spacer />
      <VStack alignment="trailing" spacing={1}>
        <Text modifiers={[font({ weight: 'semibold' }), monospacedDigit(), foregroundStyle(m.delta > 0 ? colors.green : colors.red)]}>{m.delta > 0 ? `+${m.delta}` : `−${Math.abs(m.delta)}`}</Text>
        <Text modifiers={[footnote, secondary, monospacedDigit()]}>{`→ ${m.qtyAfter}`}</Text>
      </VStack>
    </HStack>
  );
}
