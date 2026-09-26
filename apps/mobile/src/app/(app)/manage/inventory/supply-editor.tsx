import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { GlassView } from '@/components/glass';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import {
  applySupplyDraft,
  correctSupply,
  createSupply,
  fetchLastSupplyPrice,
  round2,
  saveSupplyDraft,
  useInventory,
  useSupply,
  type SupplyLineInput,
} from '@/lib/inventory-api';
import { KEYBOARD_DISMISS, usePageGutter } from '@/lib/layout';
import { newIdempotencyKey, parseAmount } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';
import { chooseAction } from '@/lib/dialog';

type Mode = 'create' | 'draft' | 'correct';
type Line = { key: string; itemId: string | null; name: string; qty: string; price: string; lastPrice: number | null };

const layout = LinearTransition.springify().damping(24).stiffness(220);
const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
let lineSeq = 0;
const newLine = (partial: Partial<Line> = {}): Line => ({ key: `line-${++lineSeq}`, itemId: null, name: '', qty: '1', price: '', lastPrice: null, ...partial });
const numberText = (n: number) => String(n).replace('.', ',');

/**
 * Редактор закупки: новая, черновик или корректировка проведённой. Позиция — товар склада
 * (подсказки по названию, последняя цена подставляется) или просто затрата без карточки.
 * Уйти с несохранённой закупкой можно, только выбрав: провести, сохранить черновик или не сохранять.
 */
export default function SupplyEditorScreen() {
  const { draftId, supplyId } = useLocalSearchParams<{ draftId?: string; supplyId?: string }>();
  const mode: Mode = supplyId ? 'correct' : draftId ? 'draft' : 'create';
  const source = useSupply(supplyId ?? draftId);

  if (mode !== 'create' && !source.data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>Закупка</Stack.Title>
        <View style={styles.state}>{source.isError ? <Text style={[type.body, styles.secondary]}>{source.error.message}</Text> : <ActivityIndicator />}</View>
      </AmbientBackdrop>
    );
  }

  const initial: Line[] =
    mode === 'correct'
      ? (source.data?.items ?? []).map((l) => newLine({ itemId: l.itemId, name: l.name, qty: numberText(l.quantity), price: numberText(l.costPerUnit), lastPrice: l.costPerUnit }))
      : mode === 'draft'
        ? (source.data?.supply.draftData?.items ?? []).map((l) =>
            newLine({ itemId: l.itemId ?? null, name: l.name ?? '', qty: numberText(l.quantity), price: l.costPerUnit ? numberText(l.costPerUnit) : '' }),
          )
        : [];

  return <SupplyEditor mode={mode} sourceId={supplyId ?? draftId} initialLines={initial.length ? initial : [newLine()]} />;
}

