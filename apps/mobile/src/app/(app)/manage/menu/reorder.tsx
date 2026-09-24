import { Host, Label, List } from '@expo/ui/swift-ui';
import { environment, foregroundStyle, listStyle, scrollContentBackground } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { categoryHex, categorySymbol, reorderCategories, reorderItems, useMenuAdmin } from '@/lib/catalog-api';
import { haptic } from '@/lib/haptics';
import { space, type } from '@/lib/theme';

type Row = { id: string; title: string; icon: ReturnType<typeof categorySymbol>; color: string };

/** SwiftUI `onMove`: индексы источников и место вставки в исходном массиве. */
function moveRows<T>(list: T[], sources: number[], destination: number): T[] {
  const moving = sources.map((index) => list[index]!);
  const rest = list.filter((_, index) => !sources.includes(index));
  const at = destination - sources.filter((index) => index < destination).length;
  rest.splice(at, 0, ...moving);
  return rest;
}

/**
 * Порядок категорий или позиций категории — системный список iOS в режиме правки:
 * тянете за «ручку» справа, «Сохранить» записывает порядок так, как его увидит касса.
 */
export default function ReorderSheet() {
  const { scope, categoryId } = useLocalSearchParams<{ scope: 'categories' | 'items'; categoryId?: string }>();
  const router = useRouter();
  const menu = useMenuAdmin();
  const data = menu.data;

  if (!data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const ids = new Set(data.categories.map((c) => c.id));
  const rows: Row[] =
    scope === 'categories'
      ? data.categories.map((c) => ({ id: c.id, title: c.name, icon: categorySymbol(c.icon), color: categoryHex(c.color) }))
      : data.items
          .filter((i) => (categoryId === 'none' ? !i.category || !ids.has(i.category) : i.category === categoryId))
          .map((i) => ({ id: i.id, title: i.name, icon: i.isActive ? 'line.3.horizontal' : 'eye.slash', color: '#94A3B8' }));

  return <ReorderList scope={scope} rows={rows} data={data} onClose={() => router.back()} />;
}

function ReorderList({
  scope,
  rows,
  data,
  onClose,
}: {
  scope: 'categories' | 'items';
  rows: Row[];
  data: NonNullable<ReturnType<typeof useMenuAdmin>['data']>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState(rows);
  const [busy, setBusy] = useState(false);
  const changed = order.some((row, index) => row.id !== rows[index]?.id);

  const save = async () => {
    haptic.medium();
    setBusy(true);
    try {
      if (scope === 'categories') {
        // Категория «Тарифы» скрыта из меню — оставляем её в конце, как веб.
        const tariffCats = data.allCategories.filter((c) => !order.some((row) => row.id === c.id));
        await reorderCategories([...order.map((row) => row.id), ...tariffCats.map((c) => c.id)].map((id, index) => ({ id, sortOrder: index })));
      } else {
        // Переставляем только позиции категории, места остальных в общем порядке сохраняются.
        const all = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
        const subset = new Set(order.map((row) => row.id));
        const queue = order.map((row) => row.id);
        const merged = all.map((item) => (subset.has(item.id) ? queue.shift()! : item.id));
        await reorderItems(merged.map((id, index) => ({ id, sortOrder: index })));
      }
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Порядок не сохранён', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
      <View style={styles.header}>
        <SheetHeader title={scope === 'categories' ? 'Порядок категорий' : 'Порядок позиций'} onClose={onClose} />
        <Text style={[type.footnote, sheetStyles.secondary]}>Потяните за полоски справа. Так же порядок увидят касса и планшеты.</Text>
      </View>
      {order.length === 0 ? (
        <Text style={[type.subhead, sheetStyles.secondary, styles.empty]}>Переставлять нечего</Text>
      ) : (
        <Host style={styles.list}>
          <List modifiers={[environment('editMode', 'active'), listStyle('insetGrouped'), scrollContentBackground('hidden')]}>
            <List.ForEach
              onMove={(sources, destination) => {
                haptic.selection();
                setOrder((current) => moveRows(current, sources, destination));
              }}>
              {order.map((row) => (
                <Label key={row.id} title={row.title} systemImage={row.icon} modifiers={[foregroundStyle(row.color)]} />
              ))}
            </List.ForEach>
          </List>
        </Host>
      )}
      <View style={styles.footer}>
        <PrimaryButton title={busy ? 'Сохраняем…' : 'Сохранить порядок'} icon="checkmark" busy={busy} disabled={!changed} onPress={() => void save()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, paddingTop: space.xl, gap: space.sm },
  header: { paddingHorizontal: space.lg, gap: space.sm },
  list: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: space.xxl },
  footer: { paddingHorizontal: space.lg },
});
