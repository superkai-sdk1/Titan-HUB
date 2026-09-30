import { ContentUnavailableView, Form, Host, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { Alert } from 'react-native';

import { TextRow } from '@/components/native-form';
import { useSettingsEditor } from '@/components/settings-parts';

/** Проверка числа из поля перед сохранением настройки. */
function numberIn(raw: string, min: number, max: number, apply: (value: string) => void) {
  const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return Alert.alert(`Введите число от ${min} до ${max}`);
  apply(String(parsed));
}

/** Бонусная программа: начисление, списание, срок жизни, подарок на день рождения, видимость у клиентов. */
export default function BonusSettingsScreen() {
  const settings = useSettingsEditor();

  if (settings.loading || settings.error) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {settings.error ? <ContentUnavailableView title="Настройки не загрузились" systemImage="wifi.exclamationmark" description={settings.error.message} /> : <ProgressView />}
      </Host>
    );
  }

  // Сервер включает бонусы, пока не записано 'false'.
  const on = settings.flag('bonus_enabled', true);
  const birthday = settings.flag('birthday_bonus_enabled', false);

  return (
    <>
      <Stack.Title>Бонусная программа</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await settings.refetch()))]}>
          <Section footer={<Text>{on ? 'Бонусы начисляются за покупки и списываются на кассе вместо денег.' : 'Бонусы не начисляются и не списываются.'}</Text>}>
            <Toggle label="Бонусная программа" isOn={on} onIsOnChange={(next) => settings.save({ bonus_enabled: next ? 'true' : 'false' })} />
          </Section>

          {on && (
            <>
              <Section title="Начисление" footer={<Text>Чеки меньше минимальной покупки бонусов не дают.</Text>}>
                <TextRow label="Процент от покупки, %" value={String(settings.number('bonus_accrual_rate', 5))} keyboard="decimal-pad" onCommit={(v) => numberIn(v, 0, 100, (x) => settings.save({ bonus_accrual_rate: x }))} />
                <TextRow label="Минимальная покупка, ₽" value={String(settings.number('bonus_min_purchase', 0))} keyboard="decimal-pad" onCommit={(v) => numberIn(v, 0, 1_000_000, (x) => settings.save({ bonus_min_purchase: x }))} />
                <Toggle label="Начислять при долге" isOn={settings.flag('bonus_accrual_on_debt', false)} onIsOnChange={(next) => settings.save({ bonus_accrual_on_debt: next ? 'true' : 'false' })} />
              </Section>

              <Section title="Списание" footer={<Text>Какую часть чека можно закрыть бонусами. Срок жизни 0 — бонусы не сгорают.</Text>}>
                <TextRow label="Не больше, %" value={String(settings.number('bonus_max_spend', 50))} keyboard="numeric" onCommit={(v) => numberIn(v, 0, 100, (x) => settings.save({ bonus_max_spend: x }))} />
                <TextRow label="Срок жизни, дней" value={String(settings.number('bonus_expiry_days', 0))} keyboard="numeric" onCommit={(v) => numberIn(v, 0, 3650, (x) => settings.save({ bonus_expiry_days: x }))} />
              </Section>

              <Section title="День рождения">
                <Toggle label="Подарок на день рождения" isOn={birthday} onIsOnChange={(next) => settings.save({ birthday_bonus_enabled: next ? 'true' : 'false' })} />
                {birthday && (
                  <TextRow label="Сколько бонусов" value={String(settings.number('birthday_bonus_amount', 0))} keyboard="decimal-pad" onCommit={(v) => numberIn(v, 0, 1_000_000, (x) => settings.save({ birthday_bonus_amount: x }))} />
                )}
              </Section>
            </>
          )}

          <Section title="Titan Resident" footer={<Text>Скрывает бонусы в приложении и кабинете клиента — пока программа не запущена.</Text>}>
            <Toggle label="Скрыть бонусы у клиентов" isOn={settings.flag('bonus_wallet_hidden', false)} onIsOnChange={(next) => settings.save({ bonus_wallet_hidden: next ? 'true' : 'false' })} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
