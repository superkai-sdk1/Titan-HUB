import { Button, ContentUnavailableView, Form, HStack, Image, Picker, ProgressView, Section, Spacer, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, primary, TimeRow } from '@/components/native-form';
import { POLL_DEFAULT_OPTIONS, postPollToday, savePolls, testPoll, usePollChats, usePolls, WEEKDAY_LABELS, type PollConfig } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/shift-api';
import { colors } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

/** Вариант ответа со стабильным ключом: поле в строке помнит свой текст при удалении соседей. */
type Option = { key: number; text: string };

/** Опрос в Telegram: чат, расписание и варианты ответа. Сервер хранит все опросы одним списком. */
export default function PollEditSheet() {
  const { pollId } = useLocalSearchParams<{ pollId?: string }>();
  const polls = usePolls();

  if (!polls.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }

  const existing = pollId ? polls.data.configs.find((item) => item.id === pollId) : undefined;
  return <PollForm key={existing?.id ?? 'new'} all={polls.data.configs} original={existing ?? null} tokenConfigured={polls.data.tokenConfigured} />;
}

function PollForm({ all, original, tokenConfigured }: { all: PollConfig[]; original: PollConfig | null; tokenConfigured: boolean }) {
  const router = useRouter();
  const chats = usePollChats();

  const [draft, setDraft] = useState<PollConfig>(
    () =>
      original ?? {
        id: newIdempotencyKey(),
        kind: 'custom',
        enabled: false,
        chatId: '',
        threadId: null,
        title: '',
        subtitleDay: '',
        autoDay: true,
        subtitleTime: '',
        options: [...POLL_DEFAULT_OPTIONS],
        weekdays: [],
        postTime: '10:00',
      },
  );
  const [options, setOptions] = useState<Option[]>(() => draft.options.map((text, key) => ({ key, text })));
  const [nextKey, setNextKey] = useState(draft.options.length);
  const [busy, setBusy] = useState<'save' | 'test' | 'today' | null>(null);

  const patch = (next: Partial<PollConfig>) => setDraft((current) => ({ ...current, ...next }));
  const filled = options.map((o) => o.text.trim()).filter(Boolean);

  const problem = (): string | null => {
    if (!draft.title.trim()) return 'Укажите название опроса';
    if (!draft.chatId.trim()) return 'Выберите чат';
    if (filled.length < 2) return 'Нужно минимум два варианта ответа';
    if (!TIME_RE.test(draft.postTime)) return 'Время выкладки в формате ЧЧ:ММ';
    return null;
  };

  /** Сервер принимает список целиком — подменяем в нём текущий опрос. */
  const nextList = (): PollConfig[] => {
    const clean: PollConfig = { ...draft, title: draft.title.trim(), chatId: draft.chatId.trim(), options: filled };
    return all.some((item) => item.id === clean.id) ? all.map((item) => (item.id === clean.id ? clean : item)) : [...all, clean];
  };

  const save = async (after?: (pollId: string) => Promise<void>, mode: 'save' | 'test' | 'today' = 'save') => {
    const issue = problem();
    if (issue) return Alert.alert(issue);
    haptic.medium();
    setBusy(mode);
    try {
      await savePolls(nextList());
      if (after) await after(draft.id);
      haptic.success();
      if (!after) router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Не удалось', errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.title || 'опрос'}»?`, 'Бот перестанет выкладывать этот опрос.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void savePolls(all.filter((item) => item.id !== original.id))
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Опрос не удалён', errorText(error))),
      },
    ]);

  const toggleDay = (day: number) => {
    haptic.selection();
    patch({ weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((item) => item !== day) : [...draft.weekdays, day].sort((a, b) => a - b) });
  };

  const chatTag = (chatId: string | number, threadId: string | number | null) => `${chatId}|${threadId ?? ''}`;
  const selectedChat = draft.chatId ? chatTag(draft.chatId, draft.threadId) : null;

  return (
    <>
      <EditorToolbar title={original ? 'Опрос' : 'Новый опрос'} canSave={!problem()} busy={busy === 'save'} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section title="Название">
            <FieldRow value={draft.title} placeholder="Например, «Спортивная мафия»" autoFocus={!original} maxLength={120} onChange={(title) => patch({ title })} />
          </Section>

          <Section footer={<Text>Бот выкладывает включённый опрос по расписанию.</Text>}>
            <Toggle label="Опрос включён" isOn={draft.enabled} onIsOnChange={(enabled) => patch({ enabled })} />
          </Section>

          <Section title="Куда выкладывать" footer={<Text>Чаты появляются здесь, когда бот добавлен в группу. Темы форума — со стрелкой.</Text>}>
            {chats.isLoading ? (
              <ProgressView />
            ) : (chats.data ?? []).length === 0 ? (
              <ContentUnavailableView title="Чатов нет" systemImage="bubble.left.and.bubble.right" description="Бот ещё не добавлен ни в один чат." />
            ) : (
              <Picker
                selection={selectedChat}
                onSelectionChange={(value) => {
                  const [chatId, threadId] = String(value).split('|');
                  patch({ chatId, threadId: threadId ? Number(threadId) : null });
                }}
                modifiers={[pickerStyle('inline')]}>
                {(chats.data ?? []).flatMap((chat) => [
                  <Text key={chatTag(chat.id, null)} modifiers={[tag(chatTag(chat.id, null))]}>
                    {chat.title ?? `Чат ${chat.id}`}
                  </Text>,
                  ...chat.topics.map((topic) => (
                    <Text key={chatTag(chat.id, topic.threadId)} modifiers={[tag(chatTag(chat.id, topic.threadId))]}>
                      {`   › ${topic.name ?? `Тема ${topic.threadId}`}`}
                    </Text>
                  )),
                ])}
              </Picker>
            )}
          </Section>

          <Section title="Когда" footer={<Text>{draft.weekdays.length ? 'Опрос выкладывается в отмеченные дни в указанное время.' : 'Без выбранных дней опрос выкладывается только кнопкой «Выложить сегодня».'}</Text>}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Button key={label} onPress={() => toggleDay(index + 1)}>
                <HStack spacing={10}>
                  <Text modifiers={[primary]}>{WEEKDAY_FULL[index]}</Text>
                  <Spacer />
                  {draft.weekdays.includes(index + 1) ? <Image systemName="checkmark" size={16} color={colors.accent} /> : null}
                </HStack>
              </Button>
            ))}
            <TimeRow label="Время выкладки" value={draft.postTime} fallback="10:00" onChange={(postTime) => patch({ postTime })} />
          </Section>

          <Section title="Подзаголовок" footer={<Text>Строка под заголовком опроса: день и время игры.</Text>}>
            <Toggle label="День недели автоматически" isOn={draft.autoDay !== false} onIsOnChange={(autoDay) => patch({ autoDay })} />
            {draft.autoDay === false && <FieldRow value={draft.subtitleDay} placeholder="День, например «Пятница»" onChange={(subtitleDay) => patch({ subtitleDay })} />}
            <FieldRow value={draft.subtitleTime} placeholder="Время игры, например «20:00»" onChange={(subtitleTime) => patch({ subtitleTime })} />
          </Section>

          <Section title="Варианты ответа" footer={<Text>От двух до десяти вариантов. Пустые строки не сохраняются.</Text>}>
            {options.map((option, index) => (
              <HStack key={option.key} spacing={10}>
                <FieldRow value={option.text} placeholder={`Вариант ${index + 1}`} onChange={(text) => setOptions((list) => list.map((o) => (o.key === option.key ? { ...o, text } : o)))} />
                {options.length > 2 ? (
                  <Image
                    systemName="minus.circle.fill"
                    size={20}
                    color={colors.red}
                    onPress={() => {
                      haptic.light();
                      setOptions((list) => list.filter((o) => o.key !== option.key));
                    }}
                  />
                ) : null}
              </HStack>
            ))}
            {options.length < 10 && (
              <ActionRow
                title="Добавить вариант"
                icon="plus.circle.fill"
                onPress={() => {
                  setOptions((list) => [...list, { key: nextKey, text: '' }]);
                  setNextKey((k) => k + 1);
                }}
              />
            )}
          </Section>

          <Section footer={<Text>{tokenConfigured ? 'Перед отправкой опрос сохраняется.' : 'Токен бота опросов не задан — отправить не получится.'}</Text>}>
            <ActionRow
              title={busy === 'test' ? 'Отправляем…' : 'Отправить тестовый опрос'}
              icon="paperplane"
              disabled={!!busy}
              onPress={() => void save((id) => testPoll(id).then(() => Alert.alert('Тестовый опрос отправлен')), 'test')}
            />
            <ActionRow
              title={busy === 'today' ? 'Выкладываем…' : 'Выложить сегодня'}
              icon="megaphone"
              disabled={!!busy}
              onPress={() => void save((id) => postPollToday(id).then(() => Alert.alert('Опрос выложен', 'Плановая выкладка сегодня уже не повторится.')), 'today')}
            />
          </Section>

          {original && (
            <Section>
              <ActionRow title="Удалить опрос" icon="trash" destructive onPress={remove} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