function SupplyEditor({ mode, sourceId, initialLines }: { mode: Mode; sourceId: string | undefined; initialLines: Line[] }) {
  const gutter = usePageGutter();
  const router = useRouter();
  const navigation = useNavigation();
  const inventory = useInventory();
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [reason, setReason] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const leaving = useRef(false);

  const update = (key: string, patch: Partial<Line>) => {
    setDirty(true);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const parsed = lines.map((line) => {
    const qty = parseAmount(line.qty) ?? 0;
    const price = parseAmount(line.price) ?? 0;
    const error = !line.name.trim() ? 'Укажите название' : qty <= 0 ? 'Количество должно быть больше 0' : line.itemId && !Number.isInteger(qty) ? 'Для товара склада количество — целое' : null;
    return { line, qty, price, sum: round2(qty * price), error };
  });
  const total = round2(parsed.reduce((sum, p) => sum + p.sum, 0));
  const valid = parsed.every((p) => !p.error) && (mode !== 'correct' || reason.trim().length >= 3);
  const inputs: SupplyLineInput[] = parsed.map((p) => ({ itemId: p.line.itemId, name: p.line.name, quantity: p.qty, costPerUnit: p.price }));

  const exit = () => {
    leaving.current = true;
    router.back();
  };

  const submit = async (): Promise<boolean> => {
    setShowErrors(true);
    if (!valid) {
      haptic.error();
      Alert.alert(mode === 'correct' && reason.trim().length < 3 ? 'Укажите причину корректировки' : 'Проверьте позиции', 'Ошибки подсвечены под строками.');
      return false;
    }
    haptic.medium();
    setBusy(true);
    try {
      if (mode === 'correct' && sourceId) await correctSupply(sourceId, inputs, reason.trim());
      else if (mode === 'draft' && sourceId) await applySupplyDraft(sourceId, inputs);
      else {
        const result = await createSupply(inputs, idempotencyKey);
        if (result.duplicate) Alert.alert('Закупка уже проведена', 'Повторная отправка не создала дубль.');
      }
      haptic.success();
      return true;
    } catch (error) {
      haptic.error();
      Alert.alert('Закупка не сохранена', errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    const filled = inputs.filter((l, index) => l.itemId || l.name.trim() || parsed[index]!.price > 0);
    if (filled.length === 0) return true;
    try {
      await saveSupplyDraft(mode === 'draft' ? sourceId : undefined, filled);
      haptic.success();
      return true;
    } catch (error) {
      Alert.alert('Черновик не сохранён', errorText(error));
      return false;
    }
  };

  usePreventRemove(dirty && !busy, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    const leave = () => navigation.dispatch(data.action);
    chooseAction(
      mode === 'correct' ? 'Корректировка не сохранена' : 'Закупка не проведена',
      mode === 'correct' ? 'Изменения пропадут.' : 'Сохранить перед выходом?',
      mode === 'correct'
        ? [
            { text: 'Остаться', style: 'cancel' },
            { text: 'Не сохранять', style: 'destructive', onPress: leave },
          ]
        : [
            ...(valid ? [{ text: 'Провести закупку', icon: 'checkmark.seal', onPress: () => void submit().then((ok) => ok && leave()) }] : []),
            { text: 'Сохранить черновик', icon: 'tray.and.arrow.down', onPress: () => void saveDraft().then((ok) => ok && leave()) },
            { text: 'Не сохранять', style: 'destructive' as const, onPress: leave },
            { text: 'Остаться', style: 'cancel' as const },
          ],
    );
  });

  const pick = async (key: string, itemId: string, name: string) => {
    haptic.selection();
    update(key, { itemId, name });
    setActiveKey(null);
    const last = await fetchLastSupplyPrice(itemId);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, lastPrice: last, price: l.price || (last !== null ? numberText(last) : '') } : l)));
  };

  const suggestionsFor = (line: Line) => {
    const q = line.name.trim().toLowerCase();
    if (!q || line.itemId || activeKey !== line.key) return [];
    return (inventory.data ?? [])
      .filter((i) => !i.linkedSpaceId && (i.name.toLowerCase().includes(q) || (i.searchTags ?? []).some((t) => t.toLowerCase().includes(q))))
      .slice(0, 6);
  };

  const title = mode === 'correct' ? 'Корректировка закупки' : mode === 'draft' ? 'Черновик закупки' : 'Новая закупка';

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{title}</Stack.Title>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, gutter]} keyboardShouldPersistTaps="handled" keyboardDismissMode={KEYBOARD_DISMISS}>
          {parsed.map(({ line, qty, price, sum, error }, index) => {
            const suggestions = suggestionsFor(line);
            const priceDiff = line.lastPrice !== null && price > 0 ? round2(price - line.lastPrice) : 0;
            return (
              <Animated.View key={line.key} entering={FadeIn} exiting={FadeOut} layout={layout}>
                <GlassCard style={styles.lineCard}>
                  <View style={styles.lineTop}>
                    <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`ПОЗИЦИЯ ${index + 1}`}</Text>
                    {line.itemId && (
                      <View style={styles.stockBadge}>
                        <SymbolView name="shippingbox.fill" size={10} tintColor={colors.accent} />
                        <Text style={[type.caption2, styles.stockBadgeText]}>склад</Text>
                      </View>
                    )}
                    <View style={styles.flex} />
                    {lines.length > 1 && (
                      <Pressable
                        onPress={() => {
                          haptic.light();
                          setDirty(true);
                          setLines((current) => current.filter((l) => l.key !== line.key));
                        }}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Убрать позицию">
                        <SymbolView name="minus.circle.fill" size={20} tintColor={colors.red} />
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.inputRow}>
                    <SymbolView name={line.itemId ? 'shippingbox' : 'text.cursor'} size={16} tintColor={colors.secondaryLabel} />
                    <TextInput
                      value={line.name}
                      onChangeText={(text) => update(line.key, { name: text, itemId: null, lastPrice: null })}
                      onFocus={() => setActiveKey(line.key)}
                      placeholder="Товар со склада или название затраты"
                      placeholderTextColor={colors.tertiaryLabel}
                      selectionColor={colors.accent}
                      autoCorrect={false}
                      style={[type.body, styles.input]}
                    />
                  </View>

                  {suggestions.length > 0 && (
                    <View style={styles.suggestions}>
                      {suggestions.map((item) => (
                        <Pressable key={item.id} onPress={() => void pick(line.key, item.id, item.name)} style={({ pressed }) => [styles.suggestion, pressed && sheetStyles.pressedRow]} accessibilityRole="button">
                          <SymbolView name="shippingbox" size={14} tintColor={colors.accent} />
                          <Text style={[type.subhead, sheetStyles.label, styles.flex]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.trackStock && <Text style={[type.caption1, sheetStyles.secondary]}>{`${item.stockQuantity} шт`}</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <View style={sheetStyles.separator} />
                  <View style={styles.numbers}>
                    <NumberField label="Кол-во" value={line.qty} onChange={(text) => update(line.key, { qty: text })} decimal={!line.itemId} />
                    <Text style={[type.body, sheetStyles.tertiary]}>×</Text>
                    <NumberField label="Цена, ₽" value={line.price} onChange={(text) => update(line.key, { price: text })} decimal />
                    <Text style={[type.body, sheetStyles.tertiary]}>=</Text>
                    <View style={styles.sum}>
                      <Text style={[type.caption2, sheetStyles.secondary]}>Сумма</Text>
                      <Text style={[type.headline, type.amount, sheetStyles.label]} numberOfLines={1} adjustsFontSizeToFit>
                        {qty > 0 && price > 0 ? money(sum) : '—'}
                      </Text>
                    </View>
                  </View>

                  {priceDiff !== 0 && (
                    <Text style={[type.caption1, { color: priceDiff > 0 ? colors.orange : colors.green }]}>
                      {`${priceDiff > 0 ? 'Подорожало' : 'Подешевело'} на ${money(Math.abs(priceDiff))} с прошлой закупки (было ${money(line.lastPrice ?? 0)})`}
                    </Text>
                  )}
                  {showErrors && error && <Text style={[type.caption1, styles.error]}>{error}</Text>}
                </GlassCard>
              </Animated.View>
            );
          })}

          <Pressable
            onPress={() => {
              haptic.light();
              setDirty(true);
              setLines((current) => [...current, newLine()]);
            }}
            accessibilityRole="button">
            <GlassView isInteractive style={styles.addLine}>
              <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
              <Text style={[type.body, styles.addText]}>Добавить позицию</Text>
            </GlassView>
          </Pressable>

          {mode === 'correct' && (
            <GlassCard style={styles.reasonCard}>
              <Text style={[type.footnote, sheetStyles.sectionTitle]}>ПРИЧИНА КОРРЕКТИРОВКИ</Text>
              <TextInput
                value={reason}
                onChangeText={(text) => {
                  setDirty(true);
                  setReason(text);
                }}
                placeholder="Например: ошиблись в количестве"
                placeholderTextColor={colors.tertiaryLabel}
                selectionColor={colors.accent}
                multiline
                style={[type.body, styles.reasonInput]}
              />
              {showErrors && reason.trim().length < 3 && <Text style={[type.caption1, styles.error]}>Не короче 3 символов</Text>}
            </GlassCard>
          )}

          <GlassCard style={styles.totalCard}>
            <Text style={[type.headline, sheetStyles.label, styles.flex]}>Итого по закупке</Text>
            <Text style={[type.title2, type.amount, sheetStyles.label]}>{money(total)}</Text>
          </GlassCard>

          <PrimaryButton
            title={busy ? 'Сохраняем…' : mode === 'correct' ? 'Сохранить корректировку' : `Провести закупку · ${money(total)}`}
            icon="checkmark"
            busy={busy}
            onPress={() => void submit().then((ok) => ok && exit())}
          />
          {mode !== 'correct' && <Text style={[type.footnote, styles.hint]}>Товары со склада придут в остаток, их себестоимость пересчитается по средней.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </AmbientBackdrop>
  );
}

function NumberField({ label, value, onChange, decimal }: { label: string; value: string; onChange: (text: string) => void; decimal: boolean }) {
  return (
    <View style={styles.numberField}>
      <Text style={[type.caption2, sheetStyles.secondary]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="0"
        placeholderTextColor={colors.tertiaryLabel}
        selectionColor={colors.accent}
        selectTextOnFocus
        style={[type.headline, type.amount, styles.numberInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  secondary: { color: colors.secondaryLabel },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  lineCard: { padding: space.lg, gap: space.sm },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.16)' },
  stockBadgeText: { color: colors.accent, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  input: { flex: 1, color: colors.label, minHeight: 44 },
  suggestions: { borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 40 },
  numbers: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  numberField: { flex: 1 },
  numberInput: { color: colors.label, paddingVertical: 4 },
  sum: { flex: 1.3, alignItems: 'flex-end' },
  error: { color: colors.red },
  addLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 50, borderRadius: 25 },
  addText: { color: colors.accent, fontWeight: '600' },
  reasonCard: { padding: space.lg, gap: space.sm },
  reasonInput: { color: colors.label, minHeight: 60, textAlignVertical: 'top' },
  totalCard: { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  hint: { color: colors.tertiaryLabel, textAlign: 'center', paddingHorizontal: space.lg },
});
