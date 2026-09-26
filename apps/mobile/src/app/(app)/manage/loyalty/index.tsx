import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';

import { AppRefreshControl } from '@/components/refresh-control';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { PrimaryButton } from '@/components/new-check-parts';
import { Group, ListNote, promptValue, Row, SwitchRow, useSettingsEditor } from '@/components/settings-parts';
import { deactivateCertificate, deleteTierRule, discountValueText, issueCertificate, setTierRuleActive, useCertificates, useDiscounts, useTierRules } from '@/lib/admin-api';
import { tierLook, useClientTiers } from '@/lib/clients-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { parseAmount } from '@/lib/shift-api';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton } from '@/components/toolbar';

type Tab = 'discounts' | 'bonus' | 'certificates';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Лояльность: скидки и правила по статусам, бонусная программа, подарочные сертификаты. */
export default function LoyaltyScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [tab, setTab] = useState<Tab>('discounts');
  const [pulling, setPulling] = useState(false);

  const discounts = useDiscounts();
  const rules = useTierRules();
  const tiers = useClientTiers();
  const certificates = useCertificates();
  const settings = useSettingsEditor();

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([discounts.refetch(), rules.refetch(), certificates.refetch(), settings.refetch()]);
    setPulling(false);
  };

  const add = () => {
    haptic.light();
    if (tab === 'certificates') issue();
    else router.push('/manage/loyalty/discount');
  };

  const issue = () =>
    promptValue({
      title: 'Новый сертификат',
      message: 'Номинал сертификата в рублях',
      value: '',
      keyboard: 'decimal-pad',
      onSubmit: (raw) => {
        const nominal = parseAmount(raw);
        if (nominal === null || nominal <= 0) return Alert.alert('Введите номинал');
        issueCertificate(nominal)
          .then((certificate) => {
            haptic.success();
            Alert.alert(`Сертификат на ${formatMoney(nominal)}`, `Код: ${certificate.code}\n\nПередайте код гостю — на кассе он оплачивает им покупку.`, [
              { text: 'Готово', style: 'cancel' },
              { text: 'Поделиться', onPress: () => void Share.share({ message: certificate.code }) },
            ]);
          })
          .catch((error: unknown) => {
            haptic.error();
            Alert.alert('Сертификат не выпущен', errorText(error));
          });
      },
    });

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

  const closeCertificate = (id: string, code: string) =>
    Alert.alert(`Погасить ${code}?`, 'Сертификат перестанет приниматься на кассе. Отменить это нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Погасить',
        style: 'destructive',
        onPress: () =>
          void deactivateCertificate(id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Сертификат не погашен', errorText(error))),
      },
    ]);

  const tabs: { key: Tab; label: string }[] = isOwner
    ? [
        { key: 'discounts', label: 'Скидки' },
        { key: 'bonus', label: 'Бонусы' },
        { key: 'certificates', label: 'Сертификаты' },
      ]
    : [
        { key: 'discounts', label: 'Скидки' },
        { key: 'certificates', label: 'Сертификаты' },
      ];

  // Сервер включает бонусы, пока не записано 'false' (settings['bonus_enabled'] !== 'false').
  const bonusOn = settings.flag('bonus_enabled', true);
  const certificateList = certificates.data ?? [];

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Лояльность</Stack.Title>
      {tab !== 'bonus' && (
        <Stack.Toolbar placement="right">
          <ToolbarButton icon="plus" accessibilityLabel={tab === 'certificates' ? 'Выпустить сертификат' : 'Новая скидка'} onPress={add} />
        </Stack.Toolbar>
      )}

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            {tabs.map((item) => (
              <SwiftText key={item.key} modifiers={[tag(item.key)]}>
                {item.label}
              </SwiftText>
            ))}
          </Picker>
        </Host>

        <LayoutAnimationConfig skipEntering>
          <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.tab}>
            {tab === 'discounts' && (
              <>
                <Group title="Скидки" footer="Автоматическая скидка применяется к чеку сама, ручную кассир выбирает вручную.">
                  {(discounts.data ?? []).map((discount) => (
                    <Row
                      key={discount.id}
                      icon={discount.type === 'percent' ? 'percent' : 'rublesign'}
                      color={discount.isActive ? '#EC4899' : colors.tertiaryLabel}
                      title={discount.name}
                      subtitle={[discount.isAuto ? 'Автоматическая' : 'Ручная', discount.minQuantity && discount.minQuantity > 1 ? `от ${discount.minQuantity} шт.` : null, discount.isActive ? null : 'выключена'].filter(Boolean).join(' · ')}
                      value={discountValueText(discount)}
                      dim={!discount.isActive}
                      chevron
                      onPress={() => router.push({ pathname: '/manage/loyalty/discount', params: { discountId: discount.id } })}
                    />
                  ))}
                </Group>
                {(discounts.data?.length ?? 0) === 0 && <ListNote loading={discounts.isLoading} text="Скидок пока нет" systemImage="percent" description="Скидка может применяться автоматически или выбираться кассиром." />}

                <Group title="По статусам клиентов" footer="Клиент с этим статусом получает скидку автоматически.">
                  {(rules.data ?? []).map((rule) => {
                    const look = tierLook(rule.clientTier, tiers.data);
                    return (
                      <Row
                        key={rule.id}
                        icon="person.crop.circle.badge.checkmark"
                        color={rule.isActive ? look.color : colors.tertiaryLabel}
                        title={look.label}
                        subtitle={rule.discount?.name ?? rule.name}
                        value={rule.discount?.type && rule.discount.value ? discountValueText({ type: rule.discount.type, value: rule.discount.value }) : undefined}
                        dim={!rule.isActive}
                        onPress={() => ruleActions(rule.id, look.label, rule.isActive)}
                      />
                    );
                  })}
                </Group>
                <PrimaryButton title="Скидка для статуса" icon="plus" onPress={() => router.push('/manage/loyalty/tier-rule')} />

                {isOwner && (
                  <Group title="Персонал">
                    <SwitchRow
                      icon="person.text.rectangle"
                      color="#0EA5E9"
                      title="Скидка персоналу"
                      subtitle="Кассир может применить её к своему чеку"
                      value={settings.flag('staff_discount_enabled', false)}
                      onChange={(on) => settings.save({ staff_discount_enabled: on ? '1' : '0' })}
                    />
                  </Group>
                )}
              </>
            )}

            {tab === 'bonus' && (
              <>
                <Group title="Бонусы" footer="Бонусы начисляются за покупки и списываются на кассе вместо денег.">
                  <SwitchRow icon="star.circle" color="#F59E0B" title="Бонусная программа" subtitle={bonusOn ? 'Начисляются и списываются на кассе' : 'Выключена: бонусы не начисляются'} value={bonusOn} onChange={(on) => settings.save({ bonus_enabled: on ? 'true' : 'false' })} />
                </Group>

                <Group title="Начисление" inset={16}>
                  <Row
                    title="Процент от покупки"
                    value={`${settings.number('bonus_accrual_rate', 5)} %`}
                    dim={!bonusOn}
                    onPress={bonusOn ? () => promptValue({ title: 'Процент начисления', message: 'Сколько процентов от суммы чека вернётся бонусами', value: String(settings.number('bonus_accrual_rate', 5)), keyboard: 'decimal-pad', onSubmit: (next) => saveNumber(next, 0, 100, (v) => settings.save({ bonus_accrual_rate: v })) }) : undefined}
                  />
                  <Row
                    title="Минимальная покупка"
                    value={formatMoney(settings.number('bonus_min_purchase', 0))}
                    dim={!bonusOn}
                    onPress={bonusOn ? () => promptValue({ title: 'Минимальная покупка', message: 'Чеки меньше этой суммы бонусов не дают', value: String(settings.number('bonus_min_purchase', 0)), keyboard: 'decimal-pad', onSubmit: (next) => saveNumber(next, 0, 1_000_000, (v) => settings.save({ bonus_min_purchase: v })) }) : undefined}
                  />
                  <SwitchRow title="Начислять при долге" subtitle="Иначе бонусы не идут, пока клиент в минусе" value={settings.flag('bonus_accrual_on_debt', false)} disabled={!bonusOn} onChange={(on) => settings.save({ bonus_accrual_on_debt: on ? 'true' : 'false' })} />
                </Group>

                <Group title="Списание" inset={16}>
                  <Row
                    title="Не больше, чем"
                    subtitle="Доля чека, которую можно закрыть бонусами"
                    value={`${settings.number('bonus_max_spend', 50)} %`}
                    dim={!bonusOn}
                    onPress={bonusOn ? () => promptValue({ title: 'Максимум списания', message: 'Какую часть чека можно оплатить бонусами', value: String(settings.number('bonus_max_spend', 50)), keyboard: 'number-pad', onSubmit: (next) => saveNumber(next, 0, 100, (v) => settings.save({ bonus_max_spend: v })) }) : undefined}
                  />
                  <Row
                    title="Срок жизни бонусов"
                    subtitle="0 — бонусы не сгорают"
                    value={settings.number('bonus_expiry_days', 0) > 0 ? `${settings.number('bonus_expiry_days', 0)} дн.` : 'Бессрочно'}
                    dim={!bonusOn}
                    onPress={bonusOn ? () => promptValue({ title: 'Срок жизни бонусов', message: 'Через сколько дней бонусы сгорают. 0 — бессрочно', value: String(settings.number('bonus_expiry_days', 0)), keyboard: 'number-pad', onSubmit: (next) => saveNumber(next, 0, 3650, (v) => settings.save({ bonus_expiry_days: v })) }) : undefined}
                  />
                </Group>

                <Group title="День рождения" inset={16}>
                  <SwitchRow title="Подарок на день рождения" value={settings.flag('birthday_bonus_enabled', false)} disabled={!bonusOn} onChange={(on) => settings.save({ birthday_bonus_enabled: on ? 'true' : 'false' })} />
                  <Row
                    title="Сколько бонусов"
                    value={formatMoney(settings.number('birthday_bonus_amount', 0))}
                    dim={!bonusOn || !settings.flag('birthday_bonus_enabled', false)}
                    onPress={bonusOn && settings.flag('birthday_bonus_enabled', false) ? () => promptValue({ title: 'Подарок на день рождения', message: 'Сколько бонусов начислить', value: String(settings.number('birthday_bonus_amount', 0)), keyboard: 'decimal-pad', onSubmit: (next) => saveNumber(next, 0, 1_000_000, (v) => settings.save({ birthday_bonus_amount: v })) }) : undefined}
                  />
                </Group>

                <Group title="Titan Resident" footer="Скрывает бонусы в личном кабинете клиента — пока программа не запущена.">
                  <SwitchRow title="Скрыть бонусы у клиентов" value={settings.flag('bonus_wallet_hidden', false)} onChange={(on) => settings.save({ bonus_wallet_hidden: on ? 'true' : 'false' })} />
                </Group>
              </>
            )}

            {tab === 'certificates' && (
              <>
                <Text style={[type.footnote, styles.caption]}>Сертификат — код на сумму: гость оплачивает им покупку на кассе, остаток сохраняется.</Text>
                <Group>
                  {certificateList.map((certificate) => (
                    <Row
                      key={certificate.id}
                      icon="giftcard"
                      color={certificate.status === 'active' ? '#8B5CF6' : colors.tertiaryLabel}
                      title={certificate.code}
                      subtitle={certificate.status === 'active' ? (certificate.balance < certificate.amount ? `осталось ${formatMoney(certificate.balance)} из ${formatMoney(certificate.amount)}` : 'не использован') : 'погашен'}
                      value={formatMoney(certificate.amount)}
                      dim={certificate.status !== 'active'}
                      onPress={isOwner && certificate.status === 'active' ? () => closeCertificate(certificate.id, certificate.code) : undefined}
                    />
                  ))}
                </Group>
                {certificateList.length === 0 && <ListNote loading={certificates.isLoading} text="Сертификатов пока нет" systemImage="giftcard" description="Выпустите сертификат — гость оплатит им покупку на кассе." />}
                <PrimaryButton title="Выпустить сертификат" icon="giftcard" onPress={issue} />
              </>
            )}
          </Animated.View>
        </LayoutAnimationConfig>
      </ScrollView>
    </AmbientBackdrop>
  );
}

/** Проверка числа из диалога перед сохранением настройки. */
function saveNumber(raw: string, min: number, max: number, apply: (value: string) => void) {
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return Alert.alert(`Введите число от ${min} до ${max}`);
  apply(String(parsed));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  segment: { alignSelf: 'stretch' },
  tab: { gap: space.lg },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
});
