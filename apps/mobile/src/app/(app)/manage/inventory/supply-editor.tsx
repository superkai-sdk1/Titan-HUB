import { ContentUnavailableView, Form, HStack, Host, ProgressView, Section, Spacer, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { ActionRow, FieldRow, InputRow, LinkRow, primary, secondary } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { chooseAction } from '@/lib/dialog';
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
import { newIdempotencyKey, parseAmount } from '@/lib/shift-api';
import { colors, useAccentHex } from '@/lib/theme';

type Mode = 'create' | 'draft' | 'correct';
/** `version` пересоздаёт поля строки, когда значение подставлено извне (выбор товара, прошлая цена). */
type Line = { key: string; itemId: string | null; name: string; qty: string; price: string; lastPrice: number | null; version: number };

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
let lineSeq = 0;
const newLine = (partial: Partial<Line> = {}): Line => ({ key: `line-${++lineSeq}`, itemId: null, name: '', qty: '1', price: '', lastPrice: null, version: 0, ...partial });
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
      <>
        <Stack.Title>Закупка</Stack.Title>
        <Host style={{ flex: 1 }} useViewportSizeMeasurement>
          {source.isError ? <ContentUnavailableView title="Закупка не загрузилась" systemImage="wifi.exclamationmark" description={source.error.message} /> : <ProgressView />}
        </Host>
      </>
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
  const router = useRouter();
  const navigation = useNavigation();
  const accent = useAccentHex();
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
      Alert.alert(mode === 'correct' && reason.trim().length < 3 ? 'Укажите причину корректировки' : 'Проверьте позиции', 'Ошибки подписаны под позициями.');
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

  const pick = async (line: Line, itemId: string, name: string) => {
    haptic.selection();
    update(line.key, { itemId, name, version: line.version + 1 });
    setActiveKey(null);
    const last = await fetchLastSupplyPrice(itemId);
    setLines((current) =>
      current.map((l) => (l.key === line.key ? { ...l, lastPrice: last, ...(!l.price && last !== null ? { price: numberText(last), version: l.version + 1 } : {}) } : l)),
    );
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
    <>
      <Stack.Title>{title}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="done" tintColor={colors.accent} disabled={busy} onPress={() => void submit().then((ok) => ok && exit())}>
          {busy ? 'Сохраняем…' : mode === 'correct' ? 'Сохранить' : 'Провести'}
        </ToolbarButton>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          {parsed.map(({ line, qty, price, sum, error }, index) => {
            const suggestions = suggestionsFor(line);
            const priceDiff = line.lastPrice !== null && price > 0 ? round2(price - line.lastPrice) : 0;
            const notes = [
              priceDiff !== 0 ? `${priceDiff > 0 ? 'Подорожало' : 'Подешевело'} на ${money(Math.abs(priceDiff))} с прошлой закупки (было ${money(line.lastPrice ?? 0)}).` : null,
              showErrors && error ? error : null,
            ].filter(Boolean);
            return (
              <Section
                key={line.key}
                title={`Позиция ${index + 1}${line.itemId ? ' · товар склада' : ''}`}
                footer={notes.length ? <Text modifiers={showErrors && error ? [foregroundStyle(colors.red)] : undefined}>{notes.join(' ')}</Text> : undefined}>
                <FieldRow
                  key={`${line.key}-name-${line.version}`}
                  value={line.name}
                  placeholder="Товар со склада или название затраты"
                  onChange={(text) => {
                    setActiveKey(line.key);
                    update(line.key, { name: text, itemId: null, lastPrice: null });
                  }}
                />
                {suggestions.map((item) => (
                  <LinkRow
                    key={item.id}
                    icon="shippingbox.fill"
                    color={accent}
                    title={item.name}
                    value={item.trackStock ? `${item.stockQuantity} шт` : undefined}
                    chevron={false}
                    onPress={() => void pick(line, item.id, item.name)}
                  />
                ))}
                <InputRow
                  key={`${line.key}-qty-${line.version}`}
                  label="Количество"
                  value={line.qty}
                  placeholder="0"
                  keyboard={line.itemId ? 'numeric' : 'decimal-pad'}
                  onChange={(text) => update(line.key, { qty: text })}
                />
                <InputRow key={`${line.key}-price-${line.version}`} label="Цена за единицу, ₽" value={line.price} placeholder="0" keyboard="decimal-pad" onChange={(text) => update(line.key, { price: text })} />
                <HStack>
                  <Text modifiers={[secondary]}>Сумма</Text>
                  <Spacer />
                  <Text modifiers={[primary, monospacedDigit(), font({ weight: 'semibold' })]}>{qty > 0 && price > 0 ? money(sum) : '—'}</Text>
                </HStack>
                {lines.length > 1 ? (
                  <ActionRow
                    title="Убрать позицию"
                    icon="minus.circle"
                    destructive
                    onPress={() => {
                      setDirty(true);
                      setLines((current) => current.filter((l) => l.key !== line.key));
                    }}
                  />
                ) : null}
              </Section>
            );
          })}

          <Section>
            <ActionRow
              title="Добавить позицию"
              icon="plus.circle"
              onPress={() => {
                setDirty(true);
                setLines((current) => [...current, newLine()]);
              }}
            />
          </Section>

          {mode === 'correct' && (
            <Section title="Причина корректировки" footer={showErrors && reason.trim().length < 3 ? <Text modifiers={[foregroundStyle(colors.red)]}>Не короче 3 символов.</Text> : undefined}>
              <FieldRow
                value={reason}
                placeholder="Например: ошиблись в количестве"
                multiline
                onChange={(text) => {
                  setDirty(true);
                  setReason(text);
                }}
              />
            </Section>
          )}

          <Section footer={mode !== 'correct' ? <Text>Товары со склада придут в остаток, их себестоимость пересчитается по средней.</Text> : undefined}>
            <HStack>
              <Text modifiers={[primary, font({ weight: 'semibold' })]}>Итого по закупке</Text>
              <Spacer />
              <Text modifiers={[primary, monospacedDigit(), font({ textStyle: 'title3', weight: 'bold', design: 'rounded' })]}>{money(total)}</Text>
            </HStack>
          </Section>
        </Form>
      </Host>
    </>
  );
}
