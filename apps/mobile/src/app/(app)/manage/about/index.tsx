import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard } from '@/components/new-check-parts';
import { Group, Row } from '@/components/settings-parts';
import { createBackup, useBackupStatus, useClubContext, useSystemInfo } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const SUBSCRIPTION: Record<string, { label: string; color: string }> = {
  active: { label: 'Активна', color: '#22C55E' },
  expiring: { label: 'Скоро закончится', color: '#F59E0B' },
  grace: { label: 'Льготный период', color: '#F59E0B' },
  expired: { label: 'Закончилась', color: '#EF4444' },
  suspended: { label: 'Приостановлена', color: '#EF4444' },
  none: { label: 'Не оформлена', color: '#94A3B8' },
  unknown: { label: 'Неизвестно', color: '#94A3B8' },
};

/** Ключи модулей — как их гейтит сервер (app.ts: requireModule / requireAiPaid). */
const MODULE_LABELS: Record<string, string> = {
  ai: 'Tai — ИИ-ассистент',
  analytics: 'Аналитика',
  events: 'Мероприятия',
  certificates: 'Сертификаты',
  discounts: 'Скидки и бонусы',
  platega: 'Приём оплат по СБП',
  residents: 'Titan Resident',
  booking: 'Онлайн-бронирование',
  polls: 'Опросы',
};

const dateText = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const whenText = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const sizeText = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`);

/** О системе: клуб и подписка, версии, текущая смена и резервные копии. */
export default function AboutScreen() {
  const gutter = usePageGutter();
  const club = useSession((s) => s.club);
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const context = useClubContext();
  const info = useSystemInfo();
  const backup = useBackupStatus();
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([context.refetch(), info.refetch(), backup.refetch()]);
    setPulling(false);
  };

  const subscription = context.data?.subscription;
  // Клуб-арендатор живёт на поддомене: у него есть подписка и матрица модулей.
  // На основном сервере /club/context отдаёт club: null — подписку показывать нечего.
  const tenant = !!context.data?.club;
  const look = SUBSCRIPTION[subscription?.state ?? 'unknown'] ?? SUBSCRIPTION.unknown!;
  const modules = Object.entries(context.data?.modules ?? {}).filter(([, on]) => on);
  const last = backup.data?.last ?? null;

  const makeBackup = () =>
    Alert.alert('Сделать резервную копию?', 'Снимок базы клуба сохранится на сервере' + (backup.data?.driveConfigured ? ' и в Google Drive.' : '. Google Drive не подключён.'), [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сделать копию',
        onPress: () => {
          haptic.medium();
          setSaving(true);
          createBackup()
            .then((result) => {
              haptic.success();
              Alert.alert('Копия готова', `${result.name}${result.uploaded ? '\nЗагружена в Google Drive.' : ''}`);
            })
            .catch((error: unknown) => {
              haptic.error();
              Alert.alert('Копия не создана', errorText(error));
            })
            .finally(() => setSaving(false));
        },
      },
    ]);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>О системе</Stack.Title>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <GlassCard style={styles.hero}>
          <Text style={[type.title1, styles.label]}>{context.data?.club?.name ?? club?.name ?? 'Titan HUB'}</Text>
          <Text style={[type.subhead, styles.secondary]}>{club?.host ?? context.data?.club?.slug ?? ''}</Text>
          {tenant && (
            <View style={[styles.badge, { backgroundColor: look.color }]}>
              <Text style={[type.footnote, styles.badgeText]}>{look.label}</Text>
            </View>
          )}
        </GlassCard>

        {tenant && (
          <Group title="Подписка" footer={subscription?.blocked ? 'Доступ ограничен до продления подписки.' : 'Продлить подписку можно в веб-кассе.'}>
            <Row icon="creditcard" color={look.color} title="Состояние" value={look.label} />
            <Row icon="calendar" color="#0EA5E9" title="Оплачено до" value={dateText(subscription?.paidUntil)} />
            {subscription?.daysLeft !== null && subscription?.daysLeft !== undefined && <Row icon="hourglass" color="#F59E0B" title="Осталось дней" value={String(subscription.daysLeft)} />}
          </Group>
        )}

        {!tenant && context.data && (
          <Group title="Режим" footer="Подписка и набор модулей настраиваются для клубов на поддоменах.">
            <Row icon="server.rack" color="#6366F1" title="Основной сервер" value="без подписки" />
          </Group>
        )}

        {modules.length > 0 && (
          <Group title="Подключённые модули" inset={16}>
            {modules.map(([key]) => (
              <Row key={key} title={MODULE_LABELS[key] ?? key} value="включён" valueColor="#22C55E" />
            ))}
          </Group>
        )}

        <Group title="Версии" inset={16}>
          <Row title="Приложение" value={`${Constants.expoConfig?.version ?? '—'}`} />
          <Row title="Сервер" value={info.data?.version ?? '—'} />
          {info.data?.env && <Row title="Окружение" value={info.data.env} />}
        </Group>

        <Group title="Сейчас" inset={16}>
          <Row title="Смена" value={info.data?.shift ? 'открыта' : 'закрыта'} valueColor={info.data?.shift ? '#22C55E' : undefined} />
          {info.data?.eveningName && <Row title="Вечер" value={info.data.eveningName} />}
        </Group>

        {isOwner && (
          <Group title="Резервные копии" footer="Восстановление из копии делается только в веб-кассе — там это безопаснее.">
            <Row icon="externaldrive" color="#6366F1" title="Последняя копия" subtitle={last ? `${last.location === 'drive' ? 'Google Drive' : 'сервер'} · ${sizeText(last.size)}` : 'копий пока нет'} value={whenText(last?.at)} />
            <Row icon="arrow.clockwise.icloud" color="#22C55E" title="Сделать копию сейчас" busy={saving} onPress={makeBackup} />
          </Group>
        )}

        <Text style={[type.footnote, styles.note]}>Titan HUB · касса для клубов «Мафии»</Text>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  badge: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: 999, marginTop: space.xs },
  badgeText: { color: 'white', fontWeight: '700' },
  note: { color: colors.tertiaryLabel, textAlign: 'center' },
});
