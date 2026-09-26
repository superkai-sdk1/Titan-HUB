import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, GlassChip } from '@/components/new-check-parts';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { askTai, isTaiLocked, TAI_ACTIONS, taiActionLabel, taiErrorText, type TaiAction } from '@/lib/tai-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

type Message = { id: string; role: 'user' | 'tai'; text: string; failed?: boolean };

const STARTERS = TAI_ACTIONS.slice(0, 6);

/**
 * Tai — ассистент клуба: отвечает по живым данным (выручка, остатки, смены, игроки).
 * Каждый вопрос — отдельный запрос к серверу, истории на сервере нет.
 */
export default function TaiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const scroller = useRef<ScrollView>(null);
  const request = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => () => request.current?.abort(), []);

  const ask = (action: TaiAction, query?: string) => {
    if (busy) return;
    const prompt = action === 'custom_query' ? (query ?? '').trim() : taiActionLabel(action);
    if (action === 'custom_query' && !prompt) return;
    haptic.light();
    counter.current += 1;
    const id = String(counter.current);
    setMessages((current) => [...current, { id, role: 'user', text: prompt }]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;

    askTai(action, prompt, controller.signal)
      .then((result) => {
        haptic.success();
        setMessages((current) => [...current, { id: `${id}-tai`, role: 'tai', text: result.trim() }]);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        haptic.error();
        if (isTaiLocked(error)) setLocked(true);
        setMessages((current) => [...current, { id: `${id}-tai`, role: 'tai', text: taiErrorText(error), failed: true }]);
      })
      .finally(() => {
        if (request.current === controller) request.current = null;
        setBusy(false);
      });
  };

  const empty = messages.length === 0;

  return (
    <AmbientBackdrop style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <SymbolView name="sparkles" size={22} tintColor={accent} />
        <Text style={[type.title3, styles.label, styles.flex]}>Tai</Text>
        <Pressable
          onPress={() => {
            haptic.light();
            router.back();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Закрыть">
          <SymbolView name="xmark.circle.fill" size={28} tintColor={colors.tertiaryLabel} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.messages}
          keyboardDismissMode={KEYBOARD_DISMISS}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
          {empty ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.welcome}>
              <SymbolView name="sparkles" size={56} tintColor={accent} />
              <Text style={[type.title2, styles.label]}>Чем помочь?</Text>
              <Text style={[type.subhead, styles.secondary, styles.centered]}>Спросите что угодно о клубе — выручка, остатки, смены, игроки — или начните с подсказки.</Text>
              <View style={styles.starters}>
                {STARTERS.map((item) => (
                  <Pressable key={item.key} onPress={() => ask(item.key)} style={({ pressed }) => [styles.starter, pressed && styles.pressed]} accessibilityRole="button">
                    <GlassCard style={styles.starterCard}>
                      <SymbolView name={item.icon} size={18} tintColor={item.color} />
                      <Text style={[type.footnote, styles.label]} numberOfLines={2}>
                        {item.label}
                      </Text>
                    </GlassCard>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          ) : (
            messages.map((message) => <Bubble key={message.id} message={message} accent={accent} />)
          )}

          {busy && (
            <Animated.View entering={FadeIn} style={styles.thinking}>
              <ActivityIndicator />
              <Text style={[type.footnote, styles.secondary]}>Tai смотрит данные клуба…</Text>
            </Animated.View>
          )}
        </ScrollView>

        {!locked && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsStrip} contentContainerStyle={styles.actions}>
            {TAI_ACTIONS.map((item) => (
              <GlassChip key={item.key} label={item.label} icon={item.icon} tint={item.color} active={false} onPress={() => ask(item.key)} />
            ))}
          </ScrollView>
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <GlassCard style={styles.inputCard}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Спросите Tai о клубе"
              placeholderTextColor={colors.tertiaryLabel}
              selectionColor={colors.accent}
              multiline
              editable={!locked}
              style={[type.body, styles.input]}
              accessibilityLabel="Вопрос к Tai"
              onSubmitEditing={() => ask('custom_query', input)}
            />
            <Pressable onPress={() => ask('custom_query', input)} disabled={busy || !input.trim()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Отправить">
              <SymbolView name="arrow.up.circle.fill" size={32} tintColor={input.trim() && !busy ? accent : colors.tertiaryLabel} />
            </Pressable>
          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </AmbientBackdrop>
  );
}

function Bubble({ message, accent }: { message: Message; accent: string }) {
  if (message.role === 'user') {
    return (
      <Animated.View entering={FadeInDown.duration(180)} style={styles.mine}>
        <View style={[styles.mineBubble, { backgroundColor: accent }]}>
          <Text style={[type.body, styles.mineText]}>{message.text}</Text>
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.theirs}>
      <SymbolView name="sparkles" size={18} tintColor={message.failed ? colors.red : accent} />
      <View style={styles.flex}>
        <RichText text={message.text} failed={message.failed} />
      </View>
    </Animated.View>
  );
}

/** Ответ модели приходит лёгкой разметкой: **жирный**, заголовки и списки. */
function RichText({ text, failed }: { text: string; failed?: boolean }) {
  const lines = text.split('\n');
  return (
    <View style={styles.rich}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={index} style={styles.gap} />;

        const heading = /^#{1,6}\s+/.exec(trimmed);
        if (heading) {
          return (
            <Text key={index} style={[type.headline, styles.label]}>
              {inline(trimmed.slice(heading[0].length))}
            </Text>
          );
        }

        const bullet = /^([-*•]|\d+[.)])\s+/.exec(trimmed);
        if (bullet) {
          return (
            <View key={index} style={styles.bullet}>
              <Text style={[type.body, styles.secondary]}>{/^\d/.test(bullet[0]) ? bullet[0].trim() : '•'}</Text>
              <Text style={[type.body, failed ? styles.destructive : styles.label, styles.flex]}>{inline(trimmed.slice(bullet[0].length))}</Text>
            </View>
          );
        }

        return (
          <Text key={index} style={[type.body, failed ? styles.destructive : styles.label]}>
            {inline(trimmed)}
          </Text>
        );
      })}
    </View>
  );
}

/** Возвращает куски строки, где **обёрнутые** идут жирным. */
function inline(line: string) {
  return line.split('**').map((part, index) =>
    index % 2 === 1 ? (
      <Text key={index} style={styles.bold}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  destructive: { color: colors.red },
  centered: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  messages: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, gap: space.lg },
  welcome: { alignItems: 'center', gap: space.sm, paddingTop: space.xxxl },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  starter: { width: '48%' },
  starterCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, minHeight: 56 },
  pressed: { opacity: 0.6 },
  mine: { alignItems: 'flex-end' },
  mineBubble: { maxWidth: '86%', paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 20, borderCurve: 'continuous' },
  mineText: { color: 'white' },
  theirs: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  rich: { gap: 2 },
  gap: { height: space.sm },
  bullet: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actionsStrip: { flexGrow: 0, flexShrink: 0, height: 44 },
  actions: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  composer: { paddingHorizontal: space.lg, paddingTop: space.sm },
  inputCard: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  input: { flex: 1, color: colors.label, maxHeight: 132, minHeight: 36, paddingTop: 8 },
});
