import { ContentUnavailableView, Form, Host, HStack, Image, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, lineLimit, monospacedDigit, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import { ActionRow, footnote, primary, secondary } from '@/components/native-form';
import { audienceLabel, useBroadcasts, type BroadcastRow } from '@/lib/broadcasts-api';
import { useClientTiers } from '@/lib/clients-api';

const when = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** «push 12 · Telegram 30» — сколько сообщений приняли каналы. */
function deliveryText(b: BroadcastRow): string {
  const parts = [`${b.recipientsCount} получ.`];
  if (b.channels.push) parts.push(`push ${b.pushCount}`);
  if (b.channels.telegram) parts.push(`Telegram ${b.telegramCount}`);
  return parts.join(' · ');
}

/** Рассылки клиентам: новая рассылка и журнал отправленных. */
export default function BroadcastsScreen() {
  const router = useRouter();
  const list = useBroadcasts();
  const tiers = useClientTiers();
  const rows = list.data ?? [];

  return (
    <>
      <Stack.Title>Рассылки</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await list.refetch()))]}>
          <Section footer={<Text>Сообщение появится во «Входящих» приложения My Titan, придёт push на телефон, по желанию — и от бота My Titan в Telegram.</Text>}>
            <ActionRow title="Новая рассылка" icon="square.and.pencil" onPress={() => router.push('/manage/broadcasts/compose')} />
          </Section>

          <Section title="Отправленные">
            {list.isLoading ? (
              <ProgressView />
            ) : list.isError ? (
              <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={list.error.message} />
            ) : rows.length === 0 ? (
              <ContentUnavailableView title="Рассылок пока не было" systemImage="megaphone" description="Отправленные сообщения появятся здесь." />
            ) : (
              rows.map((b) => (
                <VStack key={b.id} alignment="leading" spacing={3}>
                  <HStack spacing={8}>
                    <Text modifiers={[primary, font({ weight: 'semibold' }), lineLimit(1)]}>{b.title}</Text>
                    <Spacer />
                    <Text modifiers={[footnote, secondary, monospacedDigit()]}>{when.format(new Date(b.createdAt))}</Text>
                  </HStack>
                  <Text modifiers={[font({ textStyle: 'subheadline' }), secondary, lineLimit(3)]}>{b.body}</Text>
                  <HStack spacing={5}>
                    <Image systemName="person.2" size={11} modifiers={[secondary]} />
                    <Text modifiers={[footnote, secondary, lineLimit(2)]}>
                      {`${audienceLabel(b.audience, tiers.data)} · ${deliveryText(b)}${b.sentBy ? ` · ${b.sentBy}` : ''}`}
                    </Text>
                  </HStack>
                </VStack>
              ))
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}
