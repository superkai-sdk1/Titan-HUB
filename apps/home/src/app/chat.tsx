// Чат гостя с администратором в рамках счёта (как в веб-киоске), с быстрыми фразами.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Icon, IconButton, Loader, Tap } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { toast, useFlow } from '@/lib/flow';
import { hhmm } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { invalidate, useChat } from '@/lib/queries';
import { colors, GUTTER, radius, space, type } from '@/lib/theme';
import type { ChatMessage } from '@/lib/types';

const QUICK = ['Подойдите, пожалуйста', 'Принесите воды', 'Можно убрать со стола?', 'Спасибо!'];

export default function ChatScreen() {
  const router = useRouter();
  const phase = useFlow((s) => s.phase);
  const checkId = phase.kind === 'session' ? phase.checkId : null;
  const chat = useChat(checkId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messages = chat.data ?? [];
  const unreadStaff = messages.filter((m) => m.sender === 'staff' && !m.readAt).length;

  // Счёт закрыли — чат больше не нужен.
  useEffect(() => {
    if (!checkId) router.back();
  }, [checkId, router]);

  // Гость видит сообщения персонала — отмечаем прочитанными (персонал увидит галочки).
  useEffect(() => {
    if (!checkId || !unreadStaff) return;
    void api.post(`/pos/checks/${checkId}/chat/read`, { as: 'guest' }).then(() => invalidate('chat', checkId)).catch(() => {});
  }, [checkId, unreadStaff]);

  const send = async (value: string) => {
    const body = value.trim();
    if (!body || !checkId || sending) return;
    setSending(true);
    try {
      await api.post(`/pos/checks/${checkId}/chat`, { text: body });
      haptic.tap();
      setText('');
      await invalidate('chat', checkId);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" label="Назад" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>Чат с администратором</Text>
          <Text style={type.caption}>Ответят прямо сюда — обычно за пару минут</Text>
        </View>
      </View>

      {chat.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <Bubble message={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="chat-outline" size={48} color={colors.textMuted} />
              <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>Напишите, если что-то нужно — администратор увидит сообщение на кассе</Text>
            </View>
          }
        />
      )}

      <View style={styles.quick}>
        {QUICK.map((q) => (
          <Tap key={q} style={styles.quickChip} onPress={() => void send(q)} disabled={sending}>
            <Text style={styles.quickText}>{q}</Text>
          </Tap>
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          maxLength={1000}
        />
        <IconButton icon="send" label="Отправить" size={56} tone={colors.violetLight} onPress={() => void send(text)} disabled={!text.trim() || sending} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.sender === 'guest';
  return (
    <Animated.View entering={FadeInUp.duration(220)} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {!mine ? <Text style={styles.author}>Администратор</Text> : null}
        <Text style={styles.text}>{message.text}</Text>
        <Text style={styles.time}>{hhmm(new Date(message.createdAt))}{mine && message.readAt ? ' · прочитано' : ''}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.md },
  list: { padding: GUTTER, gap: space.sm, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxxl, transform: [{ scaleY: -1 }] },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '78%', paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 22 },
  mine: { backgroundColor: colors.violetDeep, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.border },
  author: { fontSize: 12, fontWeight: '800', color: colors.cyan, marginBottom: 2 },
  text: { fontSize: 17, color: colors.text, lineHeight: 23 },
  time: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, alignSelf: 'flex-end' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: GUTTER, paddingBottom: space.md },
  quickChip: { paddingHorizontal: 16, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet },
  quickText: { color: colors.lavender, fontWeight: '700', fontSize: 15 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingHorizontal: GUTTER, paddingBottom: GUTTER },
  input: {
    flex: 1, minHeight: 56, maxHeight: 140, borderRadius: radius.tile + 10, paddingHorizontal: space.xl, paddingTop: 16, paddingBottom: 16,
    fontSize: 17, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
  },
});
