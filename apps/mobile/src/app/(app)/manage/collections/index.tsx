import { ContentUnavailableView, Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import { ActionRow, LinkRow } from '@/components/native-form';
import { useCollections, type CollectionListItem } from '@/lib/collections-api';
import { formatMoney, plural } from '@/lib/format';

/**
 * Сборы клуба: ежемесячный «Фонд клуба» и разовые сборы. Строка показывает текущий
 * период, сколько собрано и сколько участников уже заплатили.
 */
export default function CollectionsScreen() {
  const router = useRouter();
  const collections = useCollections();
  const list = collections.data?.collections ?? [];
  const recurring = list.filter((c) => c.kind === 'recurring');
  const oneoff = list.filter((c) => c.kind !== 'recurring');

  const row = (item: CollectionListItem) => (
    <LinkRow
      key={item.id}
      icon={item.kind === 'recurring' ? 'building.columns.fill' : 'gift.fill'}
      color={item.kind === 'recurring' ? '#34C759' : '#007AFF'}
      title={item.name}
      subtitle={[
        item.period?.label ?? 'период ещё не открыт',
        `оплатили ${item.paidCount} из ${item.expectedCount}`,
        item.isMandatory ? 'обязательный' : 'добровольный',
      ].join(' · ')}
      value={formatMoney(item.collected, { kopecks: 'auto' })}
      onPress={() => router.push({ pathname: '/manage/collections/[collectionId]', params: { collectionId: item.id, name: item.name } })}
    />
  );

  return (
    <>
      <Stack.Title>Сбор средств</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await collections.refetch()))]}>
          {collections.isLoading ? (
            <Section>
              <ProgressView />
            </Section>
          ) : collections.isError && list.length === 0 ? (
            <Section>
              <ContentUnavailableView title="Не удалось загрузить сборы" systemImage="wifi.exclamationmark" description={collections.error.message} />
            </Section>
          ) : (
            <>
              {list.length === 0 && (
                <Section>
                  <ContentUnavailableView title="Пока нет сборов" systemImage="banknote" description="Создайте «Фонд клуба» или разовый сбор." />
                </Section>
              )}
              {recurring.length > 0 && <Section title="Ежемесячные">{recurring.map(row)}</Section>}
              {oneoff.length > 0 && <Section title="Разовые">{oneoff.map(row)}</Section>}
              <Section
                footer={
                  collections.data ? (
                    <Text>{`Участвуют резиденты, студенты и новички — ${collections.data.eligibleCount} ${plural(collections.data.eligibleCount, ['человек', 'человека', 'человек'])}. Взносы идут мимо кассы.`}</Text>
                  ) : undefined
                }>
                <ActionRow title="Новый сбор" icon="plus.circle.fill" onPress={() => router.push('/manage/collections/edit')} />
              </Section>
            </>
          )}
        </Form>
      </Host>
    </>
  );
}
