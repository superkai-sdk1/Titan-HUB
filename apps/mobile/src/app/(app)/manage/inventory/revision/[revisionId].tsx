import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { correctRevision, useRevision } from '@/lib/inventory-api';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Проведённая ревизия: ожидалось, внесено, расхождения в штуках и рублях. Последнюю ревизию
 * можно поправить — текущий остаток сдвинется на разницу, движения после ревизии сохранятся.
 */
export default function RevisionScreen() {
  const gutter = usePageGutter();
  const { revisionId } = useLocalSearchParams<{ revisionId: string }>();
  const revision = useRevision(revisionId);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const data = revision.data;

  if (!data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>Ревизия</Stack.Title>
        <View style={styles.state}>{revision.isError ? <Text style={[type.body, styles.secondary]}>{revision.error.message}</Text> : <ActivityIndicator />}</View>
      </AmbientBackdrop>
    );
  }

  const editable = data.revision.isLatest && data.revision.status === 'applied';
  const rows = data.items.map((item) => {
    const edited = edits[item.id];
    const actual = edited !== undefined && edited !== '' ? Math.max(0, Math.floor(Number(edited))) : item.actual;
    const diff = actual - item.expected;
    return { item, actual, diff, value: diff * toNumber(item.costPrice), changed: edited !== undefined && edited !== '' && actual !== item.actual };
  });
  const changes = rows.filter((r) => r.changed);
  const surplus = rows.filter((r) => r.diff > 0).reduce((s, r) => s + r.value, 0);
  const shortage = rows.filter((r) => r.diff < 0).reduce((s, r) => s - r.value, 0);

  const apply = () =>
    Alert.alert(
      'Пересчитать остатки?',
      `${changes.length} ${plural(changes.length, ['правка', 'правки', 'правок'])}. Текущие остатки изменятся на разницу между новым и прежним фактом.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Применить',
          style: 'destructive',
          onPress: async () => {
            haptic.medium();
            setBusy(true);
            try {
              const result = await correctRevision(data.revision.id, changes.map((r) => ({ id: r.item.id, actual: r.actual })));
              haptic.success();
              setEdits({});
              Alert.alert(
                'Остатки пересчитаны',
                result.map((c) => `${c.name}: ${c.from} → ${c.to}${c.stockDelta !== c.to - c.from ? ` (остаток ${c.stockDelta >= 0 ? '+' : ''}${c.stockDelta})` : ''}`).join('\n') || 'Изменений нет',
              );
            } catch (error) {
              haptic.error();
              Alert.alert('Правки не применены', errorText(error));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Ревизия</Stack.Title>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, gutter]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={styles.hero}>
            <Text style={[type.title3, styles.label]}>{longDate.format(new Date(data.revision.createdAt))}</Text>
            <Text style={[type.subhead, styles.secondary]}>{`${data.items.length} ${plural(data.items.length, ['позиция', 'позиции', 'позиций'])}${data.revision.author ? ` · провёл ${data.revision.author}` : ''}`}</Text>
          </View>

          <GlassCard style={styles.info}>
            <SymbolView name={editable ? 'pencil.and.list.clipboard' : 'lock.fill'} size={18} tintColor={editable ? colors.accent : colors.secondaryLabel} />
            <Text style={[type.footnote, styles.secondary, styles.flex]}>
              {editable
                ? 'Факт можно поправить: текущий остаток сдвинется на разницу, движения после ревизии сохранятся.'
                : 'Только просмотр: корректировать можно лишь последнюю ревизию (открытый черновик тоже считается более новым).'}
            </Text>
          </GlassCard>

          <GlassCard style={styles.summary}>
            <Text style={[type.footnote, sheetStyles.sectionTitle]}>СВОДКА РАСХОЖДЕНИЙ</Text>
            {surplus < 0.005 && shortage < 0.005 ? (
              <Text style={[type.body, styles.label]}>Расхождений нет</Text>
            ) : (
              <>
                <View style={styles.summaryLine}>
                  <Text style={[type.body, styles.label, styles.flex]}>Излишек</Text>
                  <Text style={[type.headline, type.amount, styles.green]}>{formatMoney(surplus, { sign: surplus > 0, kopecks: 'auto' })}</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={[type.body, styles.label, styles.flex]}>Недостача</Text>
                  <Text style={[type.headline, type.amount, styles.red]}>{money(-shortage)}</Text>
                </View>
              </>
            )}
          </GlassCard>

          <GlassCard>
            {rows.map((row, index) => (
              <View key={row.item.id}>
                {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={[type.body, styles.label]} numberOfLines={2}>
                      {row.item.name}
                    </Text>
                    <Text style={[type.footnote, styles.secondary]}>{`ожидалось ${row.item.expected} · внесено ${row.item.actual}`}</Text>
                    {row.diff !== 0 && (
                      <Text style={[type.footnote, row.diff > 0 ? styles.green : styles.red]}>
                        {`${row.diff > 0 ? 'Излишек +' : 'Недостача −'}${Math.abs(row.diff)} шт · ${formatMoney(row.value, { sign: true, kopecks: 'auto' })}`}
                      </Text>
                    )}
                  </View>
                  <TextInput
                    value={edits[row.item.id] ?? String(row.item.actual)}
                    onChangeText={(text) => setEdits((current) => ({ ...current, [row.item.id]: text.replace(/[^\d]/g, '') }))}
                    editable={editable}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    selectionColor={colors.accent}
                    style={[type.headline, type.amount, styles.actual, row.changed && styles.actualChanged, !editable && styles.actualLocked]}
                    accessibilityLabel={`Факт: ${row.item.name}`}
                  />
                </View>
              </View>
            ))}
          </GlassCard>

          {editable && changes.length > 0 && (
            <PrimaryButton title={busy ? 'Пересчитываем…' : `Применить правки · ${changes.length}`} icon="arrow.triangle.2.circlepath" busy={busy} onPress={apply} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  green: { color: colors.green },
  red: { color: colors.red },
  hero: { alignItems: 'center', gap: 2, paddingTop: space.sm },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  summary: { padding: space.lg, gap: space.sm },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  separator: { marginLeft: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 64 },
  actual: { width: 72, height: 40, borderRadius: 12, backgroundColor: colors.fill, color: colors.label, textAlign: 'center' },
  actualChanged: { backgroundColor: 'rgba(139,92,246,0.22)' },
  actualLocked: { color: colors.secondaryLabel },
});
