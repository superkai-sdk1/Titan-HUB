import { Host, Toggle } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { DangerRow, GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { CATEGORY_PRESETS, categoryHex, categorySymbol, deleteCategory, PALETTE, saveCategory, useMenuAdmin } from '@/lib/catalog-api';
import { haptic } from '@/lib/haptics';
import type { MenuCategory } from '@/lib/pos-api';
import { useSession } from '@/lib/session';
import { space, type, useAccentHex } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Категория меню: название, значок из набора веб-кассы, цвет и видимость на планшетах. */
export default function MenuCategorySheet() {
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const router = useRouter();
  const menu = useMenuAdmin();

  if (categoryId && !menu.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return <CategoryForm original={categoryId ? (menu.data?.categories.find((c) => c.id === categoryId) ?? null) : null} onClose={() => router.back()} onDeleted={() => router.dismissTo('/manage/menu')} />;
}

function CategoryForm({ original, onClose, onDeleted }: { original: MenuCategory | null; onClose: () => void; onDeleted: () => void }) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [name, setName] = useState(original?.name ?? '');
  const [icon, setIcon] = useState(original?.icon && CATEGORY_PRESETS.some((p) => p.id === original.icon) ? original.icon : 'food');
  const [color, setColor] = useState(original ? categoryHex(original.color) : '#10B981');
  const [colorTouched, setColorTouched] = useState(!!original);
  const [tablet, setTablet] = useState(original?.isTabletVisible ?? true);
  const [busy, setBusy] = useState(false);

  const colors6 = [...new Set([color, ...CATEGORY_PRESETS.filter((p) => p.id === icon).map((p) => p.color), ...PALETTE])].slice(0, 10);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Укажите название');
    haptic.medium();
    setBusy(true);
    try {
      await saveCategory(original?.id ?? null, { name, icon, color, isTabletVisible: tablet });
      haptic.success();
      onClose();
    } catch (error) {
      haptic.error();
      Alert.alert('Категория не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    original &&
    Alert.alert(`Удалить «${original.name}»?`, 'Позиции категории останутся — без категории.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteCategory(original.id)
            .then(() => {
              haptic.success();
              onDeleted();
            })
            .catch((error: unknown) => Alert.alert('Категория не удалена', errorText(error))),
      },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <SheetHeader title={original ? 'Категория' : 'Новая категория'} onClose={onClose} />

        <View style={styles.preview}>
          <View style={[styles.previewIcon, { backgroundColor: color }]}>
            <SymbolView name={categorySymbol(icon)} size={30} weight="semibold" tintColor="white" />
          </View>
          <Text style={[type.headline, sheetStyles.label]}>{name.trim() || 'Название категории'}</Text>
        </View>

        <FormSection title="НАЗВАНИЕ">
          <GlassCard style={styles.card}>
            <FormField icon="folder" value={name} onChange={setName} placeholder="Например, Горячие напитки" autoCapitalize="sentences" autoFocus={!original} />
          </GlassCard>
        </FormSection>

        <FormSection title="ЗНАЧОК">
          <View style={styles.grid}>
            {CATEGORY_PRESETS.map((preset) => {
              const active = icon === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  style={styles.cell}
                  onPress={() => {
                    haptic.selection();
                    setIcon(preset.id);
                    if (!colorTouched) setColor(preset.color);
                    if (!name.trim()) setName(preset.label);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={preset.label}
                  accessibilityState={{ selected: active }}>
                  <GlassView isInteractive tintColor={active ? `${preset.color}55` : undefined} style={styles.iconTile}>
                    <SymbolView name={categorySymbol(preset.id)} size={20} tintColor={preset.color} />
                    <Text style={[type.caption2, sheetStyles.label]} numberOfLines={1}>
                      {preset.label}
                    </Text>
                  </GlassView>
                </Pressable>
              );
            })}
          </View>
        </FormSection>

        <FormSection title="ЦВЕТ">
          <View style={styles.palette}>
            {colors6.map((hex) => (
              <Pressable
                key={hex}
                onPress={() => {
                  haptic.selection();
                  setColor(hex);
                  setColorTouched(true);
                }}
                style={[styles.swatch, { backgroundColor: hex }, color === hex && styles.swatchActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: color === hex }}>
                {color === hex && <SymbolView name="checkmark" size={14} weight="bold" tintColor="white" />}
              </Pressable>
            ))}
          </View>
        </FormSection>

        <GlassCard style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text style={[type.body, sheetStyles.label]}>Показывать на планшетах</Text>
              <Text style={[type.caption1, sheetStyles.secondary]}>Категория видна гостям в меню кабинки</Text>
            </View>
            <Host matchContents seedColor={accent}>
              <Toggle
                isOn={tablet}
                onIsOnChange={(on) => {
                  haptic.selection();
                  setTablet(on);
                }}
                modifiers={[tint(accent)]}
              />
            </Host>
          </View>
        </GlassCard>

        <PrimaryButton title={busy ? 'Сохраняем…' : original ? 'Сохранить' : 'Создать категорию'} icon="checkmark" busy={busy} disabled={!name.trim()} onPress={() => void save()} />
        {original && isOwner && (
          <DangerRow title="Удалить категорию" icon="trash" onPress={remove} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  preview: { alignItems: 'center', gap: space.sm },
  previewIcon: { width: 64, height: 64, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  card: { paddingHorizontal: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '23.3%', flexGrow: 1 },
  iconTile: { alignItems: 'center', gap: 4, paddingVertical: space.sm, paddingHorizontal: 4, borderRadius: 16, borderCurve: 'continuous' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.xs },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60 },
});
