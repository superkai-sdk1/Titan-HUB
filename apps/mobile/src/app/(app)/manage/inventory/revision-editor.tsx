import { Button, ContentUnavailableView, Form, HStack, Host, ProgressView, Section, SwipeActions, Text, Toggle } from '@expo/ui/swift-ui';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { Tile } from '@/components/analytics/native';
import { ActionRow, InputRow, LinkRow, SearchRow } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { chooseAction } from '@/lib/dialog';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { applyRevision, saveRevisionDraft, useInventory, useRevision, type InventoryItem, type RevisionLineInput } from '@/lib/inventory-api';
import { colors, useAccentHex } from '@/lib/theme';

type Line = { itemId: string; actual: string };

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const positions = (n: number) => `${n} ${plural(n, ['позиция', 'позиции', 'позиций'])}`;

/**
 * Ревизия: добавляете товары, вводите фактический остаток. По умолчанию подсчёт слепой —
 * ожидаемое скрыто, пока не нажмёте «Показать расхождения». Проводятся только заполненные
 * позиции; остатки остальных не меняются.
 */
export default function RevisionEditorScreen() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const draft = useRevision(draftId);
  const inventory = useInventory();

  if ((draftId && !draft.data) || !inventory.data) {
    const error = draft.error ?? inventory.error;
    return (
      <>
        <Stack.Title>Ревизия</Stack.Title>
        <Host style={{ flex: 1 }} useViewportSizeMeasurement>
          {error ? <ContentUnavailableView title="Не загрузилось" systemImage="wifi.exclamationmark" description={error.message} /> : <ProgressView />}
        </Host>
      </>
    );
  }

  const initial: Line[] = (draft.data?.revision.draftData?.items ?? []).map((i) => ({ itemId: i.itemId, actual: i.actual === null ? '' : String(i.actual) }));
  return <RevisionEditor draftId={draftId} items={inventory.data} initialLines={initial} />;
}

