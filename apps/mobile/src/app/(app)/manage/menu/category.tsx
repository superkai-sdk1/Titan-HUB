import { ColorPicker, Form, HStack, Label, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { font, lineLimit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, normalizeHex, primary, RowIcon } from '@/components/native-form';
import { CATEGORY_PRESETS, categoryHex, categorySymbol, deleteCategory, saveCategory, useMenuAdmin } from '@/lib/catalog-api';
import { haptic } from '@/lib/haptics';
import type { MenuCategory } from '@/lib/pos-api';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Категория меню: название, значок из набора веб-кассы, цвет и видимость в Titan Home. */
export default function MenuCategorySheet() {
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const menu = useMenuAdmin();

  if (categoryId && !menu.data) {
    return (
      <FormHost>
        <ProgressView />
      </FormHost>
    );
  }
  const original = categoryId ? (menu.data?.categories.find((c) => c.id === categoryId) ?? null) : null;
  return <CategoryForm key={original?.id ?? 'new'} original={original} />;
}

function CategoryForm({ original }: { original: MenuCategory | null }) {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [name, setName] = useState(original?.name ?? '');
  const [icon, setIcon] = useState(original?.icon && CATEGORY_PRESETS.some((p) => p.id === original.icon) ? original.icon : 'food');
  const [color, setColor] = useState(original ? categoryHex(original.color) : '#10B981');
  const [colorTouched, setColorTouched] = useState(!!original);
  const [tablet, setTablet] = useState(original?.isTabletVisible ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    haptic.medium();
    setBusy(true);
    try {
      await saveCategory(original?.id ?? null, { name, icon, color, isTabletVisible: tablet });
      haptic.success();
      router.back();
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
              router.dismissTo('/manage/menu');
            })
            .catch((error: unknown) => Alert.alert('Категория не удалена', errorText(error))),
      },
    ]);

  return (
    <>
      <EditorToolbar title={original ? 'Категория' : 'Новая категория'} canSave={name.trim().length > 0} busy={busy} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section>
            <HStack spacing={14}>
              <RowIcon name={categorySymbol(icon)} color={color} />
              <Text modifiers={[font({ textStyle: 'headline' }), primary, lineLimit(1)]}>{name.trim() || 'Название категории'}</Text>
            </HStack>
          </Section>

          <Section title="Название">
            <FieldRow value={name} placeholder="Например, Горячие напитки" autoFocus={!original} maxLength={60} onChange={setName} />
          </Section>

          <Section footer={<Text>Значок подставляет свой цвет, пока цвет не выбран вручную.</Text>}>
            <Picker
              label="Значок"
              selection={icon}
              onSelectionChange={(value) => {
                const preset = CATEGORY_PRESETS.find((p) => p.id === value);
                setIcon(String(value));
                if (preset && !colorTouched) setColor(preset.color);
                if (preset && !name.trim()) setName(preset.label);
              }}
              modifiers={[pickerStyle('menu')]}>
              {CATEGORY_PRESETS.map((preset) => (
                <Label key={preset.id} title={preset.label} systemImage={categorySymbol(preset.id)} modifiers={[tag(preset.id)]} />
              ))}
            </Picker>
            <ColorPicker
              label="Цвет"
              selection={color}
              supportsOpacity={false}
              onSelectionChange={(next) => {
                setColor(normalizeHex(next, color));
                setColorTouched(true);
              }}
            />
          </Section>

          <Section footer={<Text>Категория видна гостям в меню кабинки.</Text>}>
            <Toggle label="Показывать в Titan Home" isOn={tablet} onIsOnChange={setTablet} />
          </Section>

          {original && isOwner && (
            <Section>
              <ActionRow title="Удалить категорию" icon="trash" destructive onPress={remove} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
