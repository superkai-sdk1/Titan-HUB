import { ContentUnavailableView, Form, HStack, Picker, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { RecipeSection } from '@/components/goods/recipe-section';
import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, InputRow, primary, secondary } from '@/components/native-form';
import { isTariffCategory } from '@/lib/catalog-api';
import { formatMoney } from '@/lib/format';
import {
  BIG_UNIT,
  UNIT_CHOICES,
  UNIT_LABEL,
  createItem,
  deleteItem,
  formatQty,
  margin,
  numberText,
  parseDecimal,
  updateItem,
  useGoods,
  type Catalog,
  type GoodsItem,
  type ItemInput,
  type StockMode,
  type Unit,
} from '@/lib/goods-api';
import { baseQuantity, draftLineOf, useDocDraft } from '@/lib/goods-draft';
import { haptic } from '@/lib/haptics';
import { useSpaces, type Space } from '@/lib/pos-api';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
const text = (n: number | null | undefined, factor = 1) => (n ? numberText(n / factor) : '');
/** Пустое поле — null, иначе целое в базовой единице. */
const toBase = (value: string, factor: number) => {
  const n = parseDecimal(value);
  return n === null || n === 0 ? null : Math.round(n * factor);
};

const MODES: { mode: StockMode; title: string }[] = [
  { mode: 'none', title: 'Не учитывать' },
  { mode: 'pieces', title: 'Штуками' },
  { mode: 'recipe', title: 'По составу' },
];

/**
 * Редактор позиции меню или сырья. Позиция: название, цена, категория, где её продают и
 * как учитывать на складе — не учитывать, штуками или по составу (техкарта). Сырьё:
 * название, единица, точка заказа. Остаток здесь не меняется — только документами.
 */
export default function GoodsEditScreen() {
  const { itemId, categoryId, kind } = useLocalSearchParams<{ itemId?: string; categoryId?: string; kind?: string }>();
  const goods = useGoods();
  const spaces = useSpaces();

  if (!goods.data) {
    return (
      <FormHost>
        {goods.isError ? (
          <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={errorText(goods.error)} />
        ) : (
          <ProgressView />
        )}
      </FormHost>
    );
  }
  const original = itemId ? (goods.data.byId.get(itemId) ?? null) : null;
  if (itemId && !original) {
    return (
      <FormHost>
        <ContentUnavailableView title="Позиция удалена" systemImage="trash" />
      </FormHost>
    );
  }
  if (original?.kind === 'ingredient' || (!original && kind === 'ingredient')) return <IngredientForm key={original?.id ?? 'new'} original={original} />;
  return <ItemForm key={original?.id ?? 'new'} original={original} presetCategory={categoryId ?? null} catalog={goods.data} spaces={spaces.data ?? []} />;
}

function useRemove(original: GoodsItem | null) {
  const router = useRouter();
  return () =>
    original &&
    Alert.alert(
      `Удалить «${original.name}»?`,
      original.kind === 'ingredient' ? 'Сырьё пропадёт из остатков и составов.' : 'Позиция исчезнет из меню и кассы. Прошлые чеки сохранятся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () =>
            deleteItem(original.id)
              .then(() => {
                haptic.success();
                router.dismissTo('/manage/goods');
              })
              .catch((error: unknown) => Alert.alert('Не удалено', errorText(error))),
        },
      ],
    );
}

