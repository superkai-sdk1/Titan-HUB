import { useMutation, useQuery } from '@tanstack/react-query';
import { GlassView } from 'expo-glass-effect';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { queryClient } from '@/lib/query';
import { markCheckNotificationsRead, useCheck, useClubKey } from '@/lib/queries';
import { colors, radius, space, type } from '@/lib/theme';

type ChatMessage = {
  id: string;
  checkId: string;
  sender: 'guest' | 'staff';
  text: string;
  readAt: string | null;
  createdAt: string;
};

/** Быстрые ответы персонала — те же, что в веб-кассе. */
const TEMPLATES = ['Уже идём 🙌', 'Одну минуту', 'Готовим ваш заказ', 'Сейчас подойдём со счётом', 'Спасибо!'];

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Чат с гостем в кабинке: шторка поверх чека. */
export default function ChatSheet() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>();
  const host = useClubKey();
  const insets = useSafeAreaInsets();
  const check = useCheck(checkId);
  const [text, setText] = useState('');
  const queryKey = [host, 'pos', 'chat', checkId];

  const chat = useQuery({
    queryKey,
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/pos/checks/${checkId}/chat`).then((r) => r.messages),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    void api.post(`/pos/checks/${checkId}/chat/read`, { as: 'staff' }).catch(() => {});
    void markCheckNotificationsRead(host, { id: checkId, spaceId: check.data?.spaceId ?? null });
  }, [checkId, host, check.data?.spaceId, chat.data?.length]);

  const send = useMutation({
    mutationFn: (message: string) =>
      api.post<{ message: ChatMessage }>(`/pos/checks/${checkId}/chat`, { text: message, from: 'staff' }).then((r) => r.message),
    onMutate: (message) => {
      haptic.light();
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        checkId,
        sender: 'staff',
        text: message,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => [...(old ?? []), optimistic]);
      return { optimisticId: optimistic.id };
    },
    onSuccess: (message, _vars, ctx) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old) =>
        (old ?? []).map((m) => (m.id === ctx?.optimisticId ? message : m)),
      );
    },
    onError: (error, message, ctx) => {
      haptic.error();
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => (old ?? []).filter((m) => m.id !== ctx?.optimisticId));
      setText(message);
      Alert.alert('Сообщение не отправлено', error.message === 'Check not open' ? 'Чек уже закрыт.' : error.message);
    },
  });

  const submit = (value: string) => {
    const message = value.trim();
    if (!message || send.isPending) return;
    setText('');
    send.mutate(message);
  };

  const messages = [...(chat.data ?? [])].reverse();
  const closed = check.data ? check.data.status !== 'open' : false;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        keyboardDismissMode={KEYBOARD_DISMISS}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[type.subhead, styles.secondary]}>
              {chat.isLoading ? 'Загружаем переписку…' : 'Сообщений пока нет. Гость увидит ответ на планшете в кабинке.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const mine = item.sender === 'staff';
          return (
            <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.bubbleRow, mine && styles.mineRow]}>
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[type.body, mine ? styles.mineText : styles.theirsText]}>{item.text}</Text>
              </View>
              <Text style={[type.caption2, styles.meta]}>
                {`${time.format(new Date(item.createdAt))}${mine && item.readAt ? ' · прочитано' : ''}`}
              </Text>
            </Animated.View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        {!closed && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templates}>
            {TEMPLATES.map((t) => (
              <GlassView key={t} isInteractive style={styles.chip}>
                <Pressable onPress={() => submit(t)} style={styles.chipPress} accessibilityRole="button">
                  <Text style={[type.subhead, styles.chipText]}>{t}</Text>
                </Pressable>
              </GlassView>
            ))}
          </ScrollView>
        )}
        <View style={styles.inputRow}>
          <GlassView style={styles.inputGlass}>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={!closed}
              placeholder={closed ? 'Чек закрыт' : 'Сообщение гостю'}
              placeholderTextColor={colors.tertiaryLabel}
              style={[type.body, styles.input]}
              multiline
              maxLength={1000}
            />
          </GlassView>
          <Pressable
            onPress={() => submit(text)}
            disabled={!text.trim() || send.isPending || closed}
            accessibilityRole="button"
            accessibilityLabel="Отправить">
            <SymbolView
              name="arrow.up.circle.fill"
              size={36}
              tintColor={text.trim() && !closed ? colors.accent : colors.tertiaryLabel}
            />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  empty: { padding: space.xxl, transform: [{ scaleY: -1 }] },
  secondary: { color: colors.secondaryLabel, textAlign: 'center' },
  bubbleRow: { alignItems: 'flex-start', gap: 2, maxWidth: '82%' },
  mineRow: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: 20, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: colors.accent },
  theirs: { backgroundColor: colors.fill },
  mineText: { color: 'white' },
  theirsText: { color: colors.label },
  meta: { color: colors.tertiaryLabel, marginHorizontal: 6 },
  composer: { gap: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  templates: { paddingHorizontal: space.lg, gap: space.sm },
  chip: { borderRadius: 18, overflow: 'hidden' },
  chipPress: { paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: colors.label },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md },
  inputGlass: { flex: 1, borderRadius: radius.card, overflow: 'hidden' },
  input: { color: colors.label, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, maxHeight: 120 },
});
