import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text } from 'react-native';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Group, promptValue, Row, SwitchRow, useSettingsEditor } from '@/components/settings-parts';
import { api } from '@/lib/api';
import { saveNotificationPrefs, useNotificationPrefs, useNotificationTypes, type NotificationPrefs } from '@/lib/admin-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Что присылать пушем: список типов событий, привязка Telegram и пороги «крупных» сумм. */
export default function NotificationsScreen() {
  const gutter = usePageGutter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const types = useNotificationTypes();
  const prefs = useNotificationPrefs();
  const settings = useSettingsEditor();
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const [pulling, setPulling] = useState(false);

  const stored = prefs.data?.settings?.types ?? {};
  const current = draft ?? stored;

  const enabled = (key: string) => current[key]?.enabled ?? types.data?.find((t) => t.key === key)?.defaultEnabled ?? false;
  const viaTelegram = (key: string) => current[key]?.telegram ?? false;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([prefs.refetch(), settings.refetch()]);
    setDraft(null);
    setPulling(false);
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

  const telegramLinked = prefs.data?.telegramLinked ?? false;

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Уведомления</Stack.Title>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Group title="Telegram" footer={telegramLinked ? 'Отмеченные события придут и в Telegram.' : 'Привяжите Telegram, чтобы получать события ещё и туда.'}>
          <Row icon="paperplane" color="#0EA5E9" title={telegramLinked ? 'Telegram привязан' : 'Привязать Telegram'} value={telegramLinked ? 'готово' : undefined} onPress={linkTelegram} />
        </Group>

        {isOwner && (
          <Group title="Пороги" inset={16} footer="События «крупный чек» и «крупный возврат» срабатывают от этих сумм.">
            <Row title="Крупный чек" value={formatMoney(settings.number('large_check_threshold', 3000))} onPress={() => promptValue({ title: 'Крупный чек', message: 'Сумма, с которой чек считается крупным', value: String(settings.number('large_check_threshold', 3000)), keyboard: 'number-pad', onSubmit: (raw) => saveThreshold(raw, (value) => settings.save({ large_check_threshold: value })) })} />
            <Row title="Крупный возврат" value={formatMoney(settings.number('large_refund_threshold', 3000))} onPress={() => promptValue({ title: 'Крупный возврат', message: 'Сумма, с которой возврат считается крупным', value: String(settings.number('large_refund_threshold', 3000)), keyboard: 'number-pad', onSubmit: (raw) => saveThreshold(raw, (value) => settings.save({ large_refund_threshold: value })) })} />
          </Group>
        )}

        {types.isLoading && <ActivityIndicator style={styles.loading} />}

        <Group title="События" inset={16}>
          {(types.data ?? []).map((item) => (
            <SwitchRow key={item.key} title={item.label} subtitle={item.description} value={enabled(item.key)} onChange={(on) => change(item.key, { enabled: on })} />
          ))}
        </Group>

        {telegramLinked && (
          <Group title="Дублировать в Telegram" inset={16} footer="Только для включённых выше событий.">
            {(types.data ?? [])
              .filter((item) => enabled(item.key))
              .map((item) => (
                <SwitchRow key={item.key} title={item.label} value={viaTelegram(item.key)} onChange={(on) => change(item.key, { telegram: on })} />
              ))}
          </Group>
        )}

        <Text style={[type.footnote, styles.note]}>Пуши приходят на устройства, где вы вошли в кассу.</Text>
      </ScrollView>
    </AmbientBackdrop>
  );
}

function saveThreshold(raw: string, apply: (value: string) => void) {
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return Alert.alert('Введите сумму');
  apply(String(Math.round(parsed)));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  loading: { paddingVertical: space.xl },
  note: { color: colors.secondaryLabel, paddingHorizontal: space.xs, textAlign: 'center' },
});
