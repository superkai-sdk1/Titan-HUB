import { Button, ContentUnavailableView, ProgressView, Section, SwipeActions, Text } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { ActionRow, LinkRow } from '@/components/native-form';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteSupply, useSupplies, type SupplyListItem } from '@/lib/inventory-api';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const positions = (n: number) => `${n} ${plural(n, ['позиция', 'позиции', 'позиций'])}`;

/** Закупки: черновики отдельно (продолжить или смахнуть), ниже проведённые — дата, позиции, сумма. */
export function SuppliesTab() {
  const router = useRouter();
  const supplies = useSupplies();
  const list = supplies.data ?? [];
  const drafts = list.filter((s) => s.status === 'draft');
  const posted = list.filter((s) => s.status !== 'draft');

  const removeDraft = (supply: SupplyListItem) =>
    Alert.alert('Удалить черновик закупки?', `${positions(supply.items.length)} — склад не изменится.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteSupply(supply.id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Черновик не удалён', error instanceof Error ? error.message : String(error))),
      },
    ]);

  const caption = (supply: SupplyListItem) =>
    [timeFormat.format(new Date(supply.createdAt)), positions(supply.items.length), supply.supplier].filter(Boolean).join(' · ');

  return (
    <>
      <Section footer={<Text>Товары склада придут в остаток, себестоимость пересчитается по средней.</Text>}>
        <ActionRow title="Новая закупка" icon="shippingbox" onPress={() => router.push('/manage/inventory/supply-editor')} />
      </Section>

      {drafts.length > 0 && (
        <Section title={`Черновики · ${drafts.length}`} footer={<Text>Смахните влево, чтобы удалить черновик.</Text>}>
          {drafts.map((supply) => (
            <SwipeActions key={supply.id}>
              <LinkRow
                icon="pencil"
                color="#8B5CF6"
                title={dateFormat.format(new Date(supply.createdAt))}
                subtitle={`${caption(supply)} · продолжить`}
                value={formatMoney(
                  supply.items.reduce((sum, l) => sum + l.quantity * l.costPerUnit, 0),
                  { kopecks: 'auto' },
                )}
                onPress={() => router.push({ pathname: '/manage/inventory/supply-editor', params: { draftId: supply.id } })}
              />
              <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
                <Button role="destructive" label="Удалить" systemImage="trash" onPress={() => removeDraft(supply)} />
              </SwipeActions.Actions>
            </SwipeActions>
          ))}
        </Section>
      )}

      <Section title={posted.length ? `Проведённые · ${posted.length}` : undefined}>
        {supplies.isLoading ? (
          <ProgressView />
        ) : supplies.isError && list.length === 0 ? (
          <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={supplies.error.message} />
        ) : posted.length === 0 ? (
          <ContentUnavailableView title="Закупок пока не было" systemImage="shippingbox" description="Проведите первую — остатки и себестоимость обновятся сами." />
        ) : (
          posted.map((supply) => (
            <LinkRow
              key={supply.id}
              icon="shippingbox.fill"
              color="#10B981"
              title={dateFormat.format(new Date(supply.createdAt))}
              subtitle={caption(supply)}
              value={formatMoney(toNumber(supply.totalCost), { kopecks: 'auto' })}
              onPress={() => router.push({ pathname: '/manage/inventory/supply/[supplyId]', params: { supplyId: supply.id } })}
            />
          ))
        )}
      </Section>
    </>
  );
}
