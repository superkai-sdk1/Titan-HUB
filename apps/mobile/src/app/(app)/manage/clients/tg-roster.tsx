import { ContentUnavailableView, Form, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { FormHost, LinkRow, SearchRow } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { linkClientTg, useClient, useTgRoster, type TgRosterUser } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const fullName = (u: TgRosterUser) => [u.firstName, u.lastName].filter(Boolean).join(' ');

/**
 * «Участники чата» — как в веб-карточке клиента: бот видит, кто пишет в чатах клуба, и
 * Telegram можно привязать выбором из списка, без QR-кода. Аккаунт добавляется к
 * профилю, а не заменяет прежний: у одного человека бывает несколько Telegram.
 */
export default function TgRosterSheet() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const client = useClient(clientId);
  const roster = useTgRoster();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru').replace(/^@/, '');
    const users = [...(roster.data ?? [])].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    if (!q) return users;
    return users.filter((u) => [u.username, u.firstName, u.lastName, u.tgId].some((v) => v?.toLocaleLowerCase('ru').includes(q)));
  }, [roster.data, query]);

  const nickname = client.data?.nickname ?? 'клиенту';

  const pick = (user: TgRosterUser) => {
    const who = user.username ? `@${user.username}` : fullName(user) || `ID ${user.tgId}`;
    Alert.alert(`Привязать ${who}?`, `Telegram добавится к профилю «${nickname}». Прежние аккаунты останутся.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Привязать',
        onPress: () => {
          setBusy(user.tgId);
          linkClientTg(clientId, user)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => {
              haptic.error();
              Alert.alert('Не привязано', errorText(error));
            })
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Title>Участники чата</Stack.Title>
      <Stack.Toolbar placement="left">
        <ToolbarButton onPress={() => router.back()}>Отмена</ToolbarButton>
      </Stack.Toolbar>
      <FormHost>
        <Form>
          <Section footer={<Text>Кто писал в чатах клуба при боте. Выберите аккаунт гостя.</Text>}>
            <SearchRow placeholder="Имя или @username" onChange={setQuery} />
          </Section>
          <Section>
            {roster.isLoading ? (
              <ProgressView />
            ) : list.length === 0 ? (
              <ContentUnavailableView
                title={roster.isError ? 'Нет связи' : query ? 'Никого не нашли' : 'Пока никого'}
                systemImage="person.2"
                description={roster.isError ? errorText(roster.error) : query ? undefined : 'Бот ещё никого не видел в чатах клуба.'}
              />
            ) : (
              list.map((user) => {
                const taken = !!user.linkedTo;
                return (
                  <LinkRow
                    key={user.tgId}
                    icon="paperplane.fill"
                    color={taken ? '#8E8E93' : '#32ADE6'}
                    title={user.username ? `@${user.username}` : fullName(user) || `ID ${user.tgId}`}
                    subtitle={taken ? `Уже у «${user.linkedTo}»` : fullName(user) || 'без имени'}
                    value={busy === user.tgId ? '…' : undefined}
                    chevron={false}
                    onPress={taken || busy !== null ? undefined : () => pick(user)}
                  />
                );
              })
            )}
          </Section>
        </Form>
      </FormHost>
    </>
  );
}
