import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from '@/components/form-parts';
import { Avatar, GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { excludeMember, includeMember, setMemberAmount, useCollection, type ExcludeDuration, type RosterRow } from '@/lib/collections-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const untilFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

const DURATIONS: { key: ExcludeDuration; label: string }[] = [
  { key: '1m', label: 'На месяц' },
  { key: '3m', label: 'На 3 месяца' },
  { key: 'forever', label: 'Навсегда' },
];

/** Участник сбора: своя сумма взноса и исключение на месяц, три месяца или навсегда. */
export default function MemberSheet() {
  const params = useLocalSearchParams<{ collectionId: string; periodKey?: string; playerId: string }>();
  const router = useRouter();
  const detail = useCollection(params.collectionId, params.periodKey || null);
  const row = detail.data?.roster.find((r) => r.playerId === params.playerId);

  if (!detail.data || !row) {
    return (
      <View style={styles.loading}>
        {detail.isLoading ? <ActivityIndicator /> : <Text style={[type.body, sheetStyles.secondary]}>Участник не найден</Text>}
      </View>
    );
  }

  return <MemberForm key={row.playerId} collectionId={params.collectionId} periodAmount={detail.data.period.amount} row={row} onClose={() => router.back()} />;
}

function MemberForm({ collectionId, periodAmount, row, onClose }: { collectionId: string; periodAmount: number; row: RosterRow; onClose: () => void }) {
  const [amount, setAmount] = useState(row.amountOverride !== null ? String(row.amountOverride) : '');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, failTitle: string, close = false) => {
    haptic.medium();
    setBusy(key);
    try {
      await action();
      haptic.success();
      if (close) onClose();
    } catch (error) {
      haptic.error();
      Alert.alert(failTitle, errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const saveAmount = () => {
    const value = amount.trim() ? parseAmount(amount) : null;
    if (amount.trim() && value === null) return Alert.alert('Проверьте сумму');
    void run('amount', () => setMemberAmount(collectionId, row.playerId, value), 'Сумма не сохранена', true);
  };

  const exclude = (duration: ExcludeDuration) => {
    const doIt = () => void run(`exclude-${duration}`, () => excludeMember(collectionId, row.playerId, duration), 'Участник не исключён', true);
    if (duration === 'forever') {
      Alert.alert(`Исключить ${row.nickname} навсегда?`, 'Вернуть в сбор можно будет здесь же.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Исключить', style: 'destructive', onPress: doIt },
      ]);
    } else doIt();
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Участник сбора" onClose={onClose} />

      <View style={styles.hero}>
        <Avatar name={row.nickname} photoUrl={row.photoUrl} size={64} />
        <Text style={[type.title3, sheetStyles.label]}>{row.nickname}</Text>
        {row.fullName && <Text style={[type.subhead, sheetStyles.secondary]}>{row.fullName}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={[type.footnote, sheetStyles.sectionTitle]}>ПЕРСОНАЛЬНАЯ СУММА ВЗНОСА</Text>
        <GlassCard style={styles.card}>
          <FormField icon="rublesign" value={amount} onChange={setAmount} placeholder={`По умолчанию ${formatMoney(periodAmount, { kopecks: 'auto' })}`} keyboardType="decimal-pad" suffix="₽" />
        </GlassCard>
        <Text style={[type.footnote, styles.footnote]}>Действует на все месяцы сбора, включая прошлые. Пустое поле — общая сумма.</Text>
        <PrimaryButton title={busy === 'amount' ? 'Сохраняем…' : amount.trim() ? 'Сохранить сумму' : 'Общая сумма взноса'} icon="checkmark" busy={busy === 'amount'} onPress={saveAmount} />
      </View>

      <View style={styles.section}>
        <Text style={[type.footnote, sheetStyles.sectionTitle]}>УЧАСТИЕ В СБОРЕ</Text>
        {row.excluded ? (
          <GlassCard style={styles.excludedCard}>
            <SymbolView name="person.crop.circle.badge.xmark" size={24} tintColor={colors.orange} />
            <Text style={[type.subhead, sheetStyles.label, styles.flex]}>
              {row.excludedForever ? 'Исключён навсегда' : row.excludedUntil ? `Исключён до ${untilFormat.format(new Date(row.excludedUntil))}` : 'Исключён'}
            </Text>
            <Pressable
              disabled={!!busy}
              onPress={() => void run('include', () => includeMember(collectionId, row.playerId), 'Участник не возвращён', true)}
              style={({ pressed }) => [styles.include, pressed && styles.pressed]}
              accessibilityRole="button">
              {busy === 'include' ? <ActivityIndicator color="white" /> : <Text style={[type.subhead, styles.includeText]}>Вернуть</Text>}
            </Pressable>
          </GlassCard>
        ) : (
          <View style={styles.durations}>
            {DURATIONS.map((d) => (
              <GlassChip key={d.key} style={styles.flex} label={busy === `exclude-${d.key}` ? '…' : d.label} tint={colors.orange} active={false} onPress={() => exclude(d.key)} />
            ))}
          </View>
        )}
        {!row.excluded && <Text style={[type.footnote, styles.footnote]}>Исключённый не должен взнос за эти месяцы и не считается в «оплатили из».</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  loading: { height: 320, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: 4 },
  section: { gap: space.sm },
  card: { paddingHorizontal: space.lg },
  footnote: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  durations: { flexDirection: 'row', gap: space.sm },
  excludedCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  include: { paddingHorizontal: space.lg, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent, minWidth: 90, alignItems: 'center' },
  includeText: { color: 'white', fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
