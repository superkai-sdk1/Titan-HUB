import { Button, Section, SwipeActions, Text } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';

import { DocLineRow, NumberInput } from '@/components/goods/parts';
import { ActionRow } from '@/components/native-form';
import { formatMoney } from '@/lib/format';
import { UNIT_LABEL, formatQty, margin, type Catalog } from '@/lib/goods-api';
import { baseQuantity, useDocDraft } from '@/lib/goods-draft';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });

/**
 * Состав порции в редакторе позиции: ингредиент, сколько уходит на порцию (в граммах,
 * миллилитрах или штуках) и во что обходится. Строки — в общем черновике состава, чтобы
 * шторка «Добавить ингредиент» дописывала их сюда же.
 */
export function RecipeSection({ catalog, price, showErrors }: { catalog: Catalog; price: number; showErrors: boolean }) {
  const router = useRouter();
  const lines = useDocDraft((s) => s.lines);
  const setText = useDocDraft((s) => s.setText);
  const remove = useDocDraft((s) => s.remove);

  const cost = lines.reduce((sum, line) => sum + baseQuantity(line) * (catalog.byId.get(line.itemId ?? '')?.costPrice ?? 0), 0);
  const m = margin(price, cost);
  const footer = lines.length
    ? `Порция ≈ ${money(cost)}${m !== null ? ` · маржа ${m}%` : ''}. Продажа позиции спишет этот состав со склада.`
    : 'Например, капучино: 18 г зёрен, 150 мл молока, 1 стакан. Продажа спишет их со склада, а себестоимость посчитается сама.';

  return (
    <Section title="Состав порции" footer={<Text>{footer}</Text>}>
      {lines.map((line) => {
        const component = line.itemId ? catalog.byId.get(line.itemId) : undefined;
        const qty = baseQuantity(line);
        const invalid = showErrors && qty <= 0;
        return (
          <SwipeActions key={line.key}>
            <DocLineRow
              title={line.name}
              caption={
                invalid ? 'Укажите, сколько уходит на порцию' : component ? `на складе ${formatQty(component.stockQuantity, component.unit)}` : undefined
              }
              captionColor={invalid ? '#F43F5E' : undefined}
              total={component && qty > 0 ? money(qty * component.costPrice) : undefined}
              fields={
                <NumberInput
                  key={`${line.key}-${line.version}`}
                  label={`${line.name}, на порцию`}
                  value={line.qty}
                  integer
                  invalid={invalid}
                  suffix={`${UNIT_LABEL[line.unit]} на порцию`}
                  onChange={(text) => setText(line.key, 'qty', text)}
                />
              }
            />
            <SwipeActions.Actions edge="trailing">
              <Button role="destructive" label="Убрать" systemImage="minus.circle" onPress={() => remove(line.key)} />
            </SwipeActions.Actions>
          </SwipeActions>
        );
      })}
      <ActionRow
        title="Добавить ингредиент"
        icon="plus.circle.fill"
        onPress={() => router.push({ pathname: '/manage/goods/pick', params: { mode: 'recipe' } })}
      />
    </Section>
  );
}
