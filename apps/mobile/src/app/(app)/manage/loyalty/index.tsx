import { ContentUnavailableView, Form, Host, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { ActionRow, LinkRow } from '@/components/native-form';
import { useSettingsEditor } from '@/components/settings-parts';
import { deleteTierRule, discountValueText, setTierRuleActive, useCertificates, useDiscounts, useTierRules } from '@/lib/admin-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Лояльность — как раздел «Настроек» iOS: скидки и скидки по статусам прямо здесь,
 * бонусная программа и подарочные сертификаты — отдельными экранами. Раньше всё жило
 * на трёх вкладках, и нужное приходилось искать.
 */
export default function LoyaltyScreen() {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const discounts = useDiscounts();
  const rules = useTierRules();
  const tiers = useClientTiers();
  const certificates = useCertificates();
  const settings = useSettingsEditor();

  const refresh = async () => {
    await Promise.allSettled([discounts.refetch(), rules.refetch(), certificates.refetch(), settings.refetch()]);
  };

  const ruleActions = (ruleId: string, title: string, isActive: boolean) =>
    Alert.alert(title, undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: isActive ? 'Выключить' : 'Включить',
        onPress: () =>
          void setTierRuleActive(ruleId, !isActive)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Правило не изменено', errorText(error))),
      },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void deleteTierRule(ruleId)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Правило не удалено', errorText(error))),
      },
    ]);

  // Сервер включает бонусы, пока не записано 'false' (settings['bonus_enabled'] !== 'false').
  const bonusOn = settings.flag('bonus_enabled', true);
  const activeCertificates = (certificates.data ?? []).filter((c) => c.status === 'active').length;
  const list = discounts.data ?? [];

  return (
    <>
      <Stack.Title>Лояльность</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(refresh)]}>
          <Section>
            {isOwner && (
              <LinkRow
                icon="star.circle.fill"
                color="#FF9500"
                title="Бонусная программа"
                subtitle={bonusOn ? `${settings.number('bonus_accrual_rate', 5)}% от покупки возвращается бонусами` : 'Выключена'}
                value={bonusOn ? 'Вкл.' : 'Выкл.'}
                onPress={() => router.push('/manage/loyalty/bonus')}
              />
            )}
            <LinkRow
              icon="giftcard.fill"
              color="#AF52DE"
              title="Подарочные сертификаты"
              subtitle="Код на сумму — гость платит им на кассе"
              value={certificates.data ? String(activeCertificates) : undefined}
              onPress={() => router.push('/manage/loyalty/certificates')}
            />
          </Section>

          <Section title="Скидки" footer={<Text>Автоматическая скидка применяется к чеку сама, ручную кассир выбирает на кассе.</Text>}>
            {discounts.isLoading ? (
              <ProgressView />
            ) : list.length === 0 ? (
              <ContentUnavailableView title="Скидок пока нет" systemImage="percent" description="Скидка может применяться автоматически или выбираться кассиром." />
            ) : (
              list.map((discount) => (
                <LinkRow
                  key={discount.id}
                  icon={discount.type === 'percent' ? 'percent' : 'rublesign'}
                  color={discount.isActive ? '#FF2D55' : '#8E8E93'}
                  title={discount.name}
                  subtitle={[discount.isAuto ? 'Автоматическая' : 'Ручная', discount.minQuantity && discount.minQuantity > 1 ? `от ${discount.minQuantity} шт.` : null, discount.isActive ? null : 'выключена'].filter(Boolean).join(' · ')}
                  value={discountValueText(discount)}
                  onPress={() => router.push({ pathname: '/manage/loyalty/discount', params: { discountId: discount.id } })}
                />
              ))
            )}
            <ActionRow title="Новая скидка" icon="plus.circle.fill" onPress={() => router.push('/manage/loyalty/discount')} />
          </Section>

          <Section title="По статусам клиентов" footer={<Text>Клиент с этим статусом получает скидку автоматически. Нажмите на правило, чтобы выключить или удалить его.</Text>}>
            {(rules.data ?? []).map((rule) => {
              const look = tierLook(rule.clientTier, tiers.data);
              return (
                <LinkRow
                  key={rule.id}
                  icon="person.crop.circle.badge.checkmark"
                  color={rule.isActive ? look.color : '#8E8E93'}
                  title={look.label}
                  subtitle={`${rule.discount?.name ?? rule.name}${rule.isActive ? '' : ' · выключено'}`}
                  value={rule.discount?.type && rule.discount.value ? discountValueText({ type: rule.discount.type, value: rule.discount.value }) : undefined}
                  chevron={false}
                  onPress={() => ruleActions(rule.id, look.label, rule.isActive)}
                />
              );
            })}
            <ActionRow title="Скидка для статуса" icon="plus.circle.fill" onPress={() => router.push('/manage/loyalty/tier-rule')} />
          </Section>

          {isOwner && !settings.loading && (
            <Section title="Персонал" footer={<Text>Кассир сможет применить скидку персонала к своему чеку.</Text>}>
              <Toggle
                label="Скидка персоналу"
                isOn={settings.flag('staff_discount_enabled', false)}
                onIsOnChange={(on) => settings.save({ staff_discount_enabled: on ? '1' : '0' })}
              />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
