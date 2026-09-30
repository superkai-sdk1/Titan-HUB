import { Form, HStack, Host, ProgressView, RNHostView, Section, Spacer, Text } from '@expo/ui/swift-ui';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, View } from 'react-native';

import { ActionRow, LinkRow } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { unlinkClientTg, useClient, useClientTelegramLink, useClientTgAccounts } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Привязка Telegram клиента: гость сканирует QR или открывает ссылку, бот кошелька
 * связывает свой аккаунт с профилем. Ссылка подписанная и живёт 15 минут.
 */
export default function ClientTelegramSheet() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const client = useClient(clientId);
  const accounts = useClientTgAccounts(clientId);
  const invite = useClientTelegramLink(clientId);
  const [busy, setBusy] = useState(false);

  const link = invite.data ?? null;
  const failed = invite.error ? errorText(invite.error) : null;
  const linked = accounts.data ?? [];

  const unlink = (tgId: string, username: string | null) =>
    Alert.alert(`Отвязать ${username ? `@${username}` : 'Telegram'}?`, 'Клиент перестанет получать уведомления и лишится доступа в Titan Resident с этого аккаунта.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отвязать',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          unlinkClientTg(clientId, tgId)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Не отвязано', errorText(error)))
            .finally(() => setBusy(false));
        },
      },
    ]);

  return (
    <>
      <Stack.Title>Telegram клиента</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="done" onPress={() => router.back()}>
          Готово
        </ToolbarButton>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section footer={<Text>{`Покажите ${client.data?.nickname ?? 'гостю'} этот код — он откроет бота и привяжет свой Telegram. Код действует 15 минут.`}</Text>}>
            <HStack>
              <Spacer />
              <RNHostView matchContents>
                <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: 16 }}>
                  {link ? (
                    <Image source={{ uri: link.qrDataUrl }} style={{ width: 200, height: 200 }} contentFit="contain" transition={160} accessibilityLabel="QR-код привязки" />
                  ) : failed ? null : (
                    <ActivityIndicator />
                  )}
                </View>
              </RNHostView>
              <Spacer />
            </HStack>
            {failed ? <Text>{failed}</Text> : null}
            <ActionRow title="Открыть в Telegram" icon="paperplane" disabled={!link} onPress={() => link && void Linking.openURL(link.deepLink).catch(() => Alert.alert('Не удалось открыть Telegram'))} />
            <ActionRow title="Поделиться ссылкой" icon="square.and.arrow.up" disabled={!link} onPress={() => link && void Share.share({ message: link.deepLink })} />
          </Section>

          <Section footer={<Text>Гость уже писал в чат клуба — привяжите его без QR-кода.</Text>}>
            <LinkRow icon="person.2.fill" color="#32ADE6" title="Выбрать из чата клуба" onPress={() => router.push({ pathname: '/manage/clients/tg-roster', params: { clientId } })} />
          </Section>

          <Section title="Привязанные аккаунты">
            {accounts.isLoading ? (
              <ProgressView />
            ) : linked.length === 0 ? (
              <Text>Пока ни один Telegram не привязан.</Text>
            ) : (
              linked.map((account) => (
                <LinkRow
                  key={account.tgId}
                  icon="checkmark.circle.fill"
                  color="#34C759"
                  title={account.username ? `@${account.username}` : `ID ${account.tgId}`}
                  subtitle={account.primary ? 'Основной аккаунт' : 'Дополнительный'}
                  value={busy ? '…' : 'Отвязать'}
                  valueColor={colors.red}
                  chevron={false}
                  onPress={() => unlink(account.tgId, account.username)}
                />
              ))
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}
