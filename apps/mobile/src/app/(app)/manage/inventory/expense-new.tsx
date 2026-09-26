import { DatePicker, Host } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/glass';
import { FormSection } from '@/components/form-parts';
import { GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { useDebounced } from '@/components/player-picker';
import { fromDateTime, toDateString, todayMsk } from '@/lib/events-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import {
  createExpenses,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_CHOICES,
  round2,
  useExpenseCatalog,
  type ExpenseCatalogItem,
  type ExpenseCategory,
} from '@/lib/inventory-api';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { newIdempotencyKey, parseAmount } from '@/lib/shift-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

type Line = { key: string; description: string; category: ExpenseCategory; price: string; qty: string };

const layout = LinearTransition.springify().damping(24).stiffness(220);
const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
let seq = 0;
const newLine = (): Line => ({ key: `expense-${++seq}`, description: '', category: 'other', price: '', qty: '1' });

/** Новый расход клуба: дата и позиции — название с подсказками из прошлых расходов, категория, цена × количество. */
export default function ExpenseNewSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const [date, setDate] = useState<Date>(() => fromDateTime(todayMsk(), '12:00'));
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const active = lines.find((l) => l.key === activeKey);
  const catalogQuery = useDebounced(active?.description ?? '', 250);
  const catalog = useExpenseCatalog(catalogQuery);

  const update = (key: string, patch: Partial<Line>) => setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const sums = lines.map((l) => round2((parseAmount(l.price) ?? 0) * (parseAmount(l.qty) ?? 0)));
  const total = round2(sums.reduce((s, n) => s + n, 0));

  const pick = (key: string, item: ExpenseCatalogItem) => {
    haptic.selection();
    update(key, { description: item.name, category: item.category === 'salary' ? 'other' : item.category, ...(item.unitPrice !== null ? { price: String(item.unitPrice).replace('.', ',') } : {}) });
    setActiveKey(null);
  };

  const save = async () => {
    if (total <= 0) return Alert.alert('Добавьте хотя бы одну позицию с суммой');
    haptic.medium();
    setBusy(true);
    try {
      await createExpenses(
        toDateString(date),
        lines.map((l) => ({ category: l.category, description: l.description, unitPrice: parseAmount(l.price) ?? 0, quantity: parseAmount(l.qty) ?? 0 })),
        idempotencyKey,
      );
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Расход не добавлен', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS}
        showsVerticalScrollIndicator={false}>
        <SheetHeader title="Новый расход" onClose={() => router.back()} />

        <GlassCard style={styles.card}>
          <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
            <DatePicker title="Дата расхода" selection={date} displayedComponents={['date']} onDateChange={setDate} />
          </Host>
        </GlassCard>

        {lines.map((line, index) => {
          const suggestions = activeKey === line.key && catalogQuery.trim().length >= 2 ? (catalog.data ?? []).slice(0, 5) : [];
          return (
            <Animated.View key={line.key} entering={FadeIn} exiting={FadeOut} layout={layout}>
              <FormSection title={lines.length > 1 ? `ПОЗИЦИЯ ${index + 1}` : 'ПОЗИЦИЯ'}>
                <GlassCard style={styles.lineCard}>
                  <View style={styles.inputRow}>
                    <SymbolView name={EXPENSE_CATEGORIES[line.category].symbol} size={17} tintColor={EXPENSE_CATEGORIES[line.category].color} />
                    <TextInput
                      value={line.description}
                      onChangeText={(text) => update(line.key, { description: text })}
                      onFocus={() => setActiveKey(line.key)}
                      placeholder="Название — например, «Салфетки»"
                      placeholderTextColor={colors.tertiaryLabel}
                      selectionColor={colors.accent}
                      autoCapitalize="sentences"
                      style={[type.body, styles.input]}
                    />
                    {lines.length > 1 && (
                      <Pressable onPress={() => setLines((current) => current.filter((l) => l.key !== line.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Убрать позицию">
                        <SymbolView name="minus.circle.fill" size={20} tintColor={colors.red} />
                      </Pressable>
                    )}
                  </View>

                  {suggestions.length > 0 && (
                    <View style={styles.suggestions}>
                      {suggestions.map((item) => (
                        <Pressable key={item.name} onPress={() => pick(line.key, item)} style={({ pressed }) => [styles.suggestion, pressed && sheetStyles.pressedRow]} accessibilityRole="button">
                          <SymbolView name={EXPENSE_CATEGORIES[item.category].symbol} size={13} tintColor={EXPENSE_CATEGORIES[item.category].color} />
                          <Text style={[type.subhead, sheetStyles.label, styles.flex]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.unitPrice !== null && <Text style={[type.caption1, sheetStyles.secondary]}>{money(item.unitPrice)}</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent} keyboardShouldPersistTaps="handled">
                    {EXPENSE_CATEGORY_CHOICES.map((category) => (
                      <GlassChip
                        key={category}
                        label={EXPENSE_CATEGORIES[category].label}
                        tint={EXPENSE_CATEGORIES[category].color}
                        active={line.category === category}
                        onPress={() => {
                          haptic.selection();
                          update(line.key, { category });
                        }}
                      />
                    ))}
                  </ScrollView>

                  <View style={styles.numbers}>
                    <Field label="Цена, ₽" value={line.price} onChange={(text) => update(line.key, { price: text })} />
                    <Text style={[type.body, sheetStyles.tertiary]}>×</Text>
                    <Field label="Кол-во" value={line.qty} onChange={(text) => update(line.key, { qty: text })} />
                    <Text style={[type.body, sheetStyles.tertiary]}>=</Text>
                    <View style={styles.sum}>
                      <Text style={[type.caption2, sheetStyles.secondary]}>Сумма</Text>
                      <Text style={[type.headline, type.amount, sheetStyles.label]}>{sums[index]! > 0 ? money(sums[index]!) : '—'}</Text>
                    </View>
                  </View>
                </GlassCard>
              </FormSection>
            </Animated.View>
          );
        })}

        <Pressable
          onPress={() => {
            haptic.light();
            setLines((current) => [...current, newLine()]);
          }}
          accessibilityRole="button">
          <GlassView isInteractive style={styles.addLine}>
            <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
            <Text style={[type.body, styles.addText]}>Добавить позицию</Text>
          </GlassView>
        </Pressable>

        <PrimaryButton title={busy ? 'Сохраняем…' : total > 0 ? `Добавить расход · ${money(total)}` : 'Добавить расход'} icon="checkmark" busy={busy} disabled={total <= 0} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[type.caption2, sheetStyles.secondary]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.tertiaryLabel}
        selectionColor={colors.accent}
        selectTextOnFocus
        style={[type.headline, type.amount, styles.fieldInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  lineCard: { padding: space.lg, gap: space.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  input: { flex: 1, color: colors.label, minHeight: 44 },
  suggestions: { borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 40 },
  chips: { flexGrow: 0, flexShrink: 0, height: 44, marginHorizontal: -space.lg },
  chipsContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  numbers: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: { flex: 1 },
  fieldInput: { color: colors.label, paddingVertical: 4 },
  sum: { flex: 1.3, alignItems: 'flex-end' },
  addLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 50, borderRadius: 25 },
  addText: { color: colors.accent, fontWeight: '600' },
});
