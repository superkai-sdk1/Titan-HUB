import { DatePicker, Host } from '@expo/ui/swift-ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { DangerRow, GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { Row, SwitchRow } from '@/components/settings-parts';
import { POLL_DEFAULT_OPTIONS, postPollToday, savePolls, testPoll, usePollChats, usePolls, WEEKDAY_LABELS, type PollConfig } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { newIdempotencyKey } from '@/lib/shift-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const timeToDate = (time: string) => {
  const [hours, minutes] = TIME_RE.test(time) ? time.split(':') : ['10', '00'];
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date;
};
const dateToTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Опрос в Telegram: чат, расписание и варианты ответа. Сервер хранит все опросы одним списком. */
export default function PollEditSheet() {
  const { pollId } = useLocalSearchParams<{ pollId?: string }>();
  const router = useRouter();
  const polls = usePolls();

  if (!polls.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const existing = pollId ? polls.data.configs.find((item) => item.id === pollId) : undefined;
  return <PollForm all={polls.data.configs} original={existing ?? null} tokenConfigured={polls.data.tokenConfigured} onClose={() => router.back()} />;
}

function PollForm({ all, original, tokenConfigured, onClose }: { all: PollConfig[]; original: PollConfig | null; tokenConfigured: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
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
  const [busy, setBusy] = useState<'save' | 'test' | 'today' | null>(null);

  const patch = (next: Partial<PollConfig>) => setDraft((current) => ({ ...current, ...next }));

  const problem = (): string | null => {
    if (!draft.title.trim()) return 'Укажите название опроса';
    if (!draft.chatId.trim()) return 'Выберите чат';
    if (draft.options.map((o) => o.trim()).filter(Boolean).length < 2) return 'Нужно минимум два варианта ответа';
    if (!TIME_RE.test(draft.postTime)) return 'Время выкладки в формате ЧЧ:ММ';
    return null;
  };

  /** Сервер принимает список целиком — подменяем в нём текущий опрос. */
  const nextList = (): PollConfig[] => {
    const clean: PollConfig = {
      ...draft,
      title: draft.title.trim(),
      chatId: draft.chatId.trim(),
      options: draft.options.map((option) => option.trim()).filter(Boolean),
    };
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
      if (!after) onClose();
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
              onClose();
            })
            .catch((error: unknown) => Alert.alert('Опрос не удалён', errorText(error))),
      },
    ]);

  const toggleDay = (day: number) => {
    haptic.selection();
    patch({ weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((item) => item !== day) : [...draft.weekdays, day].sort((a, b) => a - b) });
  };

  const setOption = (index: number, value: string) => patch({ options: draft.options.map((item, position) => (position === index ? value : item)) });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={KEYBOARD_DISMISS} showsVerticalScrollIndicator={false}>
        <SheetHeader title={original ? 'Опрос' : 'Новый опрос'} onClose={onClose} />

        <FormSection title="ОПРОС">
          <GlassCard style={styles.card}>
            <FormField icon="text.bubble" value={draft.title} onChange={(title) => patch({ title })} placeholder="Название, например «Спортивная мафия»" autoCapitalize="sentences" autoFocus={!original} />
          </GlassCard>
        </FormSection>

        <GlassCard>
          <SwitchRow title="Опрос включён" subtitle="Бот выкладывает его по расписанию" value={draft.enabled} onChange={(enabled) => patch({ enabled })} />
        </GlassCard>

        <FormSection title="КУДА ВЫКЛАДЫВАТЬ" footer="Чаты появляются здесь, когда бот добавлен в группу.">
          <GlassCard>
            {(chats.data ?? []).map((chat, index) => (
              <View key={chat.id}>
                {index > 0 && <View style={[sheetStyles.separator, styles.inset]} />}
                <Row
                  icon="bubble.left.and.bubble.right"
                  color={String(draft.chatId) === String(chat.id) && draft.threadId === null ? accent : '#64748B'}
                  title={chat.title ?? `Чат ${chat.id}`}
                  subtitle={chat.type ?? undefined}
                  onPress={() => patch({ chatId: String(chat.id), threadId: null })}
                />
                {chat.topics.map((topic) => (
                  // Темы форума — с отступом под своим чатом, иначе список читается как плоский.
                  <View key={topic.threadId} style={styles.topic}>
                    <View style={[sheetStyles.separator, styles.topicSeparator]} />
                    <Row
                      icon="number"
                      color={String(draft.chatId) === String(chat.id) && String(draft.threadId) === String(topic.threadId) ? accent : '#94A3B8'}
                      title={topic.name ?? `Тема ${topic.threadId}`}
                      onPress={() => patch({ chatId: String(chat.id), threadId: Number(topic.threadId) })}
                    />
                  </View>
                ))}
              </View>
            ))}
            {(chats.data ?? []).length === 0 && <Row title={chats.isLoading ? 'Загружаем чаты…' : 'Бот ещё не добавлен ни в один чат'} />}
          </GlassCard>
        </FormSection>

        <FormSection title="КОГДА" footer={draft.weekdays.length ? undefined : 'Без выбранных дней опрос выкладывается только по кнопке «Выложить сегодня».'}>
          <View style={styles.chips}>
            {WEEKDAY_LABELS.map((label, index) => (
              <GlassChip key={label} label={label} active={draft.weekdays.includes(index + 1)} onPress={() => toggleDay(index + 1)} />
            ))}
          </View>
          <GlassCard style={styles.card}>
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <DatePicker title="Время выкладки" selection={timeToDate(draft.postTime)} displayedComponents={['hourAndMinute']} onDateChange={(date) => patch({ postTime: dateToTime(date) })} />
            </Host>
          </GlassCard>
        </FormSection>

        <FormSection title="ПОДЗАГОЛОВОК" footer="Строка под заголовком опроса: день и время игры.">
          <GlassCard>
            <SwitchRow title="День недели автоматически" subtitle="Подставляется день выкладки" value={draft.autoDay !== false} onChange={(autoDay) => patch({ autoDay })} />
            {draft.autoDay === false && (
              <>
                <View style={[sheetStyles.separator, styles.inset]} />
                <View style={styles.field}>
                  <FormField icon="calendar" value={draft.subtitleDay} onChange={(subtitleDay) => patch({ subtitleDay })} placeholder="День, например «Пятница»" autoCapitalize="sentences" />
                </View>
              </>
            )}
            <View style={[sheetStyles.separator, styles.inset]} />
            <View style={styles.field}>
              <FormField icon="clock" value={draft.subtitleTime} onChange={(subtitleTime) => patch({ subtitleTime })} placeholder="Время игры, например «20:00»" />
            </View>
          </GlassCard>
        </FormSection>

        <FormSection title="ВАРИАНТЫ ОТВЕТА" footer="От двух до десяти вариантов.">
          <GlassCard style={styles.card}>
            {draft.options.map((option, index) => (
              <View key={index}>
                {index > 0 && <View style={sheetStyles.separator} />}
                <View style={styles.optionRow}>
                  <TextInput
                    value={option}
                    onChangeText={(value) => setOption(index, value)}
                    placeholder={`Вариант ${index + 1}`}
                    placeholderTextColor={colors.tertiaryLabel}
                    selectionColor={colors.accent}
                    autoCapitalize="sentences"
                    style={[type.body, styles.optionInput]}
                    accessibilityLabel={`Вариант ${index + 1}`}
                  />
                  {draft.options.length > 2 && (
                    <Pressable
                      onPress={() => {
                        haptic.light();
                        patch({ options: draft.options.filter((_, position) => position !== index) });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Убрать вариант">
                      <SymbolView name="minus.circle.fill" size={20} tintColor={colors.red} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </GlassCard>
          {draft.options.length < 10 && (
            <Pressable
              onPress={() => {
                haptic.light();
                patch({ options: [...draft.options, ''] });
              }}
              style={({ pressed }) => [styles.addOption, pressed && styles.pressed]}
              accessibilityRole="button">
              <SymbolView name="plus.circle" size={18} tintColor={colors.accent} />
              <Text style={[type.body, styles.accentText]}>Добавить вариант</Text>
            </Pressable>
          )}
        </FormSection>

        <PrimaryButton title={busy === 'save' ? 'Сохраняем…' : 'Сохранить'} icon="checkmark" busy={busy === 'save'} onPress={() => void save()} />

        <View style={styles.actions}>
          <GlassChip label={busy === 'test' ? '…' : 'Тест'} icon="paperplane" active={false} onPress={() => void save((id) => testPoll(id).then(() => Alert.alert('Тестовый опрос отправлен')), 'test')} />
          <GlassChip label={busy === 'today' ? '…' : 'Выложить сегодня'} icon="megaphone" active={false} onPress={() => void save((id) => postPollToday(id).then(() => Alert.alert('Опрос выложен', 'Плановая выкладка сегодня уже не повторится.')), 'today')} />
        </View>
        {!tokenConfigured && <Text style={[type.footnote, styles.warning]}>Токен бота опросов не задан — отправить не получится.</Text>}

        {original && (
          <DangerRow title="Удалить опрос" icon="trash" onPress={remove} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { height: 300, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  inset: { marginLeft: space.lg },
  topic: { paddingLeft: space.xl },
  topicSeparator: { marginLeft: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  field: { paddingHorizontal: space.lg },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  optionInput: { flex: 1, color: colors.label, minHeight: 48 },
  addOption: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs, paddingVertical: space.sm },
  accentText: { color: colors.accent, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  warning: { color: colors.secondaryLabel, textAlign: 'center', paddingHorizontal: space.xs },
  pressed: { opacity: 0.6 },
});
