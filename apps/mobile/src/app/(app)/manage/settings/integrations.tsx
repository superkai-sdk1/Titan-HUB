import { ContentUnavailableView, Form, HStack, Host, Image, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, lineLimit, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';

import { primary, secondary } from '@/components/native-form';
import { useIntegrations } from '@/lib/admin-api';
import { colors } from '@/lib/theme';

/** Интеграции клуба: что подключено. Ключи вводятся в веб-панели — там их безопаснее хранить. */
export default function IntegrationsScreen() {
  const integrations = useIntegrations(true);
  const items = integrations.data ?? [];
  const on = items.filter((item) => item.configured);
  const off = items.filter((item) => !item.configured);

  if (!integrations.data) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {integrations.isError ? (
          <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={integrations.error.message} />
        ) : (
          <ProgressView />
        )}
      </Host>
    );
  }

  const row = (item: (typeof items)[number]) => (
    <HStack key={item.key} spacing={12}>
      <Image systemName={item.configured ? 'checkmark.circle.fill' : 'circle.dashed'} size={20} color={item.configured ? colors.green : colors.tertiaryLabel} />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[primary]}>{item.label}</Text>
        {item.masked ? <Text modifiers={[font({ textStyle: 'footnote' }), secondary, lineLimit(1)]}>{item.masked}</Text> : null}
      </VStack>
      <Spacer />
    </HStack>
  );

  return (
    <>
      <Stack.Title>Интеграции</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await integrations.refetch()))]}>
          {on.length > 0 && <Section title="Подключено">{on.map(row)}</Section>}
          {off.length > 0 && (
            <Section title="Не настроено" footer={<Text>Ключи вводятся в веб-панели: «Управление» → «Настройки» → «Интеграции».</Text>}>
              {off.map(row)}
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
