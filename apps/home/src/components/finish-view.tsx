// Счёт оплачен или закрыт: «спасибо» и оценка вечера (звёзды → быстрые теги →
// комментарий). Без касаний минуту — сами возвращаемся на заставку.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { idleFor } from '@/lib/activity';
import { api } from '@/lib/api';
import { useFlow } from '@/lib/flow';
import { money, num } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useCheck } from '@/lib/queries';
import { colors, GUTTER, radius, space, type } from '@/lib/theme';

import { StaffLogo } from './top-bar';
import { Button, Icon, Tap } from './ui';

const GOOD_TAGS = ['Вкусно', 'Уютно', 'Быстро обслужили', 'Отличная игра', 'Приятная атмосфера', 'Вернёмся ещё'];
const BAD_TAGS = ['Долго ждали', 'Невкусно', 'Шумно', 'Душно или холодно', 'Не убрано', 'Дорого'];
const RATING_TEXT = ['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично!'];

export function FinishView({ checkId, paid }: { checkId: string; paid: boolean }) {
  const check = useCheck(checkId);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const done = () => useFlow.getState().toIdle();

  // Гость ушёл, не оценив — через минуту без касаний экран вернётся на заставку.
  useEffect(() => {
    const t = setInterval(() => {
      if (idleFor() > 60_000) useFlow.getState().toIdle();
    }, 5_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => useFlow.getState().toIdle(), 3500);
    return () => clearTimeout(t);
  }, [sent]);

  const choose = (value: number) => {
    haptic.select();
    // Переход хорошо↔плохо меняет набор тегов — выбранные из другого набора убираем.
    if ((value >= 4) !== (rating >= 4)) setTags([]);
    setRating(value);
  };

  const toggleTag = (tag: string) => {
    haptic.select();
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  };

  const send = async () => {
    setSending(true);
    try {
      await api.post(`/pos/checks/${checkId}/feedback`, { rating, tags, comment: comment.trim() || undefined });
    } catch {
      /* оценка не критична — гостю всё равно спасибо */
    }
    haptic.success();
    setSending(false);
    setSent(true);
  };

  const closedTotal = check.data && check.data.status === 'closed' ? num(check.data.totalAmount) : null;

  if (sent) {
    return (
      <Animated.View entering={FadeIn} style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.heart}>
          <Icon name="heart" size={64} color={colors.pink} />
        </Animated.View>
        <Text style={[type.hero, { textAlign: 'center' }]}>Спасибо за оценку!</Text>
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>Ждём вас снова</Text>
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={styles.top}>
        <StaffLogo />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.check}>
          <Icon name="check-bold" size={56} color={colors.greenDeep} />
        </Animated.View>
        <Text style={[type.hero, { textAlign: 'center' }]}>{paid ? 'Оплата прошла!' : 'Счёт закрыт'}</Text>
        <Text style={styles.sub}>
          {closedTotal != null && closedTotal > 0 ? `${money(closedTotal)} · ` : ''}Спасибо, что были у нас
        </Text>

        <View style={styles.rateCard}>
          <Text style={[type.heading, { textAlign: 'center' }]}>Как вам вечер?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((v) => (
              <Tap key={v} onPress={() => choose(v)} scaleTo={0.85} hapticOnPress={false} accessibilityRole="button" accessibilityLabel={`${v} из 5`} hitSlop={6}>
                <Icon name={v <= rating ? 'star' : 'star-outline'} size={68} color={v <= rating ? colors.amber : colors.textMuted} />
              </Tap>
            ))}
          </View>
          <Text style={styles.ratingText}>{RATING_TEXT[rating] || 'Коснитесь звезды'}</Text>

          {rating > 0 ? (
            <Animated.View entering={FadeInDown} style={{ gap: space.lg, marginTop: space.md }}>
              <View style={styles.tags}>
                {(rating >= 4 ? GOOD_TAGS : BAD_TAGS).map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <Tap key={tag} onPress={() => toggleTag(tag)} hapticOnPress={false} style={[styles.tag, on && styles.tagOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[styles.tagText, on && { color: colors.text }]}>{tag}</Text>
                    </Tap>
                  );
                })}
              </View>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder={rating >= 4 ? 'Что понравилось больше всего? (необязательно)' : 'Что нам исправить? (необязательно)'}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
                style={styles.comment}
              />
              <Button title="Отправить оценку" icon="send" variant="brand" size="xl" onPress={() => void send()} loading={sending} />
            </Animated.View>
          ) : null}
        </View>

        <Button title="Пропустить" variant="ghost" size="md" onPress={done} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: GUTTER, paddingTop: space.xl },
  scroll: { alignItems: 'center', paddingHorizontal: GUTTER, paddingBottom: GUTTER, gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: GUTTER },
  check: {
    width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.14)', borderWidth: 2, borderColor: 'rgba(16,185,129,0.5)',
    boxShadow: '0 0 60px rgba(16,185,129,0.35)',
  },
  heart: {
    width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(236,72,153,0.12)', boxShadow: '0 0 60px rgba(236,72,153,0.3)',
  },
  sub: { fontSize: 18, color: colors.textSecondary, textAlign: 'center' },
  rateCard: {
    width: '100%', maxWidth: 680, marginTop: space.lg, padding: space.xxl, borderRadius: radius.panel,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: space.sm,
  },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.md },
  ratingText: { textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.textSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  tag: {
    paddingHorizontal: 18, height: 46, borderRadius: 23, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.borderStrong,
  },
  tagOn: { backgroundColor: colors.violetTint, borderColor: colors.violet },
  tagText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  comment: {
    minHeight: 84, maxHeight: 140, borderRadius: radius.tile, padding: space.lg, fontSize: 16, color: colors.text,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, textAlignVertical: 'top',
  },
});
