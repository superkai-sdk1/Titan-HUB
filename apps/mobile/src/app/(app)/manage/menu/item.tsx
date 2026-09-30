import { ContentUnavailableView, Form, HStack, Host, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, primary, secondary } from '@/components/native-form';
import { deleteMenuItem, saveMenuItem, useMenuAdmin, type AdminMenuItem } from '@/lib/catalog-api';
import { formatMoney, moneyText, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSpaces, type MenuCategory, type Space } from '@/lib/pos-api';
import { useSession } from '@/lib/session';
import { parseAmount } from '@/lib/shift-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Flags = { isActive: boolean; isTop: boolean; isService: boolean; trackStock: boolean; isTabletVisible: boolean };

const FLAGS: { key: keyof Flags; label: string }[] = [
  { key: 'isActive', label: 'Показывать в кассе' },
  { key: 'isTop', label: 'Хит продаж' },
  { key: 'isService', label: 'Услуга' },
  { key: 'trackStock', label: 'Учёт остатков' },
  { key: 'isTabletVisible', label: 'На планшете кабинки' },
];

/** Позиция меню: цена и себестоимость с маржой, категория, зона, теги и признаки. */
export default function MenuItemSheet() {
  const { itemId, categoryId } = useLocalSearchParams<{ itemId?: string; categoryId?: string }>();
  const menu = useMenuAdmin();
  const spaces = useSpaces();

  if (!menu.data || (itemId && !menu.data.items.some((i) => i.id === itemId))) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {menu.isError ? <ContentUnavailableView title="Меню не загрузилось" systemImage="wifi.exclamationmark" description={errorText(menu.error)} /> : <ProgressView />}
      </Host>
    );
  }

  const original = itemId ? (menu.data.items.find((i) => i.id === itemId) ?? null) : null;
  return <ItemForm key={original?.id ?? 'new'} original={original} presetCategory={categoryId ?? null} categories={menu.data.categories} spaces={spaces.data ?? []} />;
}

function ItemForm({ original, presetCategory, categories, spaces }: { original: AdminMenuItem | null; presetCategory: string | null; categories: MenuCategory[]; spaces: Space[] }) {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [name, setName] = useState(original?.name ?? '');
  const [price, setPrice] = useState(original ? moneyText(original.price) : '');
  const [cost, setCost] = useState(original && toNumber(original.costPrice) > 0 ? moneyText(original.costPrice) : '');
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

  const priceParsed = price.trim() ? parseAmount(price) : 0;
  const costParsed = cost.trim() ? parseAmount(cost) : 0;
  const priceValue = priceParsed ?? 0;
  const costValue = costParsed ?? 0;
  const margin = priceValue > 0 && costValue > 0 ? Math.round(((priceValue - costValue) / priceValue) * 100) : null;
  const canSave = name.trim().length > 0 && priceParsed !== null && costParsed !== null;

  const save = async () => {
    if (!canSave) return;
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
      router.back();
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
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Позиция не удалена', errorText(error))),
      },
    ]);

  const priceFooter =
    priceParsed === null || costParsed === null
      ? 'Проверьте суммы.'
      : margin !== null
        ? `Маржа ${margin}% · ${formatMoney(priceValue - costValue, { kopecks: 'auto' })} с продажи.`
        : 'Себестоимость нужна для маржи. На складе она пересчитывается по закупкам.';

  return (
    <>
      <EditorToolbar title={original ? 'Позиция' : 'Новая позиция'} canSave={canSave} busy={busy} onSave={() => void save()} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section title="Название">
            <FieldRow value={name} placeholder="Например, Капучино" autoFocus={!original} maxLength={120} onChange={setName} />
          </Section>

          <Section title="Цена" footer={<Text>{priceFooter}</Text>}>
            <HStack spacing={8}>
              <Text modifiers={[primary]}>Цена</Text>
              <FieldRow value={price} placeholder="0" keyboard="decimal-pad" trailing onChange={setPrice} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
            <HStack spacing={8}>
              <Text modifiers={[primary]}>Себестоимость</Text>
              <FieldRow value={cost} placeholder="0" keyboard="decimal-pad" trailing onChange={setCost} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
          </Section>

          <Section title="Где в меню" footer={spaces.length > 0 ? <Text>{original?.linkedSpaceId ? 'Привязку к зоне можно сменить на другую зону, но не снять.' : 'Зона — для позиций аренды: касса свяжет позицию с зоной.'}</Text> : undefined}>
            <Picker label="Категория" selection={category ?? 'none'} onSelectionChange={(value) => setCategory(value === 'none' ? null : String(value))} modifiers={[pickerStyle('menu')]}>
              <Text modifiers={[tag('none')]}>Без категории</Text>
              {categories.map((c) => (
                <Text key={c.id} modifiers={[tag(c.id)]}>
                  {c.name}
                </Text>
              ))}
            </Picker>
            {spaces.length > 0 && (
              <Picker label="Зона" selection={spaceId ?? 'none'} onSelectionChange={(value) => setSpaceId(value === 'none' ? null : String(value))} modifiers={[pickerStyle('menu')]}>
                {!original?.linkedSpaceId ? <Text modifiers={[tag('none')]}>Не привязана</Text> : null}
                {spaces.map((s) => (
                  <Text key={s.id} modifiers={[tag(s.id)]}>
                    {s.name}
                  </Text>
                ))}
              </Picker>
            )}
          </Section>

          <Section title="Теги поиска" footer={<Text>Через запятую: касса найдёт позицию и по ним.</Text>}>
            <FieldRow value={tags} placeholder="кола, газировка" onChange={setTags} />
          </Section>

          <Section
            title="Признаки"
            footer={
              <Text>
                {`Услуга — без физического остатка. Учёт остатков — касса списывает со склада.${original?.trackStock ? ` На складе ${original.stockQuantity} шт.` : ''} Остаток меняется только закупками, ревизиями и списаниями в «Складе».`}
              </Text>
            }>
            {FLAGS.map((flag) => (
              <Toggle key={flag.key} label={flag.label} isOn={flags[flag.key]} onIsOnChange={(on) => setFlags((current) => ({ ...current, [flag.key]: on }))} />
            ))}
          </Section>

          {original && isOwner && (
            <Section>
              <ActionRow title="Удалить позицию" icon="trash" destructive onPress={remove} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
