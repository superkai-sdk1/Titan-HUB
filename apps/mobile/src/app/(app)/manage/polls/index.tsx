import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { AppRefreshControl } from '@/components/refresh-control';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Group, ListNote, Row, SwitchRow } from '@/components/settings-parts';
import { setPollCollect, setPollCommandsAdminOnly, usePollChats, usePollCollect, usePolls, WEEKDAY_LABELS, type PollConfig } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton } from '@/components/toolbar';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** «Пн, Ср, Пт · 10:00» — когда бот выкладывает опрос. */
function scheduleText(poll: PollConfig): string {
  const days = poll.weekdays.length ? poll.weekdays.map((day) => WEEKDAY_LABELS[day - 1]).join(', ') : 'по кнопке';
  return `${days} · ${poll.postTime}`;
}

/** Опросы в Telegram: бот выкладывает сбор на игру по расписанию. */
export default function PollsScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const polls = usePolls();
  const chats = usePollChats();
  const collect = usePollCollect();
  const [pulling, setPulling] = useState(false);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([polls.refetch(), chats.refetch(), collect.refetch()]);
    setPulling(false);
  };

  const chatName = (poll: PollConfig) => {
    const chat = chats.data?.find((item) => String(item.id) === String(poll.chatId));
    const topic = chat?.topics.find((item) => String(item.threadId) === String(poll.threadId));
    return [chat?.title ?? (poll.chatId ? `чат ${poll.chatId}` : 'чат не выбран'), topic?.name].filter(Boolean).join(' › ');
  };

  const configs = polls.data?.configs ?? [];
  const tokenConfigured = polls.data?.tokenConfigured ?? false;

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Опросы</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton
          icon="plus"
          accessibilityLabel="Новый опрос"
          onPress={() => {
            haptic.light();
            router.push('/manage/polls/edit');
          }}
        />
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Group title="Бот" footer={tokenConfigured ? 'Токен бота опросов задан в веб-кассе.' : 'Без токена бот не сможет выложить опрос. Токен задаётся в веб-кассе.'}>
          <Row icon={tokenConfigured ? 'checkmark.seal' : 'exclamationmark.triangle'} color={tokenConfigured ? '#22C55E' : '#F59E0B'} title="Токен бота" value={tokenConfigured ? (polls.data?.tokenMasked ?? 'задан') : 'не задан'} />
          <SwitchRow
            icon="person.badge.shield.checkmark"
            color="#6366F1"
            title="Команды только админам"
            subtitle="Обычные участники не смогут дёргать бота"
            value={polls.data?.commandsAdminOnly ?? false}
            onChange={(on) =>
              void setPollCommandsAdminOnly(on)
                .then(() => haptic.success())
                .catch((error: unknown) => Alert.alert('Не сохранено', errorText(error)))
            }
          />
          <SwitchRow
            icon="tray.and.arrow.down"
            color="#0EA5E9"
            title="Собирать ответы"
            subtitle="Бот запоминает, кто как проголосовал"
            value={collect.data?.enabled ?? false}
            onChange={(on) =>
              void setPollCollect(on)
                .then(() => haptic.success())
                .catch((error: unknown) => Alert.alert('Не сохранено', errorText(error)))
            }
          />
        </Group>

        <Group title="Опросы">
          {configs.map((poll) => (
            <Row
              key={poll.id}
              icon="checklist"
              color={poll.enabled ? '#EF4444' : colors.tertiaryLabel}
              title={poll.title || 'Без названия'}
              subtitle={`${chatName(poll)}\n${scheduleText(poll)}`}
              value={poll.enabled ? undefined : 'выкл'}
              dim={!poll.enabled}
              chevron
              onPress={() => router.push({ pathname: '/manage/polls/edit', params: { pollId: poll.id } })}
            />
          ))}
        </Group>
        {configs.length === 0 && <ListNote loading={polls.isLoading} text="Опросов пока нет" systemImage="checklist" description="Добавьте опрос кнопкой «+» — бот будет выкладывать его по расписанию." />}

        <Text style={[type.footnote, styles.note]}>Бот выкладывает опрос в выбранный чат в указанные дни. Чтобы чат появился в списке, добавьте бота в группу.</Text>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  note: { color: colors.secondaryLabel, paddingHorizontal: space.xs, textAlign: 'center' },
});