function ItemForm({
  original,
  presetCategory,
  catalog,
  spaces,
}: {
  original: GoodsItem | null;
  presetCategory: string | null;
  catalog: Catalog;
  spaces: Space[];
}) {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const remove = useRemove(original);
  const draftKey = original?.id ?? 'new';
  const recipeReady = useDocDraft((s) => s.mode === 'recipe' && s.productId === draftKey);

  const [name, setName] = useState(original?.name ?? '');
  const [price, setPrice] = useState(original ? numberText(original.price, 2) : '');
  const [cost, setCost] = useState(original && original.costPrice > 0 ? numberText(Math.round(original.costPrice * 100) / 100, 2) : '');
  const [costTouched, setCostTouched] = useState(false);
  const [category, setCategory] = useState<string | null>(original ? original.category : presetCategory);
  const [flags, setFlags] = useState({
    isActive: original?.isActive ?? true,
    isTabletVisible: original?.isTabletVisible ?? false,
    isScreenVisible: original?.isScreenVisible ?? true,
    isTop: original?.isTop ?? false,
  });
  const [mode, setMode] = useState<StockMode>(original?.stockMode ?? 'none');
  const [reorder, setReorder] = useState(text(original?.reorderPoint));
  const [par, setPar] = useState(text(original?.parLevel));
  const [tags, setTags] = useState((original?.searchTags ?? []).join(', '));
  const [spaceId, setSpaceId] = useState<string | null>(original?.linkedSpaceId ?? null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  // Состав — в общем черновике: шторка «Добавить ингредиент» дописывает его туда же.
  useEffect(() => {
    const lines = (original?.recipe ?? []).map((line) =>
      draftLineOf('recipe', catalog.byId.get(line.componentId) ?? null, { itemId: line.componentId, quantity: line.quantity }),
    );
    useDocDraft.getState().start('recipe', lines, draftKey);
    // Начальный состав берём один раз, при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = catalog.categories.filter((c) => !isTariffCategory(c));
  const priceValue = parseDecimal(price);
  const costValue = parseDecimal(cost);
  const costEditable = mode === 'none' || (mode === 'pieces' && !original?.hasReceipts);
  const shownCost = mode === 'recipe' ? null : costEditable ? (costValue ?? 0) : (original?.costPrice ?? 0);
  const m = priceValue !== null && shownCost !== null ? margin(priceValue, shownCost) : null;
  const canSave = name.trim().length > 0 && priceValue !== null && (!costEditable || cost.trim() === '' || costValue !== null);

  const save = async () => {
    const lines = useDocDraft.getState().lines;
    if (mode === 'recipe' && (lines.length === 0 || lines.some((l) => baseQuantity(l) <= 0))) {
      setShowErrors(true);
      haptic.error();
      Alert.alert(
        'Проверьте состав',
        lines.length === 0 ? 'Добавьте хотя бы один ингредиент или выберите другой учёт.' : 'Укажите, сколько каждого ингредиента уходит на порцию.',
      );
      return;
    }
    const input: ItemInput = {
      name: name.trim(),
      price: priceValue ?? 0,
      category,
      ...flags,
      searchTags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      stockMode: mode,
      ...(mode === 'recipe' ? { recipe: lines.map((l) => ({ componentId: l.itemId!, quantity: baseQuantity(l) })) } : {}),
      ...(mode === 'pieces' ? { reorderPoint: toBase(reorder, 1), parLevel: toBase(par, 1) } : {}),
      ...(costEditable && costTouched && costValue !== null ? { costPrice: costValue } : {}),
      ...(spaceId !== (original?.linkedSpaceId ?? null) ? { linkedSpaceId: spaceId } : {}),
    };
    haptic.medium();
    setBusy(true);
    try {
      if (original) await updateItem(original.id, input);
      else await createItem('goods', input);
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Позиция не сохранена', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const stockLeft = original && original.stockMode === 'pieces' && mode !== 'pieces' && original.stockQuantity !== 0;
  const modeFooter =
    mode === 'pieces'
      ? 'Продажа спишет одну штуку. Когда остаток дойдёт до точки заказа, позиция попадёт в «Заканчивается».'
      : mode === 'recipe'
        ? 'Продажа спишет со склада ингредиенты состава, а себестоимость посчитается по ним.'
        : 'Продажи не трогают склад: для услуг, кальяна без табака на учёте, напитков из-под крана.';

  return (
    <>
      <EditorToolbar title={original ? 'Позиция' : 'Новая позиция'} canSave={canSave} busy={busy} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section title="Название">
            <FieldRow value={name} placeholder="Например, Капучино" autoFocus={!original} maxLength={120} onChange={setName} />
          </Section>

          <Section
            title="Цена"
            footer={
              <Text>
                {m !== null
                  ? `Маржа ${m}% · ${money((priceValue ?? 0) - (shownCost ?? 0))} с продажи.`
                  : mode === 'recipe'
                    ? 'Себестоимость посчитается по составу.'
                    : costEditable
                      ? 'Себестоимость нужна для маржи; с первым приходом её начнёт считать склад.'
                      : 'Себестоимость — средняя по приходам, её меняет новый приход.'}
              </Text>
            }
          >
            <HStack spacing={8}>
              <Text modifiers={[primary]}>Цена</Text>
              <FieldRow value={price} placeholder="0" keyboard="decimal-pad" trailing onChange={setPrice} />
              <Text modifiers={[secondary]}>₽</Text>
            </HStack>
            {costEditable ? (
              <HStack spacing={8}>
                <Text modifiers={[primary]}>Себестоимость</Text>
                <FieldRow
                  value={cost}
                  placeholder="0"
                  keyboard="decimal-pad"
                  trailing
                  onChange={(next) => {
                    setCost(next);
                    setCostTouched(true);
                  }}
                />
                <Text modifiers={[secondary]}>₽</Text>
              </HStack>
            ) : null}
          </Section>

          <Section title="Где продаётся" footer={<Text>В Titan Home позицию видно, если её категория тоже показана гостям.</Text>}>
            <Picker
              label="Категория"
              selection={category ?? 'none'}
              onSelectionChange={(value) => setCategory(value === 'none' ? null : String(value))}
              modifiers={[pickerStyle('menu')]}
            >
              {[{ id: 'none', name: 'Без категории' }, ...categories].map((c) => (
                <Text key={c.id} modifiers={[tag(c.id)]}>
                  {c.name}
                </Text>
              ))}
            </Picker>
            <Toggle label="В кассе" isOn={flags.isActive} onIsOnChange={(on) => setFlags((f) => ({ ...f, isActive: on }))} />
            <Toggle label="В Titan Home" isOn={flags.isTabletVisible} onIsOnChange={(on) => setFlags((f) => ({ ...f, isTabletVisible: on }))} />
            <Toggle label="На экране ТВ" isOn={flags.isScreenVisible} onIsOnChange={(on) => setFlags((f) => ({ ...f, isScreenVisible: on }))} />
            <Toggle label="Хит продаж" isOn={flags.isTop} onIsOnChange={(on) => setFlags((f) => ({ ...f, isTop: on }))} />
          </Section>

          <Section
            title="Учёт на складе"
            footer={
              <Text>{stockLeft ? `${modeFooter} На складе ещё ${formatQty(original.stockQuantity, original.unit)} — их можно списать.` : modeFooter}</Text>
            }
          >
            <Picker
              selection={mode}
              onSelectionChange={(value) => {
                haptic.selection();
                setMode(value as StockMode);
              }}
              modifiers={[pickerStyle('segmented')]}
            >
              {MODES.map((choice) => (
                <Text key={choice.mode} modifiers={[tag(choice.mode)]}>
                  {choice.title}
                </Text>
              ))}
            </Picker>
            {mode === 'pieces' ? (
              <>
                <InputRow
                  label="Точка заказа"
                  caption="Предупредить, когда останется столько"
                  value={reorder}
                  placeholder="—"
                  keyboard="numeric"
                  maxLength={6}
                  onChange={setReorder}
                />
                <InputRow
                  label="Дозаказ до"
                  caption="Сколько держать после прихода"
                  value={par}
                  placeholder="—"
                  keyboard="numeric"
                  maxLength={6}
                  onChange={setPar}
                />
              </>
            ) : null}
          </Section>

          {mode === 'recipe' && recipeReady ? <RecipeSection catalog={catalog} price={priceValue ?? 0} showErrors={showErrors} /> : null}

          <Section title="Поиск в кассе" footer={<Text>Через запятую: касса найдёт позицию и по этим словам.</Text>}>
            <FieldRow value={tags} placeholder="кола, газировка" onChange={setTags} />
          </Section>

          {spaces.length > 0 && (original?.role === 'rental' || !original) ? (
            <Section footer={<Text>Для аренды: касса свяжет позицию с зоной.</Text>}>
              <Picker
                label="Зона аренды"
                selection={spaceId ?? 'none'}
                onSelectionChange={(value) => setSpaceId(value === 'none' ? null : String(value))}
                modifiers={[pickerStyle('menu')]}
              >
                {[{ id: 'none', name: 'Не привязана' }, ...spaces].map((s) => (
                  <Text key={s.id} modifiers={[tag(s.id)]}>
                    {s.name}
                  </Text>
                ))}
              </Picker>
            </Section>
          ) : null}

          {original && isOwner && (
            <Section>
              <ActionRow title="Удалить позицию" icon="trash" destructive onPress={() => remove()} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}

function IngredientForm({ original }: { original: GoodsItem | null }) {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const remove = useRemove(original);
  const [name, setName] = useState(original?.name ?? '');
  const [unit, setUnit] = useState<Unit>(original?.unit ?? 'g');
  const factor = BIG_UNIT[unit].factor;
  const [cost, setCost] = useState(
    original && original.costPrice > 0 ? numberText(Math.round(original.costPrice * BIG_UNIT[original.unit].factor * 100) / 100, 2) : '',
  );
  const [costTouched, setCostTouched] = useState(false);
  const [reorder, setReorder] = useState(text(original?.reorderPoint, BIG_UNIT[original?.unit ?? 'g'].factor));
  const [par, setPar] = useState(text(original?.parLevel, BIG_UNIT[original?.unit ?? 'g'].factor));
  const [busy, setBusy] = useState(false);

  // Единицу меняем, пока по сырью не было движений (иначе остаток потерял бы смысл).
  const unitLocked = !!original && (original.hasReceipts || original.stockQuantity !== 0);
  const costEditable = !original?.hasReceipts;
  const costValue = parseDecimal(cost);
  const canSave = name.trim().length > 0 && (!costEditable || cost.trim() === '' || costValue !== null);
  const big = BIG_UNIT[unit].label;

  const save = async () => {
    const input: ItemInput = {
      name: name.trim(),
      ...(unitLocked ? {} : { unit }),
      reorderPoint: toBase(reorder, factor),
      parLevel: toBase(par, factor),
      ...(costEditable && costTouched && costValue !== null ? { costPrice: Math.round((costValue / factor) * 10000) / 10000 } : {}),
    };
    haptic.medium();
    setBusy(true);
    try {
      if (original) await updateItem(original.id, input);
      else await createItem('ingredient', input);
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Сырьё не сохранено', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <EditorToolbar title={original ? 'Сырьё' : 'Новое сырьё'} canSave={canSave} busy={busy} onSave={() => void save()} />
      <FormHost>
        <Form>
          <Section title="Название" footer={<Text>Сырьё не продаётся само — его списывают продажи позиций, в чьём составе оно есть.</Text>}>
            <FieldRow value={name} placeholder="Например, Молоко 3,2%" autoFocus={!original} maxLength={120} onChange={setName} />
          </Section>

          <Section
            title="Единица учёта"
            footer={
              <Text>
                {unitLocked
                  ? 'По сырью уже были движения — единицу не поменять.'
                  : 'Остаток ведётся целым числом в этой единице, а показывается в килограммах и литрах.'}
              </Text>
            }
          >
            {unitLocked ? (
              <HStack>
                <Text modifiers={[primary]}>{UNIT_CHOICES.find((c) => c.unit === unit)?.title ?? UNIT_LABEL[unit]}</Text>
              </HStack>
            ) : (
              <Picker selection={unit} onSelectionChange={(value) => setUnit(value as Unit)} modifiers={[pickerStyle('segmented')]}>
                {UNIT_CHOICES.map((choice) => (
                  <Text key={choice.unit} modifiers={[tag(choice.unit)]}>
                    {choice.title}
                  </Text>
                ))}
              </Picker>
            )}
          </Section>

          <Section title="Запас" footer={<Text>{`В ${big}. Когда останется меньше точки заказа, сырьё попадёт в «Заканчивается».`}</Text>}>
            <InputRow label="Точка заказа" value={reorder} placeholder="—" keyboard="decimal-pad" maxLength={8} onChange={setReorder} />
            <InputRow label="Дозаказ до" value={par} placeholder="—" keyboard="decimal-pad" maxLength={8} onChange={setPar} />
          </Section>

          {costEditable ? (
            <Section title="Себестоимость" footer={<Text>Только до первого прихода — дальше её считает склад по ценам приходов.</Text>}>
              <InputRow
                label={`Цена за ${big}`}
                value={cost}
                placeholder="0"
                keyboard="decimal-pad"
                onChange={(next) => {
                  setCost(next);
                  setCostTouched(true);
                }}
              />
            </Section>
          ) : null}

          {original && isOwner && (
            <Section>
              <ActionRow title="Удалить сырьё" icon="trash" destructive onPress={() => remove()} />
            </Section>
          )}
        </Form>
      </FormHost>
    </>
  );
}
