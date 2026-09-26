import { DatePicker, Host } from '@expo/ui/swift-ui';
import { GlassView } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { FormField } from '@/components/form-parts';
import { Avatar, GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { Unavailable } from '@/components/unavailable';
import { fromDateTime, toDateString, useStaffList } from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS, usePageGutter } from '@/lib/layout';
import { useShiftSummary } from '@/lib/queries';
import { currentBusinessDay, paySalary, useBusinessDayStartHour, useSalaryEstimate, useSalaryPayments } from '@/lib/salary-api';
import { useSession } from '@/lib/session';
import { newIdempotencyKey, parseAmount, useCashOps } from '@/lib/shift-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const dayTitle = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const paidAt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const METHOD_LABEL: Record<string, string> = { cash: 'наличными', transfer: 'переводом', card: 'картой' };
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const periodText = (period: string | null) => {
  if (!period) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return `за ${dayTitle.format(new Date(`${period}T12:00:00Z`))}`;
  return `за ${period}`;
};

/**
 * Зарплата сотрудникам: выбор человека и бизнес-дня, оценка по его выручке и формуле клуба,
 * выплата наличными из кассы или переводом. Вторая выплата за тот же день не создаётся —
 * экран предупреждает заранее. Ниже — история выплат.
 */
export default function SalaryScreen() {
  const isOwner = useSession((s) => s.user?.role === 'owner');
  if (!isOwner) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>Зарплата</Stack.Title>
        <Unavailable title="Только для владельца" systemImage="lock" description="Раздел «Зарплата» доступен только владельцу клуба." />
      </AmbientBackdrop>
    );
  }
  return <SalaryOwnerScreen />;
}

