import { Host, Toggle } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { applyRevision, saveRevisionDraft, useInventory, useRevision, type InventoryItem, type RevisionLineInput } from '@/lib/inventory-api';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type, useAccentHex } from '@/lib/theme';

type Line = { itemId: string; actual: string };

const layout = LinearTransition.springify().damping(24).stiffness(220);
const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>Ревизия</Stack.Title>
        <View style={styles.state}>{draft.isError ? <Text style={[type.body, styles.secondary]}>{draft.error.message}</Text> : <ActivityIndicator />}</View>
      </AmbientBackdrop>
    );
  }

  const initial: Line[] = (draft.data?.revision.draftData?.items ?? []).map((i) => ({ itemId: i.itemId, actual: i.actual === null ? '' : String(i.actual) }));
  return <RevisionEditor draftId={draftId} items={inventory.data} initialLines={initial} />;
}

function RevisionEditor({ draftId, items, initialLines }: { draftId: string | undefined; items: InventoryItem[]; initialLines: Line[] }) {
  const gutter = usePageGutter();
  const router = useRouter();
  const navigation = useNavigation();
  const accent = useAccentHex();
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [query, setQuery] = useState('');
  const [blind, setBlind] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const leaving = useRef(false);

  const byId = new Map(items.map((i) => [i.id, i]));
  const showDiff = !blind || revealed;
  const rows = lines.map((line) => {
    const item = byId.get(line.itemId);
    const actual = line.actual.trim() === '' ? null : Math.max(0, Math.floor(Number(line.actual)));
    const expected = item?.stockQuantity ?? 0;
    const diff = actual === null || Number.isNaN(actual) ? 0 : actual - expected;
    return { line, item, actual: actual !== null && !Number.isNaN(actual) ? actual : null, expected, diff, value: diff * toNumber(item?.costPrice) };
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
    setLines((current) => current.map((l) => (l.itemId === itemId ? { ...l, actual: text.replace(/[^\d]/g, '') } : l)));
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
    Alert.alert(
      'Провести ревизию?',
      `Остатки ${filled.length} ${plural(filled.length, ['позиции', 'позиций', 'позиций'])} станут равны факту, каждое изменение попадёт в журнал склада.`,
      [
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
      ],
    );

  usePreventRemove(dirty && lines.length > 0 && !busy, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    const leave = () => navigation.dispatch(data.action);
    Alert.alert('Ревизия не проведена', 'Сохранить перед выходом?', [
      ...(filled.length > 0 ? [{ text: 'Провести ревизию', onPress: () => void apply().then((id) => id && leave()) }] : []),
      {
        text: 'Сохранить черновик',
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

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{draftId ? 'Черновик ревизии' : 'Новая ревизия'}</Stack.Title>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, gutter]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <GlassCard style={styles.options}>
            <Host matchContents={{ vertical: true }} style={styles.stretch} seedColor={accent}>
              <Toggle
                label="Слепой подсчёт"
                isOn={blind}
                onIsOnChange={(on) => {
                  haptic.selection();
                  setBlind(on);
                  setRevealed(false);
                }}
                modifiers={[tint(accent)]}
              />
            </Host>
            <Text style={[type.footnote, styles.secondary]}>
              {blind ? 'Ожидаемый остаток скрыт — считаете по факту, без подгонки.' : 'Ожидаемый остаток и расхождения видны сразу.'}
            </Text>
          </GlassCard>

          <View style={styles.group}>
            <GlassView style={styles.search}>
              <SymbolView name="plus.magnifyingglass" size={17} tintColor={colors.accent} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Добавить товар в ревизию"
                placeholderTextColor={colors.tertiaryLabel}
                selectionColor={colors.accent}
                autoCorrect={false}
                clearButtonMode="while-editing"
                style={[type.body, styles.searchInput]}
              />
            </GlassView>
            {q.length > 0 && (
              <GlassCard>
                {results.length === 0 ? (
                  <Text style={[type.subhead, styles.secondary, styles.centered, styles.noResults]}>Ничего не найдено или уже в ревизии</Text>
                ) : (
                  results.map((item, index) => (
                    <View key={item.id}>
                      {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                      <Pressable
                        onPress={() => {
                          haptic.selection();
                          setDirty(true);
                          setLines((current) => [{ itemId: item.id, actual: '' }, ...current]);
                          setQuery('');
                        }}
                        style={({ pressed }) => [styles.result, pressed && sheetStyles.pressedRow]}
                        accessibilityRole="button">
                        <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
                        <Text style={[type.body, styles.label, styles.flex]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {!blind && <Text style={[type.footnote, styles.secondary]}>{`склад: ${item.stockQuantity}`}</Text>}
                      </Pressable>
                    </View>
                  ))
                )}
              </GlassCard>
            )}
          </View>

          {lines.length === 0 ? (
            <Text style={[type.subhead, styles.secondary, styles.centered, styles.empty]}>
              Найдите и добавьте товары, которые пересчитываете, — обновятся только они.
            </Text>
          ) : (
            <View style={styles.group}>
              <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`ПОЗИЦИИ · ${lines.length} · ЗАПОЛНЕНО ${filled.length}`}</Text>
              <GlassCard>
                {rows.map((row, index) => (
                  <Animated.View key={row.line.itemId} entering={FadeIn} exiting={FadeOut} layout={layout}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.rowSeparator]} />}
                    <View style={[styles.row, showDiff && row.actual !== null && row.diff !== 0 && { backgroundColor: row.diff > 0 ? 'rgba(52,199,89,0.08)' : 'rgba(255,59,48,0.08)' }]}>
                      <View style={styles.flex}>
                        <Text style={[type.body, styles.label]} numberOfLines={2}>
                          {row.item?.name ?? 'Позиция удалена'}
                        </Text>
                        <Text style={[type.footnote, showDiff && row.actual !== null && row.diff !== 0 ? { color: row.diff > 0 ? colors.green : colors.red } : styles.secondary]}>
                          {!showDiff
                            ? row.actual === null
                              ? 'введите факт'
                              : 'посчитано'
                            : row.actual === null
                              ? `на складе ${row.expected} шт`
                              : row.diff === 0
                                ? `сходится · ${row.expected} шт`
                                : `${row.diff > 0 ? 'Излишек +' : 'Недостача −'}${Math.abs(row.diff)} шт · ${formatMoney(row.value, { sign: true, kopecks: 'auto' })}`}
                        </Text>
                      </View>
                      <TextInput
                        value={row.line.actual}
                        onChangeText={(text) => setActual(row.line.itemId, text)}
                        keyboardType="number-pad"
                        placeholder="Факт"
                        placeholderTextColor={colors.tertiaryLabel}
                        selectionColor={colors.accent}
                        selectTextOnFocus
                        style={[type.headline, type.amount, styles.actual]}
                        accessibilityLabel={`Факт: ${row.item?.name ?? ''}`}
                      />
                      <Pressable
                        onPress={() => {
                          haptic.light();
                          setDirty(true);
                          setLines((current) => current.filter((l) => l.itemId !== row.line.itemId));
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Убрать из ревизии">
                        <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.tertiaryLabel} />
                      </Pressable>
                    </View>
                  </Animated.View>
                ))}
              </GlassCard>
            </View>
          )}

          {showDiff && filled.length > 0 && (
            <GlassCard style={styles.summary}>
              <Text style={[type.footnote, sheetStyles.sectionTitle]}>СВОДКА РАСХОЖДЕНИЙ</Text>
              {surplus.length === 0 && shortage.length === 0 ? (
                <Text style={[type.body, styles.label]}>Расхождений нет — всё сходится</Text>
              ) : (
                <>
                  <SummaryLine label={`Излишек · ${surplus.length} ${plural(surplus.length, ['позиция', 'позиции', 'позиций'])}`} value={surplusValue} color={colors.green} />
                  <SummaryLine label={`Недостача · ${shortage.length} ${plural(shortage.length, ['позиция', 'позиции', 'позиций'])}`} value={-shortageValue} color={colors.red} />
                </>
              )}
            </GlassCard>
          )}

          {lines.length > 0 && (
            <View style={styles.progress}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(filled.length / lines.length) * 100}%` }]} />
              </View>
              <Text style={[type.footnote, styles.secondary]}>{`Заполнено ${filled.length} из ${lines.length}`}</Text>
            </View>
          )}

          {blind && !revealed ? (
            <PrimaryButton
              title={`Показать расхождения · ${filled.length}`}
              icon="eye"
              disabled={filled.length === 0}
              onPress={() => {
                haptic.medium();
                setRevealed(true);
              }}
            />
          ) : (
            <PrimaryButton
              title={busy ? 'Проводим…' : `Провести ревизию · ${filled.length}`}
              icon="checkmark.seal"
              busy={busy}
              disabled={filled.length === 0}
              onPress={confirmApply}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AmbientBackdrop>
  );
}

function SummaryLine({ label, value, color }: { label: string; value: number; color: typeof colors.red }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={[type.body, styles.label, styles.flex]}>{label}</Text>
      <Text style={[type.headline, type.amount, { color }]}>{money(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  options: { padding: space.lg, gap: space.xs },
  group: { gap: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingHorizontal: space.md, borderRadius: 24 },
  searchInput: { flex: 1, color: colors.label, height: 48 },
  noResults: { paddingVertical: space.lg },
  separator: { marginLeft: 52 },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 48 },
  empty: { paddingVertical: space.xxl, paddingHorizontal: space.lg },
  rowSeparator: { marginLeft: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 60 },
  actual: { width: 72, height: 40, borderRadius: 12, backgroundColor: colors.fill, color: colors.label, textAlign: 'center' },
  summary: { padding: space.lg, gap: space.sm },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  progress: { gap: 6, paddingHorizontal: space.xs },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
