import { Host, Toggle } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { DangerRow, GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { categoryHex, categorySymbol, deleteMenuItem, saveMenuItem, useMenuAdmin, type AdminMenuItem } from '@/lib/catalog-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { useSpaces, type MenuCategory, type Space } from '@/lib/pos-api';
import { useSession } from '@/lib/session';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Flags = { isActive: boolean; isTop: boolean; isService: boolean; trackStock: boolean; isTabletVisible: boolean };

const FLAGS: { key: keyof Flags; label: string; hint: string }[] = [
  { key: 'isActive', label: 'Активна', hint: 'Показывается в меню кассы' },
  { key: 'isTop', label: 'Хит продаж', hint: 'Попадает в «Популярное»' },
  { key: 'isService', label: 'Услуга', hint: 'Без физического остатка' },
  { key: 'trackStock', label: 'Учёт остатков', hint: 'Касса списывает со склада' },
  { key: 'isTabletVisible', label: 'На планшете', hint: 'Видно гостям в меню кабинки' },
];

/** Позиция меню: цена и себестоимость с маржой, категория, зона, теги и признаки. */
export default function MenuItemSheet() {
  const { itemId, categoryId } = useLocalSearchParams<{ itemId?: string; categoryId?: string }>();
  const router = useRouter();
  const menu = useMenuAdmin();
  const spaces = useSpaces();

  if (!menu.data || (itemId && !menu.data.items.some((i) => i.id === itemId))) {
    return <View style={styles.loading}>{menu.isError ? <Text style={[type.body, sheetStyles.secondary]}>{errorText(menu.error)}</Text> : <ActivityIndicator />}</View>;
  }

  return (
    <ItemForm
      original={itemId ? (menu.data.items.find((i) => i.id === itemId) ?? null) : null}
      presetCategory={categoryId ?? null}
      categories={menu.data.categories}
      spaces={spaces.data ?? []}
      onClose={() => router.back()}
    />
  );
}

function ItemForm({
  original,
  presetCategory,
  categories,
  spaces,
  onClose,
}: {
  original: AdminMenuItem | null;
  presetCategory: string | null;
  categories: MenuCategory[];
  spaces: Space[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [name, setName] = useState(original?.name ?? '');
  const [price, setPrice] = useState(original ? String(toNumber(original.price)).replace('.', ',') : '');
  const [cost, setCost] = useState(original && toNumber(original.costPrice) > 0 ? String(toNumber(original.costPrice)).replace('.', ',') : '');
  const [category, setCategory] = useState<string | null>(original ? original.category : presetCategory);
  const [spaceId, setSpaceId] = useState<string | null>(original?.linkedSpaceId ?? null);
  const [tags, setTags] = useState((original?.searchTags ?? []).join(', '));
  const [flags, setFlags] = useState<Flags>({
    isActive: original?.isActive ?? true,
    isTop: original?.isTop ?? false,
    isService: original?.isService ?? false,
    trackStock: original?.trackStock ?? false,
    isTabletVisible: original?.isTabletVisible ?? false,
  });
  const [busy, setBusy] = useState(false);

  const priceValue = parseAmount(price) ?? 0;
  const costValue = parseAmount(cost) ?? 0;
  const margin = priceValue > 0 && costValue > 0 ? Math.round(((priceValue - costValue) / priceValue) * 100) : null;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Укажите название');
    if (price.trim() && parseAmount(price) === null) return Alert.alert('Проверьте цену');
    if (cost.trim() && parseAmount(cost) === null) return Alert.alert('Проверьте себестоимость');
    haptic.medium();
    setBusy(true);
    try {
      await saveMenuItem(original, {
        name,
        price: priceValue,
        costPrice: costValue,
        category,
        linkedSpaceId: spaceId,
        searchTags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        ...flags,
      });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Позиция не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.name}»?`, 'Позиция исчезнет из меню и кассы. Прошлые чеки сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteMenuItem(original.id)
            .then(() => {
              haptic.success();
              onClose();
            })
            .catch((error: unknown) => Alert.alert('Позиция не удалена', errorText(error))),
      },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS}
        showsVerticalScrollIndicator={false}>
        <SheetHeader title={original ? 'Позиция' : 'Новая позиция'} onClose={onClose} />

        <FormSection title="НАЗВАНИЕ И ЦЕНА" footer={margin !== null ? `Маржа ${margin}% · ${formatMoney(priceValue - costValue, { kopecks: 'auto' })} с продажи` : 'Себестоимость нужна для маржи. На складе она пересчитывается по закупкам.'}>
          <GlassCard style={styles.card}>
            <FormField icon="cup.and.saucer" value={name} onChange={setName} placeholder="Название *" autoCapitalize="sentences" autoFocus={!original} />
            <View style={sheetStyles.separator} />
            <FormField icon="rublesign" value={price} onChange={setPrice} placeholder="Цена" keyboardType="decimal-pad" suffix="₽" />
            <View style={sheetStyles.separator} />
            <FormField icon="shippingbox" value={cost} onChange={setCost} placeholder="Себестоимость" keyboardType="decimal-pad" suffix="₽" />
          </GlassCard>
        </FormSection>

        <FormSection title="КАТЕГОРИЯ">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent} keyboardShouldPersistTaps="handled">
            <GlassChip label="Без категории" active={category === null} onPress={() => setCategory(null)} />
            {categories.map((c) => (
              <GlassChip
                key={c.id}
                label={c.name}
                icon={categorySymbol(c.icon)}
                tint={categoryHex(c.color)}
                active={category === c.id}
                onPress={() => {
                  haptic.selection();
                  setCategory(c.id);
                }}
              />
            ))}
          </ScrollView>
        </FormSection>

        {spaces.length > 0 && (
          <FormSection title="ПРИВЯЗКА К ЗОНЕ" footer={original?.linkedSpaceId ? 'Привязку можно сменить на другую зону, но не снять — так устроен сервер.' : 'Для позиций аренды: касса свяжет позицию с зоной.'}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent} keyboardShouldPersistTaps="handled">
              {!original?.linkedSpaceId && <GlassChip label="Не привязана" active={spaceId === null} onPress={() => setSpaceId(null)} />}
              {spaces.map((s) => (
                <GlassChip
                  key={s.id}
                  label={s.name}
                  icon="square.split.bottomrightquarter"
                  active={spaceId === s.id}
                  onPress={() => {
                    haptic.selection();
                    setSpaceId(s.id);
                  }}
                />
              ))}
            </ScrollView>
          </FormSection>
        )}

        <FormSection title="ТЕГИ ПОИСКА" footer="Через запятую: касса найдёт позицию и по ним.">
          <GlassCard style={styles.card}>
            <FormField icon="tag" value={tags} onChange={setTags} placeholder="кола, газировка" />
          </GlassCard>
        </FormSection>

        <FormSection title="ПРИЗНАКИ">
          <GlassCard style={styles.card}>
            {FLAGS.map((flag, index) => (
              <View key={flag.key}>
                {index > 0 && <View style={sheetStyles.separator} />}
                <View style={styles.flagRow}>
                  <View style={styles.flex}>
                    <Text style={[type.body, sheetStyles.label]}>{flag.label}</Text>
                    <Text style={[type.caption1, sheetStyles.secondary]}>{flag.hint}</Text>
                  </View>
                  <Host matchContents seedColor={accent}>
                    <Toggle
                      isOn={flags[flag.key]}
                      onIsOnChange={(on) => {
                        haptic.selection();
                        setFlags((current) => ({ ...current, [flag.key]: on }));
                      }}
                      modifiers={[tint(accent)]}
                    />
                  </Host>
                </View>
              </View>
            ))}
          </GlassCard>
        </FormSection>

        <GlassCard style={styles.stockNote}>
          <SymbolView name="info.circle" size={18} tintColor={colors.secondaryLabel} />
          <Text style={[type.footnote, sheetStyles.secondary, styles.flex]}>
            {original?.trackStock ? `На складе ${original.stockQuantity} шт. ` : ''}Остаток меняется только закупками, ревизиями и списаниями в «Складе».
          </Text>
        </GlassCard>

        <PrimaryButton title={busy ? 'Сохраняем…' : original ? 'Сохранить' : 'Добавить позицию'} icon="checkmark" busy={busy} disabled={!name.trim()} onPress={() => void save()} />
        {original && isOwner && (
          <DangerRow title="Удалить позицию" icon="trash" onPress={remove} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
  chips: { flexGrow: 0, flexShrink: 0, height: 44, marginHorizontal: -space.lg },
  chipsContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  stockNote: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
});
