import { ContentUnavailableView, Form, Host, Picker, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditorToolbar } from '@/components/editor-toolbar';
import { createTierRule, discountValueText, useDiscounts } from '@/lib/admin-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Скидка по статусу клиента: выбираем статус и готовую скидку из списка. */
export default function TierRuleSheet() {
  const router = useRouter();
  const tiers = useClientTiers();
  const discounts = useDiscounts();
  const [tier, setTier] = useState<string | null>(null);
  const [discountId, setDiscountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const available = (discounts.data ?? []).filter((d) => d.isActive);

  const save = async () => {
    if (!tier || !discountId) return;
    haptic.medium();
    setBusy(true);
    try {
      await createTierRule(tier, discountId);
      haptic.success();
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert('Правило не создано', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <EditorToolbar title="Скидка для статуса" canSave={!!tier && !!discountId} busy={busy} saveLabel="Добавить" onSave={() => void save()} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section title="Статус клиента" footer={<Text>Клиент с этим статусом получит скидку в кассе автоматически.</Text>}>
            <Picker selection={tier} onSelectionChange={(value) => setTier(String(value))} modifiers={[pickerStyle('inline')]}>
              {(tiers.data ?? []).map((row) => (
                <Text key={row.key} modifiers={[tag(row.key)]}>
                  {tierLook(row.key, tiers.data).label}
                </Text>
              ))}
            </Picker>
          </Section>

          <Section title="Скидка">
            {available.length === 0 ? (
              <ContentUnavailableView title="Скидок нет" systemImage="percent" description="Сначала создайте скидку в разделе «Лояльность»." />
            ) : (
              <Picker selection={discountId} onSelectionChange={(value) => setDiscountId(String(value))} modifiers={[pickerStyle('inline')]}>
                {available.map((d) => (
                  <Text key={d.id} modifiers={[tag(d.id)]}>
                    {`${d.name} · ${discountValueText(d)}`}
                  </Text>
                ))}
              </Picker>
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}
