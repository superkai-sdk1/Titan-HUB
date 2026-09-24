import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassChip } from '@/components/new-check-parts';
import { Group, promptValue, Row, SwitchRow, useSettingsEditor } from '@/components/settings-parts';
import { useIntegrations } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { METHODS, type TenderMethod } from '@/lib/payment';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

/** Способы, которыми касса открывает оплату по умолчанию. */
const DEFAULT_METHODS: TenderMethod[] = ['cash', 'card', 'transfer'];
const hourText = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const isTime = (value: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(value);

/** Настройки клуба: заведение, граница суток, поведение кассы и статус интеграций. */
export default function SettingsScreen() {
  const gutter = usePageGutter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const settings = useSettingsEditor();
  const integrations = useIntegrations(isOwner);
  const [pulling, setPulling] = useState(false);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([settings.refetch(), integrations.refetch()]);
    setPulling(false);
  };

  const editText = (key: string, title: string, message: string) => promptValue({ title, message, value: settings.text(key, ''), onSubmit: (next) => settings.save({ [key]: next }) });

  const editTime = (key: string, title: string) =>
    promptValue({
      title,
      message: 'Время в формате ЧЧ:ММ',
      value: settings.text(key, ''),
      onSubmit: (next) => {
        if (next && !isTime(next)) return Alert.alert('Время в формате ЧЧ:ММ');
        settings.save({ [key]: next });
      },
    });

  const editStartHour = () =>
    promptValue({
      title: 'Начало суток клуба',
      message: 'Час, с которого начинается новый рабочий день: смены и отчёты считаются от него, а не от полуночи.',
      value: String(settings.number('business_day_start_hour', 9)),
      keyboard: 'number-pad',
      onSubmit: (next) => {
        const hour = Math.round(Number(next));
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return Alert.alert('Час от 0 до 23');
        settings.save({ business_day_start_hour: String(hour) });
      },
    });

  const defaultPayment = settings.text('default_payment', 'cash') as TenderMethod;

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Настройки</Stack.Title>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Group title="Заведение" footer="Название и адрес попадают в чеки и приглашения гостям.">
          <Row icon="house" color="#8B5CF6" title="Название" value={settings.text('venue_name', 'не указано')} onPress={() => editText('venue_name', 'Название клуба', 'Как клуб называется для гостей')} />
          <Row icon="mappin.and.ellipse" color="#F43F5E" title="Адрес" value={settings.text('venue_address', 'не указан')} onPress={() => editText('venue_address', 'Адрес', 'Улица и дом')} />
          <Row icon="clock" color="#0EA5E9" title="Открытие" value={settings.text('hours_open', '—')} onPress={() => editTime('hours_open', 'Время открытия')} />
          <Row icon="moon" color="#6366F1" title="Закрытие" value={settings.text('hours_close', '—')} onPress={() => editTime('hours_close', 'Время закрытия')} />
        </Group>

        <Group title="Сутки клуба" footer={`Смена, открытая после полуночи, относится к предыдущему дню, пока не наступит ${hourText(settings.number('business_day_start_hour', 9))}.`}>
          <Row icon="sunrise" color="#F59E0B" title="Начало суток" value={hourText(settings.number('business_day_start_hour', 9))} onPress={editStartHour} />
        </Group>

        <Group title="Касса" footer="Способ оплаты, который касса предлагает первым.">
          <View style={styles.chips}>
            {DEFAULT_METHODS.map((method) => (
              <GlassChip
                key={method}
                label={METHODS[method].title}
                icon={METHODS[method].symbol}
                tint={METHODS[method].color}
                active={defaultPayment === method}
                onPress={() => {
                  haptic.selection();
                  settings.save({ default_payment: method });
                }}
              />
            ))}
          </View>
        </Group>

        <Group title="Смены и склад" inset={16}>
          <SwitchRow title="Автозакрытие смены" subtitle="Закрывать смену по расписанию" value={settings.flag('auto_close_shift', false)} onChange={(on) => settings.save({ auto_close_shift: String(on) })} />
          <SwitchRow title="Telegram-уведомления" subtitle="Оповещения клуба в Telegram" value={settings.flag('telegram_notifications', false)} onChange={(on) => settings.save({ telegram_notifications: String(on) })} />
          <Row
            title="Порог низкого остатка"
            subtitle="Склад подсветит позиции с остатком ниже"
            value={`${settings.number('low_stock_threshold', 5)} шт.`}
            onPress={() =>
              promptValue({
                title: 'Порог низкого остатка',
                message: 'Сколько штук считать низким остатком',
                value: String(settings.number('low_stock_threshold', 5)),
                keyboard: 'number-pad',
                onSubmit: (next) => {
                  const value = Math.round(Number(next));
                  if (!Number.isInteger(value) || value < 0) return Alert.alert('Введите число');
                  settings.save({ low_stock_threshold: String(value) });
                },
              })
            }
          />
        </Group>

        <Group title="Чек" inset={16} footer="Текст печатается внизу чека — например, «Спасибо за игру!».">
          <Row title="Подпись в чеке" value={settings.text('receipt_footer', 'нет')} onPress={() => editText('receipt_footer', 'Подпись в чеке', 'Текст внизу чека')} />
        </Group>

        {isOwner && (
          <Group title="Интеграции" footer="Ключи интеграций меняются в веб-кассе — там их безопаснее вводить.">
            {(integrations.data ?? []).map((item) => (
              <Row key={item.key} icon={item.configured ? 'checkmark.seal' : 'circle.dashed'} color={item.configured ? '#22C55E' : colors.tertiaryLabel} title={item.label} subtitle={item.masked ?? undefined} value={item.configured ? 'подключено' : 'не настроено'} dim={!item.configured} />
            ))}
          </Group>
        )}

        <Text style={[type.footnote, styles.note]}>Настройки сохраняются сразу.</Text>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  chips: { flexDirection: 'row', gap: space.sm, padding: space.lg, flexWrap: 'wrap' },
  note: { color: colors.secondaryLabel, textAlign: 'center', paddingHorizontal: space.xs },
});
