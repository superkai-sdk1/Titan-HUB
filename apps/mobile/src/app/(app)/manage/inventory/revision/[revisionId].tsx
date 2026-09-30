import { ContentUnavailableView, Form, HStack, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Tile } from '@/components/analytics/native';
import { InputRow, LinkRow } from '@/components/native-form';
import { ToolbarButton } from '@/components/toolbar';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { correctRevision, useRevision } from '@/lib/inventory-api';
import { colors } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Проведённая ревизия: ожидалось, внесено, расхождения в штуках и рублях. Последнюю ревизию
 * можно поправить — текущий остаток сдвинется на разницу, движения после ревизии сохранятся.
 */
export default function RevisionScreen() {
  const { revisionId } = useLocalSearchParams<{ revisionId: string }>();
  const revision = useRevision(revisionId);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Сброс правок пересоздаёт поля — иначе они держат введённый текст.
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const data = revision.data;

  if (!data) {
    return (
      <>
        <Stack.Title>Ревизия</Stack.Title>
        <Host style={{ flex: 1 }} useViewportSizeMeasurement>
          {revision.isError ? <ContentUnavailableView title="Ревизия не загрузилась" systemImage="wifi.exclamationmark" description={revision.error.message} /> : <ProgressView />}
        </Host>
      </>
    );
  }

  const editable = data.revision.isLatest && data.revision.status === 'applied';
  const rows = data.items.map((item) => {
    const edited = (edits[item.id] ?? '').replace(/[^\d]/g, '');
    const actual = edited !== '' ? Math.max(0, Math.floor(Number(edited))) : item.actual;
    const diff = actual - item.expected;
    return { item, actual, diff, value: diff * toNumber(item.costPrice), changed: edited !== '' && actual !== item.actual };
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
              setVersion((v) => v + 1);
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

  const status = (row: (typeof rows)[number]) =>
    row.diff === 0
      ? `ожидалось ${row.item.expected} · сходится`
      : `ожидалось ${row.item.expected} · ${row.diff > 0 ? 'излишек +' : 'недостача −'}${Math.abs(row.diff)} шт · ${formatMoney(row.value, { sign: true, kopecks: 'auto' })}`;

  return (
    <>
      <Stack.Title>Ревизия</Stack.Title>
      {editable && changes.length > 0 && (
        <Stack.Toolbar placement="right">
          <ToolbarButton variant="done" tintColor={colors.accent} disabled={busy} onPress={apply}>
            {busy ? 'Пересчёт…' : `Применить · ${changes.length}`}
          </ToolbarButton>
        </Stack.Toolbar>
      )}
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section
            footer={
              <Text>
                {editable
                  ? 'Факт можно поправить: текущий остаток сдвинется на разницу, движения после ревизии сохранятся.'
                  : 'Только просмотр: корректировать можно лишь последнюю ревизию (открытый черновик тоже считается более новым).'}
              </Text>
            }>
            <LinkRow
              icon={editable ? 'checklist' : 'lock.fill'}
              color={editable ? '#F59E0B' : '#8E8E93'}
              title={longDate.format(new Date(data.revision.createdAt))}
              subtitle={`${data.items.length} ${plural(data.items.length, ['позиция', 'позиции', 'позиций'])}${data.revision.author ? ` · провёл ${data.revision.author}` : ''}`}
            />
            <HStack spacing={12}>
              <Tile label="Излишек" value={surplus < 0.005 ? '0 ₽' : formatMoney(surplus, { sign: true, kopecks: 'auto' })} />
              <Tile label="Недостача" value={shortage < 0.005 ? '0 ₽' : money(-shortage)} />
            </HStack>
          </Section>

          <Section title="Позиции" footer={editable ? <Text>Справа — внесённый факт. Исправьте число, и в шапке появится «Применить».</Text> : undefined}>
            {rows.map((row) =>
              editable ? (
                <InputRow
                  key={`${row.item.id}-${version}`}
                  label={row.item.name}
                  caption={status(row)}
                  captionColor={row.diff === 0 ? undefined : row.diff > 0 ? colors.green : colors.red}
                  value={String(row.item.actual)}
                  keyboard="numeric"
                  maxLength={6}
                  onChange={(text) => setEdits((current) => ({ ...current, [row.item.id]: text }))}
                />
              ) : (
                <LinkRow
                  key={row.item.id}
                  title={row.item.name}
                  subtitle={status(row)}
                  value={`${row.actual} шт`}
                  valueColor={row.diff === 0 ? undefined : row.diff > 0 ? colors.green : colors.red}
                />
              ),
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}
