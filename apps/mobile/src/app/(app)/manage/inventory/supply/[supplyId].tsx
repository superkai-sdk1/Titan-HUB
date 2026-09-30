import { ContentUnavailableView, Form, HStack, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { Tile } from '@/components/analytics/native';
import { ActionRow, LinkRow } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteSupply, useSupply } from '@/lib/inventory-api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const correctionDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Проведённая закупка: итог, позиции, история корректировок; править — в шапке, удалить — внизу. */
export default function SupplyScreen() {
  const { supplyId } = useLocalSearchParams<{ supplyId: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const supply = useSupply(supplyId);
  const data = supply.data;

  if (!data) {
    return (
      <>
        <Stack.Title>Закупка</Stack.Title>
        <Host style={{ flex: 1 }} useViewportSizeMeasurement>
          {supply.isError ? <ContentUnavailableView title="Закупка не загрузилась" systemImage="wifi.exclamationmark" description={supply.error.message} /> : <ProgressView />}
        </Host>
      </>
    );
  }

  const date = new Date(data.supply.createdAt);
  const total = toNumber(data.supply.totalCost);
  const stocked = data.items.filter((l) => l.itemId).length;

  const remove = () =>
    Alert.alert('Удалить закупку?', `Закупка от ${longDate.format(date)} будет удалена, принятый остаток снимется со склада. Себестоимость не пересчитается.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteSupply(data.supply.id)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Закупка не удалена', error instanceof Error ? error.message : String(error))),
      },
    ]);

  return (
    <>
      <Stack.Title>{longDate.format(date)}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton onPress={() => router.push({ pathname: '/manage/inventory/supply-editor', params: { supplyId: data.supply.id } })}>Править</ToolbarButton>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await supply.refetch()))]}>
          <Section footer={<Text>{[`Проведена в ${time.format(date)}`, data.supply.supplier ? `поставщик ${data.supply.supplier}` : null, data.supply.note].filter(Boolean).join(' · ')}</Text>}>
            <HStack spacing={12}>
              <Tile label="Сумма" value={money(total)} />
              <Tile label="Позиций" value={String(data.items.length)} caption={stocked === data.items.length ? 'все со склада' : `${stocked} со склада`} />
            </HStack>
          </Section>

          <Section title="Позиции">
            {data.items.map((line, index) => (
              <LinkRow
                key={`${line.itemId ?? line.name}-${index}`}
                icon={line.itemId ? 'shippingbox.fill' : 'doc.text.fill'}
                color={line.itemId ? '#10B981' : '#8E8E93'}
                title={line.name}
                subtitle={`${String(line.quantity).replace('.', ',')} ${line.unit} × ${money(line.costPerUnit)}${line.itemId ? '' : ' · без склада'}`}
                value={money(line.quantity * line.costPerUnit)}
              />
            ))}
          </Section>

          {data.corrections.length > 0 && (
            <Section title={`Корректировки · ${data.corrections.length}`}>
              {data.corrections.map((c) => {
                const diff = c.totalAfter - c.totalBefore;
                const same = Math.abs(diff) < 0.005;
                return (
                  <LinkRow
                    key={c.id}
                    icon="pencil"
                    color="#FF9500"
                    title={c.reason}
                    subtitle={`${correctionDate.format(new Date(c.createdAt))} · было ${money(c.totalBefore)}`}
                    value={same ? '0 ₽' : formatMoney(diff, { sign: true, kopecks: 'auto' })}
                    valueColor={same ? undefined : diff > 0 ? colors.red : colors.green}
                  />
                );
              })}
            </Section>
          )}

          {isOwner && (
            <Section footer={<Text>{`Принятые ${stocked} ${plural(stocked, ['позиция', 'позиции', 'позиций'])} снимутся со склада.`}</Text>}>
              <ActionRow title="Удалить закупку" icon="trash" destructive onPress={remove} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
