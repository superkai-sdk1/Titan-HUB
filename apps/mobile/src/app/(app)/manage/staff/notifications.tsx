import { Form, Host, ProgressView, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Share } from 'react-native';

import { LinkRow, TextRow } from '@/components/native-form';
import { useSettingsEditor } from '@/components/settings-parts';
import { api } from '@/lib/api';
import { saveNotificationPrefs, useNotificationPrefs, useNotificationTypes, type NotificationPrefs } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Что присылать пушем: список типов событий, привязка Telegram и пороги «крупных» сумм. */
export default function NotificationsScreen() {
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const types = useNotificationTypes();
  const prefs = useNotificationPrefs();
  const settings = useSettingsEditor();
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);

  const stored = prefs.data?.settings?.types ?? {};
  const current = draft ?? stored;

  const enabled = (key: string) => current[key]?.enabled ?? types.data?.find((t) => t.key === key)?.defaultEnabled ?? false;
  const viaTelegram = (key: string) => current[key]?.telegram ?? false;

  const refresh = async () => {
    await Promise.allSettled([prefs.refetch(), settings.refetch()]);
    setDraft(null);
  };

  /** Сервер принимает карту целиком — собираем её из всех типов и меняем один. */
  const change = (key: string, patch: { enabled?: boolean; telegram?: boolean }) => {
    const next: NotificationPrefs = {};
    for (const item of types.data ?? []) {
      next[item.key] = {
        enabled: item.key === key && patch.enabled !== undefined ? patch.enabled : enabled(item.key),
        telegram: item.key === key && patch.telegram !== undefined ? patch.telegram : viaTelegram(item.key),
        channel: current[item.key]?.channel ?? 'push',
      };
    }
    setDraft(next);
    saveNotificationPrefs(next)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        setDraft(null);
        Alert.alert('Настройка не сохранена', errorText(error));
      });
  };

  const linkTelegram = () => {
    haptic.light();
    api
      .post<{ code: string }>('/notifications/tg-link')
      .then(({ code }) =>
        Alert.alert('Привязка Telegram', `Откройте админ-бота клуба в Telegram и отправьте ему этот код:\n\n${code}`, [
          { text: 'Готово', style: 'cancel' },
          { text: 'Поделиться кодом', onPress: () => void Share.share({ message: code }) },
        ]),
      )
      .catch((error: unknown) => Alert.alert('Код не создан', errorText(error)));
  };

  const saveThreshold = (key: string) => (raw: string) => {
    const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return Alert.alert('Введите сумму');
    settings.save({ [key]: String(Math.round(parsed)) });
  };

  const telegramLinked = prefs.data?.telegramLinked ?? false;

  return (
    <>
      <Stack.Title>Уведомления</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(refresh)]}>
          <Section title="Telegram" footer={<Text>{telegramLinked ? 'Отмеченные события придут и в Telegram.' : 'Привяжите Telegram, чтобы получать события ещё и туда.'}</Text>}>
            <LinkRow icon="paperplane.fill" color="#32ADE6" title={telegramLinked ? 'Telegram привязан' : 'Привязать Telegram'} value={telegramLinked ? 'Готово' : undefined} onPress={linkTelegram} />
          </Section>

          {isOwner && !settings.loading && (
            <Section title="Пороги, ₽" footer={<Text>События «крупный чек» и «крупный возврат» срабатывают от этих сумм.</Text>}>
              <TextRow label="Крупный чек" value={String(settings.number('large_check_threshold', 3000))} keyboard="numeric" onCommit={saveThreshold('large_check_threshold')} />
              <TextRow label="Крупный возврат" value={String(settings.number('large_refund_threshold', 3000))} keyboard="numeric" onCommit={saveThreshold('large_refund_threshold')} />
            </Section>
          )}

          <Section title="События" footer={<Text>Пуши приходят на устройства, где вы вошли в кассу.</Text>}>
            {types.isLoading ? (
              <ProgressView />
            ) : (
              (types.data ?? []).map((item) => <Toggle key={item.key} label={item.label} isOn={enabled(item.key)} onIsOnChange={(on) => change(item.key, { enabled: on })} />)
            )}
          </Section>

          {telegramLinked && (
            <Section title="Дублировать в Telegram" footer={<Text>Только для включённых выше событий.</Text>}>
              {(types.data ?? [])
                .filter((item) => enabled(item.key))
                .map((item) => (
                  <Toggle key={item.key} label={item.label} isOn={viaTelegram(item.key)} onIsOnChange={(on) => change(item.key, { telegram: on })} />
                ))}
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