function RevisionEditor({ draftId, items, initialLines }: { draftId: string | undefined; items: InventoryItem[]; initialLines: Line[] }) {
  const router = useRouter();
  const navigation = useNavigation();
  const accent = useAccentHex();
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [query, setQuery] = useState('');
  // Добавление товара очищает строку поиска — её пересоздаём.
  const [searchVersion, setSearchVersion] = useState(0);
  const [blind, setBlind] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const leaving = useRef(false);

  const byId = new Map(items.map((i) => [i.id, i]));
  const showDiff = !blind || revealed;
  const rows = lines.map((line) => {
    const item = byId.get(line.itemId);
    const digits = line.actual.replace(/[^\d]/g, '');
    const actual = digits === '' ? null : Math.max(0, Math.floor(Number(digits)));
    const expected = item?.stockQuantity ?? 0;
    const diff = actual === null ? 0 : actual - expected;
    return { line, item, actual, expected, diff, value: diff * toNumber(item?.costPrice) };
  });
  const filled = rows.filter((r) => r.actual !== null);
  const surplus = filled.filter((r) => r.diff > 0);
  const shortage = filled.filter((r) => r.diff < 0);
  const surplusValue = surplus.reduce((s, r) => s + r.value, 0);
  const shortageValue = shortage.reduce((s, r) => s - r.value, 0);

  const q = query.trim().toLowerCase();
  const inList = new Set(lines.map((l) => l.itemId));
  const results = q ? items.filter((i) => i.trackStock && !inList.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, 8) : [];

  const payload: RevisionLineInput[] = rows.map((r) => ({ itemId: r.line.itemId, actual: r.actual }));

  const setActual = (itemId: string, text: string) => {
    setDirty(true);
    setLines((current) => current.map((l) => (l.itemId === itemId ? { ...l, actual: text } : l)));
  };

  const add = (item: InventoryItem) => {
    haptic.selection();
    setDirty(true);
    setLines((current) => [{ itemId: item.id, actual: '' }, ...current]);
    setQuery('');
    setSearchVersion((v) => v + 1);
  };

  const remove = (itemId: string) => {
    setDirty(true);
    setLines((current) => current.filter((l) => l.itemId !== itemId));
  };

  const apply = async (): Promise<string | null> => {
    haptic.medium();
    setBusy(true);
    try {
      const id = await applyRevision(draftId, payload);
      haptic.success();
      return id;
    } catch (error) {
      haptic.error();
      Alert.alert('Ревизия не проведена', `${errorText(error)}\n\nОстатки не изменились.`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const confirmApply = () =>
    Alert.alert('Провести ревизию?', `Остатки ${filled.length} ${plural(filled.length, ['позиции', 'позиций', 'позиций'])} станут равны факту, каждое изменение попадёт в журнал склада.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Провести',
        onPress: () =>
          void apply().then((id) => {
            if (!id) return;
            leaving.current = true;
            router.replace({ pathname: '/manage/inventory/revision/[revisionId]', params: { revisionId: id } });
          }),
      },
    ]);

  usePreventRemove(dirty && lines.length > 0 && !busy, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    const leave = () => navigation.dispatch(data.action);
    chooseAction('Ревизия не проведена', 'Сохранить перед выходом?', [
      ...(filled.length > 0 ? [{ text: 'Провести ревизию', icon: 'checkmark.seal', onPress: () => void apply().then((id) => id && leave()) }] : []),
      {
        text: 'Сохранить черновик',
        icon: 'tray.and.arrow.down',
        onPress: () =>
          void saveRevisionDraft(draftId, payload)
            .then(() => {
              haptic.success();
              leave();
            })
            .catch((error: unknown) => Alert.alert('Черновик не сохранён', errorText(error))),
      },
      { text: 'Не сохранять', style: 'destructive' as const, onPress: leave },
      { text: 'Остаться', style: 'cancel' as const },
    ]);
  });

  const status = (row: (typeof rows)[number]): { text: string; color?: typeof colors.red } => {
    if (!showDiff) return { text: row.actual === null ? 'введите факт' : 'посчитано' };
    if (row.actual === null) return { text: `на складе ${row.expected} шт` };
    if (row.diff === 0) return { text: `сходится · ${row.expected} шт` };
    return {
      text: `${row.diff > 0 ? 'излишек +' : 'недостача −'}${Math.abs(row.diff)} шт · ${formatMoney(row.value, { sign: true, kopecks: 'auto' })}`,
      color: row.diff > 0 ? colors.green : colors.red,
    };
  };

  return (
    <>
      <Stack.Title>{draftId ? 'Черновик ревизии' : 'Новая ревизия'}</Stack.Title>
      <Stack.Toolbar placement="right">
        {blind && !revealed ? (
          <ToolbarButton
            disabled={filled.length === 0}
            onPress={() => {
              haptic.medium();
              setRevealed(true);
            }}>
            Сверить
          </ToolbarButton>
        ) : (
          <ToolbarButton variant="done" tintColor={colors.accent} disabled={filled.length === 0 || busy} onPress={confirmApply}>
            {busy ? 'Проводим…' : 'Провести'}
          </ToolbarButton>
        )}
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement seedColor={accent}>
        <Form>
          <Section footer={<Text>{blind ? 'Ожидаемый остаток скрыт — считаете по факту, без подгонки. Расхождения откроет «Сверить».' : 'Ожидаемый остаток и расхождения видны сразу.'}</Text>}>
            <Toggle
              label="Слепой подсчёт"
              isOn={blind}
              onIsOnChange={(on) => {
                haptic.selection();
                setBlind(on);
                setRevealed(false);
              }}
            />
          </Section>

          <Section title="Добавить товар" footer={lines.length === 0 ? <Text>Найдите товары, которые пересчитываете, — обновятся только они.</Text> : undefined}>
            <SearchRow key={`search-${searchVersion}`} placeholder="Название товара" onChange={setQuery} />
            {q.length > 0 &&
              (results.length === 0 ? (
                <Text>Ничего не найдено или уже в ревизии</Text>
              ) : (
                results.map((item) => (
                  <LinkRow
                    key={item.id}
                    icon="plus"
                    color={accent}
                    title={item.name}
                    value={blind ? undefined : `склад: ${item.stockQuantity}`}
                    chevron={false}
                    onPress={() => add(item)}
                  />
                ))
              ))}
          </Section>

          {lines.length > 0 && (
            <Section title={`Позиции · ${lines.length} · заполнено ${filled.length}`} footer={<Text>Справа — сколько есть по факту. Смахните строку влево, чтобы убрать её из ревизии.</Text>}>
              {rows.map((row) => {
                const s = status(row);
                return (
                  <SwipeActions key={row.line.itemId}>
                    <InputRow
                      label={row.item?.name ?? 'Позиция удалена'}
                      caption={s.text}
                      captionColor={s.color}
                      value={row.line.actual}
                      placeholder="Факт"
                      keyboard="numeric"
                      maxLength={6}
                      onChange={(text) => setActual(row.line.itemId, text)}
                    />
                    <SwipeActions.Actions edge="trailing">
                      <Button role="destructive" label="Убрать" systemImage="minus.circle" onPress={() => remove(row.line.itemId)} />
                    </SwipeActions.Actions>
                  </SwipeActions>
                );
              })}
            </Section>
          )}

          {showDiff && filled.length > 0 && (
            <Section title="Сводка расхождений" footer={surplus.length === 0 && shortage.length === 0 ? <Text>Расхождений нет — всё сходится.</Text> : undefined}>
              <HStack spacing={12}>
                <Tile label={`Излишек · ${positions(surplus.length)}`} value={formatMoney(surplusValue, { sign: surplusValue > 0, kopecks: 'auto' })} />
                <Tile label={`Недостача · ${positions(shortage.length)}`} value={money(-shortageValue)} />
              </HStack>
            </Section>
          )}

          {blind && !revealed && filled.length > 0 && (
            <Section>
              <ActionRow
                title={`Показать расхождения · ${filled.length}`}
                icon="eye"
                onPress={() => {
                  haptic.medium();
                  setRevealed(true);
                }}
              />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
