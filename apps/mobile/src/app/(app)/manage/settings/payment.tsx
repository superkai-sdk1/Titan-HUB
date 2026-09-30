import { Button, ContentUnavailableView, Form, HStack, Host, Image, LabeledContent, ProgressView, Section, Spacer, Text, Toggle } from '@expo/ui/swift-ui';
import { foregroundStyle, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { FieldRow, primary, secondary, TextRow } from '@/components/native-form';
import { FISCAL_METHODS, savePaymentConfig, usePaymentConfig, type PaymentConfig } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Оплата и чеки: активный СБП-эквайер, тестовый режим, фискализация 54-ФЗ, какие оплаты
 * пробивать и подпись в чеке. Логика та же, что в веб-настройках: эквайер и касса
 * определяются введёнными в «Интеграциях» ключами, здесь — только поведение.
 */
export default function PaymentSettingsScreen() {
  const config = usePaymentConfig();
  // Оптимистично показываем новое значение до ответа сервера; на ошибке — откат.
  const [draft, setDraft] = useState<Partial<PaymentConfig>>({});
  const data = config.data ? { ...config.data, ...draft } : null;

  const save = (patch: Partial<PaymentConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    savePaymentConfig(patch)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        setDraft((current) => {
          const next = { ...current };
          for (const key of Object.keys(patch)) delete next[key as keyof PaymentConfig];
          return next;
        });
        Alert.alert('Не сохранилось', errorText(error));
      });
  };

  if (!data) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {config.isError ? <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={config.error.message} /> : <ProgressView />}
      </Host>
    );
  }

  const isYooKassa = data.sbpProvider === 'yookassa';
  const fiscal = !!data.fiscalProvider;

  return (
    <>
      <Stack.Title>Оплата и чеки</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await config.refetch()))]}>
          <Section
            title="Приём оплат"
            footer={
              <Text>
                {data.sbpConfigured
                  ? 'Кнопка «СБП» на кассе и онлайн-оплаты гостей идут через этот эквайер.'
                  : 'Эквайер не настроен — введите его ключи в «Интеграциях» веб-панели.'}
              </Text>
            }>
            <LabeledContent label="СБП-эквайер">
              <Text modifiers={[data.sbpConfigured ? foregroundStyle(colors.green) : secondary]}>{data.sbpConfigured ? data.sbpProviderLabel : 'не подключён'}</Text>
            </LabeledContent>
            {data.sbpConfigured && <Toggle label="Тестовый режим" isOn={data.testMode} onIsOnChange={(on) => save({ testMode: on })} />}
          </Section>

          <Section
            title="Фискализация 54-ФЗ"
            footer={
              <Text>
                {data.fiscalStandalone
                  ? 'Касса пробивает чек по каждой продаже, включая наличные.'
                  : isYooKassa
                    ? 'ЮKassa пробивает чек при оплате, если у гостя в карточке есть телефон.'
                    : 'Подключите кассу 54-ФЗ (АТОЛ Онлайн) в «Интеграциях» веб-панели — она пробивает чек по каждой продаже.'}
              </Text>
            }>
            {data.fiscalStandalone ? (
              <LabeledContent label="Касса">
                <Text modifiers={[foregroundStyle(colors.green)]}>{data.fiscalLabel}</Text>
              </LabeledContent>
            ) : isYooKassa ? (
              <Toggle label="Чеки через ЮKassa" isOn={data.fiscalProvider === 'yookassa'} onIsOnChange={(on) => save({ fiscalProvider: on ? 'yookassa' : '' })} />
            ) : (
              <LabeledContent label="Касса">
                <Text modifiers={[secondary]}>не подключена</Text>
              </LabeledContent>
            )}
            {fiscal && <Toggle label="Позиции в чеке" isOn={data.itemized} onIsOnChange={(on) => save({ itemized: on })} />}
            {fiscal && (
              <TextRow label="Телефон по умолчанию" value={data.defaultPhone} placeholder="+7…" keyboard="phone-pad" maxLength={20} onCommit={(next) => save({ defaultPhone: next })} />
            )}
          </Section>

          {fiscal && (
            <Section title="Какие оплаты пробивать" footer={<Text>Снимите отметку — оплаты этим способом не уходят в налоговую (например, депозит или долг).</Text>}>
              {FISCAL_METHODS.map((method) => {
                const on = data.fiscalMethods.includes(method.key);
                return (
                  <Button
                    key={method.key}
                    onPress={() => {
                      haptic.selection();
                      save({ fiscalMethods: on ? data.fiscalMethods.filter((key) => key !== method.key) : [...data.fiscalMethods, method.key] });
                    }}>
                    <HStack spacing={12}>
                      <Text modifiers={[primary]}>{method.label}</Text>
                      <Spacer />
                      {on ? <Image systemName="checkmark" size={16} color={colors.accent} /> : null}
                    </HStack>
                  </Button>
                );
              })}
            </Section>
          )}

          {fiscal && (
            <Section title="Подпись в чеке" footer={<Text>Текст внизу фискального чека — например, «Спасибо за визит!».</Text>}>
              <FieldRow value={data.receiptFooter} placeholder="Спасибо за визит!" maxLength={256} multiline onCommit={(next) => save({ receiptFooter: next })} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