function SalaryOwnerScreen() {
  const gutter = usePageGutter();
  const accent = useAccentHex();
  const staff = useStaffList();
  const payments = useSalaryPayments(true);
  const shiftSummary = useShiftSummary();
  const cashOps = useCashOps();
  const startHour = useBusinessDayStartHour();
  const today = currentBusinessDay(startHour);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(() => fromDateTime(today, '12:00'));
  const [amountText, setAmountText] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [pulling, setPulling] = useState(false);

  const dayKey = toDateString(day);
  const estimate = useSalaryEstimate(staffId, dayKey);
  const member = (staff.data ?? []).find((m) => m.id === staffId) ?? null;
  const manual = parseAmount(amountText);
  const amount = amountText.trim() ? (manual ?? 0) : (estimate.data?.salary ?? 0);
  const existing = (payments.data ?? []).find((p) => p.staffId === staffId && p.period === dayKey) ?? null;
  const future = dayKey > today;
  const canPay = !!member && amount > 0 && !existing && !future && !busy;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([staff.refetch(), payments.refetch(), estimate.refetch(), cashOps.refetch()]);
    setPulling(false);
  };

  const pay = async (method: 'cash' | 'transfer') => {
    if (!member) return;
    haptic.medium();
    setBusy(true);
    try {
      const result = await paySalary({ profileId: member.id, amount, method, day: dayKey, comment, idempotencyKey });
      if (result.duplicate) {
        haptic.warning();
        Alert.alert(
          'Выплата уже была',
          `За ${dayTitle.format(new Date(`${dayKey}T12:00:00Z`))} ${member.nickname} уже выплачено ${money(toNumber(result.payment.amount))} ${METHOD_LABEL[result.payment.paymentMethod] ?? ''}. Новая выплата не создана.`,
        );
      } else {
        haptic.success();
        setAmountText('');
        setComment('');
      }
      setIdempotencyKey(newIdempotencyKey());
    } catch (error) {
      haptic.error();
      Alert.alert('Зарплата не выплачена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  /** Наличные: касса может уйти в минус, а без смены деньги из кассы не спишутся — предупреждаем. */
  const confirmCash = () => {
    const shiftOpen = !!shiftSummary.data?.shift;
    const inRegister = cashOps.data?.balance.expected ?? 0;
    if (!shiftOpen) {
      Alert.alert('Смена закрыта', 'Выплата запишется, но из кассы не спишется — кассовой операции не будет. Выплатить?', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выплатить', onPress: () => void pay('cash') },
      ]);
    } else if (amount > inRegister + 0.004) {
      Alert.alert(`В кассе ${money(inRegister)}`, `После выплаты касса уйдёт в минус на ${money(amount - inRegister)}. Выплатить?`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выплатить', style: 'destructive', onPress: () => void pay('cash') },
      ]);
    } else void pay('cash');
  };

  const choose = () => {
    if (!canPay || !member) return;
    haptic.light();
    const title = `${member.nickname} · ${money(amount)}`;
    const message = 'Наличными — спишется из кассы смены. Переводом — попадёт в расходы на зарплату.';
    // ActionSheetIOS есть только на iOS; на Android тот же выбор даёт системный диалог.
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: ['Наличными из кассы', 'Переводом', 'Отмена'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) confirmCash();
          if (index === 1) void pay('transfer');
        },
      );
      return;
    }
    Alert.alert(title, message, [
      { text: 'Наличными из кассы', onPress: confirmCash },
      { text: 'Переводом', onPress: () => void pay('transfer') },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Зарплата</Stack.Title>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, gutter]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={KEYBOARD_DISMISS}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>СОТРУДНИК</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.people} contentContainerStyle={styles.peopleContent}>
            {staff.isLoading && <ActivityIndicator />}
            {(staff.data ?? []).map((m) => {
              const active = m.id === staffId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    haptic.selection();
                    setStaffId(m.id);
                    setAmountText('');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}>
                  <GlassView isInteractive tintColor={active ? accent : undefined} style={styles.person}>
                    <Avatar name={m.nickname} photoUrl={m.photoUrl} size={30} />
                    <Text style={[type.subhead, active ? styles.personActive : styles.label]} numberOfLines={1}>
                      {m.nickname}
                    </Text>
                  </GlassView>
                </Pressable>
              );
            })}
          </ScrollView>

          <GlassCard style={styles.card}>
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <DatePicker
                title="Бизнес-день"
                selection={day}
                displayedComponents={['date']}
                onDateChange={(next) => {
                  setDay(next);
                  setAmountText('');
                }}
              />
            </Host>
            {future && <Text style={[type.footnote, styles.red]}>Этот день ещё не наступил</Text>}
          </GlassCard>

          {member ? (
            <GlassCard style={styles.estimate}>
              <View style={styles.estimateRow}>
                <View style={styles.flex}>
                  <Text style={[type.caption1, styles.secondary]}>Выручка сотрудника за день</Text>
                  <RollingText text={estimate.data ? money(estimate.data.revenue) : '…'} style={[type.title3, type.amount, styles.label]} />
                </View>
                <View style={styles.formula}>
                  <Text style={[type.caption1, styles.secondary]}>По формуле</Text>
                  <RollingText text={estimate.data ? money(estimate.data.salary) : '…'} style={[type.title3, type.amount, styles.accent]} />
                </View>
              </View>
              <Text style={[type.caption1, styles.tertiary]}>По закрытым чекам, которые открыл сотрудник, без мероприятий. 700 ₽ + 100 ₽ за каждую начатую 1 000 ₽ сверх 7 000 ₽.</Text>
            </GlassCard>
          ) : (
            <Text style={[type.subhead, styles.secondary, styles.centered]}>Выберите сотрудника — посчитаем зарплату за день</Text>
          )}

          {existing && (
            <GlassCard tint="rgba(255,149,0,0.16)" style={styles.warning}>
              <SymbolView name="exclamationmark.circle.fill" size={20} tintColor={colors.orange} />
              <Text style={[type.subhead, styles.label, styles.flex]}>
                {`За этот день уже выплачено ${money(toNumber(existing.amount))} ${METHOD_LABEL[existing.paymentMethod] ?? ''}. Вторую выплату за тот же день сервер не создаст.`}
              </Text>
            </GlassCard>
          )}

          {member && (
            <GlassCard style={styles.card}>
              <View style={styles.amountRow}>
                <SymbolView name="rublesign.circle" size={18} tintColor={colors.secondaryLabel} />
                <Text style={[type.body, styles.label, styles.flex]}>К выплате</Text>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder={estimate.data ? String(estimate.data.salary) : '0'}
                  placeholderTextColor={colors.tertiaryLabel}
                  keyboardType="decimal-pad"
                  selectionColor={colors.accent}
                  style={[type.title3, type.amount, styles.amountInput]}
                  accessibilityLabel="Сумма к выплате"
                />
                <Text style={[type.title3, styles.secondary]}>₽</Text>
              </View>
              <View style={sheetStyles.separator} />
              <FormField icon="text.bubble" value={comment} onChange={setComment} placeholder="Комментарий: аванс, премия…" autoCapitalize="sentences" />
            </GlassCard>
          )}

          {member && (
            <PrimaryButton title={busy ? 'Выплачиваем…' : amount > 0 ? `Выплатить ${money(amount)}` : 'Выплатить'} icon="banknote" busy={busy} disabled={!canPay} onPress={choose} />
          )}

          <Text style={[type.footnote, sheetStyles.sectionTitle, styles.historyTitle]}>ИСТОРИЯ ВЫПЛАТ</Text>
          <GlassCard>
            {payments.isLoading ? (
              <ActivityIndicator style={styles.listState} />
            ) : !payments.data?.length ? (
              <Text style={[type.subhead, styles.secondary, styles.centered, styles.listState]}>Выплат пока не было</Text>
            ) : (
              payments.data.map((p, index) => (
                <View key={p.id}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                  <View style={styles.paymentRow}>
                    <Avatar name={p.staffName ?? '··'} photoUrl={(staff.data ?? []).find((m) => m.id === p.staffId)?.photoUrl} size={36} />
                    <View style={styles.flex}>
                      <Text style={[type.body, styles.label]} numberOfLines={1}>
                        {p.staffName ?? 'Сотрудник'}
                      </Text>
                      <Text style={[type.footnote, styles.secondary]} numberOfLines={2}>
                        {[periodText(p.period), p.note, paidAt.format(new Date(p.createdAt))].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.paymentAmount}>
                      <Text style={[type.body, type.amount, styles.label]}>{money(toNumber(p.amount))}</Text>
                      <SymbolView name={p.paymentMethod === 'cash' ? 'banknote' : 'arrow.left.arrow.right'} size={13} tintColor={colors.secondaryLabel} />
                    </View>
                  </View>
                </View>
              ))
            )}
          </GlassCard>
          {(payments.data?.length ?? 0) >= 100 && <Text style={[type.footnote, styles.tertiary, styles.centered]}>Показаны последние 100 выплат</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  accent: { color: colors.accent },
  red: { color: colors.red },
  centered: { textAlign: 'center' },
  people: { flexGrow: 0, flexShrink: 0, height: 52, marginHorizontal: -space.lg },
  peopleContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 6, paddingRight: space.md, height: 44, borderRadius: 22 },
  personActive: { color: 'white', fontWeight: '600' },
  card: { paddingHorizontal: space.lg, paddingVertical: space.xs },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  estimate: { padding: space.lg, gap: space.sm },
  estimateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  formula: { alignItems: 'flex-end' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  amountInput: { minWidth: 90, textAlign: 'right', color: colors.label },
  historyTitle: { marginTop: space.md },
  listState: { paddingVertical: space.xl },
  separator: { marginLeft: 64 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  paymentAmount: { alignItems: 'flex-end', gap: 2 },
});
