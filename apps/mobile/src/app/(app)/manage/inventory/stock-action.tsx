import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from '@/components/form-parts';
import { AmountKeypad, GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { haptic } from '@/lib/haptics';
import { adjustStock, setReplenishment, thresholdOf, useInventory, writeOff, type InventoryItem } from '@/lib/inventory-api';
import { colors, space, type } from '@/lib/theme';
import { promptText } from '@/lib/dialog';

type Mode = 'writeoff' | 'adjust' | 'params';
type AdjustKind = 'delta' | 'absolute';

const WRITE_OFF_REASONS = ['Бой', 'Порча', 'Угощение', 'Истёк срок'];
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Действия с остатком товара одной шторкой: списание, корректировка, точка заказа. */
export default function StockActionSheet() {
  const { itemId, mode } = useLocalSearchParams<{ itemId: string; mode: Mode }>();
  const router = useRouter();
  const inventory = useInventory();
  const item = inventory.data?.find((i) => i.id === itemId);

  if (!item) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const close = () => router.back();
  if (mode === 'params') return <ParamsForm item={item} onDone={close} />;
  if (mode === 'adjust') return <AdjustForm item={item} onDone={close} />;
  return <WriteOffForm item={item} onDone={close} />;
}

function ItemLine({ item }: { item: InventoryItem }) {
  return (
    <GlassCard style={styles.itemLine}>
      <SymbolView name="shippingbox" size={18} tintColor={colors.secondaryLabel} />
      <Text style={[type.headline, sheetStyles.label, styles.flex]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[type.subhead, item.stockQuantity < 0 ? styles.red : sheetStyles.secondary]}>{`на складе ${item.stockQuantity} шт`}</Text>
    </GlassCard>
  );
}

function WriteOffForm({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const qty = Number(text) || 0;
  const stock = Math.max(0, item.stockQuantity);
  const custom = reason !== '' && !WRITE_OFF_REASONS.includes(reason);
  const canSubmit = qty > 0 && reason.trim().length > 0 && stock > 0 && !busy;

  const preview =
    stock <= 0
      ? 'На складе ничего нет — списывать нечего'
      : qty <= 0
        ? `На складе ${stock} шт`
        : qty > stock
          ? `На складе только ${stock} шт — спишем все`
          : `Останется ${stock - qty} шт`;

  const askReason = () =>
    promptText('Причина списания', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Готово', onPress: (value?: string) => value?.trim() && setReason(value.trim()) },
    ], 'plain-text', custom ? reason : '');

  const submit = async () => {
    if (!canSubmit) return;
    haptic.medium();
    setBusy(true);
    try {
      // Без автоповторов: списание не идемпотентно.
      const result = await writeOff(item.id, qty, reason.trim());
      haptic.success();
      onDone();
      if (-result.applied !== qty) Alert.alert(`Списано ${Math.abs(result.applied)} шт`, `Больше на складе не было. Остаток: ${result.qtyAfter} шт.`);
    } catch (error) {
      haptic.error();
      Alert.alert('Списание не проведено', `${errorText(error)}\n\nПроверьте остаток перед повтором.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Списание" onClose={onDone} />
      <ItemLine item={item} />
      <Display text={text} suffix="шт" caption={preview} warn={stock <= 0 || qty > stock} />
      <View style={styles.row}>
        {WRITE_OFF_REASONS.map((option) => (
          <GlassChip
            key={option}
            style={styles.flex}
            label={option}
            tint={colors.red}
            active={reason === option}
            onPress={() => {
              haptic.selection();
              setReason(reason === option ? '' : option);
            }}
          />
        ))}
      </View>
      <Pressable onPress={askReason} accessibilityRole="button">
        <GlassCard style={styles.reason}>
          <SymbolView name="text.bubble" size={16} tintColor={colors.secondaryLabel} />
          <Text style={[type.body, custom ? sheetStyles.label : sheetStyles.tertiary, styles.flex]} numberOfLines={1}>
            {custom ? reason : 'Своя причина…'}
          </Text>
          <SymbolView name="pencil" size={13} tintColor={colors.tertiaryLabel} />
        </GlassCard>
      </Pressable>
      <AmountKeypad value={text} onChange={setText} allowDecimal={false} maxLength={5} />
      <PrimaryButton
        title={busy ? 'Списываем…' : qty > 0 ? `Списать ${Math.min(qty, stock)} шт` : 'Списать'}
        icon="trash"
        busy={busy}
        disabled={!canSubmit}
        onPress={() => void submit()}
      />
    </View>
  );
}

function AdjustForm({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const negative = item.stockQuantity < 0;
  const [kind, setKind] = useState<AdjustKind>(negative ? 'absolute' : 'delta');
  const [sign, setSign] = useState<1 | -1>(1);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('Ручная корректировка');
  const [busy, setBusy] = useState(false);

  const value = Number(text) || 0;
  const target = kind === 'absolute' ? value : Math.max(0, item.stockQuantity + sign * value);
  const changed = text !== '' && target !== item.stockQuantity;
  const canSubmit = changed && !busy && (kind === 'absolute' || value > 0);

  const submit = async () => {
    if (!canSubmit) return;
    haptic.medium();
    setBusy(true);
    try {
      // При минусе относительная правка исказит журнал — ставим точный остаток.
      const change = kind === 'absolute' || negative ? { absolute: target } : { delta: sign * value };
      const updated = await adjustStock(item.id, change, reason.trim() || 'Ручная корректировка');
      haptic.success();
      onDone();
      if (updated.stockQuantity !== target) Alert.alert('Остаток обновлён', `Сейчас на складе ${updated.stockQuantity} шт.`);
    } catch (error) {
      haptic.error();
      Alert.alert('Остаток не изменён', `${errorText(error)}\n\nПроверьте остаток перед повтором.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Корректировка остатка" onClose={onDone} />
      <ItemLine item={item} />
      <Host matchContents={{ vertical: true }} style={styles.stretch}>
        <Picker
          selection={kind}
          onSelectionChange={(next) => {
            haptic.selection();
            setKind(next as AdjustKind);
            setText('');
          }}
          modifiers={[pickerStyle('segmented')]}>
          <SwiftText modifiers={[tag('delta')]}>Изменить на</SwiftText>
          <SwiftText modifiers={[tag('absolute')]}>Точный остаток</SwiftText>
        </Picker>
      </Host>
      {kind === 'delta' && (
        <View style={styles.row}>
          <GlassChip style={styles.flex} icon="plus" label="Добавить" tint={colors.green} active={sign === 1} onPress={() => setSign(1)} />
          <GlassChip style={styles.flex} icon="minus" label="Убрать" tint={colors.red} active={sign === -1} onPress={() => setSign(-1)} />
        </View>
      )}
      <Display
        text={kind === 'delta' && text ? `${sign > 0 ? '+' : '−'}${text}` : text}
        suffix="шт"
        caption={text ? `было ${item.stockQuantity} → станет ${target} шт` : negative ? 'Сведите минус — введите, сколько есть на самом деле' : `Сейчас ${item.stockQuantity} шт`}
      />
      <Pressable
        onPress={() =>
          promptText('Причина корректировки', 'Попадёт в журнал движений', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Готово', onPress: (v?: string) => setReason(v?.trim() || 'Ручная корректировка') },
          ], 'plain-text', reason)
        }
        accessibilityRole="button">
        <GlassCard style={styles.reason}>
          <SymbolView name="text.bubble" size={16} tintColor={colors.secondaryLabel} />
          <Text style={[type.body, sheetStyles.label, styles.flex]} numberOfLines={1}>
            {reason}
          </Text>
          <SymbolView name="pencil" size={13} tintColor={colors.tertiaryLabel} />
        </GlassCard>
      </Pressable>
      <AmountKeypad value={text} onChange={setText} allowDecimal={false} maxLength={5} />
      <PrimaryButton title={busy ? 'Сохраняем…' : changed ? `Остаток ${target} шт` : 'Применить'} icon="checkmark" busy={busy} disabled={!canSubmit} onPress={() => void submit()} />
    </View>
  );
}

function ParamsForm({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const threshold = thresholdOf(item);
  const [point, setPoint] = useState(threshold > 0 ? String(threshold) : '');
  const [par, setPar] = useState(item.parLevel ? String(item.parLevel) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const reorderPoint = point.trim() ? Math.max(0, Math.round(Number(point))) : null;
    const parLevel = par.trim() ? Math.max(0, Math.round(Number(par))) : null;
    if ((point.trim() && !Number.isFinite(Number(point))) || (par.trim() && !Number.isFinite(Number(par)))) return Alert.alert('Введите целые числа');
    haptic.medium();
    setBusy(true);
    try {
      await setReplenishment(item.id, reorderPoint, parLevel);
      haptic.success();
      onDone();
    } catch (error) {
      haptic.error();
      Alert.alert('Не сохранилось', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Пополнение" onClose={onDone} />
      <ItemLine item={item} />
      <GlassCard style={styles.fields}>
        <FormField icon="bell.badge" value={point} onChange={setPoint} placeholder="Точка заказа — алерт при ≤" keyboardType="number-pad" suffix="шт" autoFocus />
        <View style={sheetStyles.separator} />
        <FormField icon="arrow.up.to.line" value={par} onChange={setPar} placeholder="Целевой запас — дозаказ до" keyboardType="number-pad" suffix="шт" />
      </GlassCard>
      <Text style={[type.footnote, sheetStyles.secondary, styles.hint]}>
        Когда остаток дойдёт до точки заказа, товар попадёт в «Заканчивается» и сотрудникам придёт уведомление.
      </Text>
      <PrimaryButton title={busy ? 'Сохраняем…' : 'Сохранить'} icon="checkmark" busy={busy} onPress={() => void save()} />
    </View>
  );
}

function Display({ text, suffix, caption, warn }: { text: string; suffix: string; caption: string; warn?: boolean }) {
  return (
    <View style={styles.display} accessibilityLiveRegion="polite">
      <View style={styles.valueRow}>
        <RollingText text={text || '0'} style={[styles.value, type.amount, !text && styles.placeholder]} />
        <Text style={[styles.suffix, type.amount]}>{suffix}</Text>
      </View>
      <Text style={[type.subhead, warn ? styles.red : sheetStyles.secondary]} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.lg, gap: space.md },
  loading: { height: 300, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  red: { color: colors.red },
  itemLine: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 48 },
  display: { alignItems: 'center', gap: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  value: { fontSize: 56, lineHeight: 64, color: colors.label },
  placeholder: { color: colors.tertiaryLabel },
  suffix: { fontSize: 28, lineHeight: 64, color: colors.secondaryLabel },
  fields: { paddingHorizontal: space.lg },
  hint: { paddingHorizontal: space.xs },
});
