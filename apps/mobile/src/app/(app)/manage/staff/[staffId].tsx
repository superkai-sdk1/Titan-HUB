import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Avatar, DangerRow, GlassCard, GlassChip } from '@/components/new-check-parts';
import { Group, promptValue, Row, SwitchRow } from '@/components/settings-parts';
import { deleteStaff, deleteStaffPasskey, PERMISSIONS, permissionOn, resetStaffPin, staffTelegramLink, updateStaff, useStaffAdmin, useStaffPasskeys } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isPin = (value: string) => /^\d{4}$/.test(value);

/** Карточка сотрудника: роль, права, пароль и PIN, Telegram и ключи входа. */
export default function StaffMemberScreen() {
  const gutter = usePageGutter();
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const me = useMe();
  const staff = useStaffAdmin(isOwner);
  const passkeys = useStaffPasskeys(staffId, isOwner);
  // Какую именно строку сейчас сохраняем — иначе спиннер крутится сразу во всех.
  const [pending, setPending] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([staff.refetch(), passkeys.refetch()]);
    setPulling(false);
  };

  const row = staff.data?.find((item) => item.id === staffId);
  const isSelf = me.data?.id === staffId;

  if (!row) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <Stack.Title>Сотрудник</Stack.Title>
        <View style={styles.loading}>{staff.isLoading ? <ActivityIndicator /> : <Text style={[type.subhead, styles.secondary]}>Сотрудник не найден</Text>}</View>
      </AmbientBackdrop>
    );
  }

  const patch = (field: string, body: Parameters<typeof updateStaff>[1], failure: string) => {
    setPending(field);
    updateStaff(row.id, body)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        Alert.alert(failure, errorText(error));
      })
      .finally(() => setPending(null));
  };

  const setRole = (role: 'owner' | 'staff') => {
    if (role === row.role) return;
    haptic.light();
    Alert.alert(role === 'owner' ? `Сделать ${row.nickname} владельцем?` : `Сделать ${row.nickname} сотрудником?`, role === 'owner' ? 'Владелец видит деньги, аналитику и настройки клуба.' : 'Доступ ограничится правами сотрудника.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сменить роль', onPress: () => patch('role', { role }, 'Роль не изменена') },
    ]);
  };

  const togglePermission = (key: string, on: boolean) => {
    const permissions: Record<string, boolean> = {};
    for (const item of PERMISSIONS) permissions[item.key] = item.key === key ? on : permissionOn(row, item.key);
    patch(`perm:${key}`, { permissions }, 'Права не изменены');
  };

  const changePassword = () =>
    promptValue({
      title: 'Новый пароль',
      message: `Пароль для входа ${row.nickname} в кассу. Не меньше 4 символов.`,
      value: '',
      onSubmit: (password) => {
        if (password.length < 4) return Alert.alert('Пароль короче 4 символов');
        patch('password', { password }, 'Пароль не изменён');
      },
    });

  const changePin = () =>
    promptValue({
      title: 'Новый PIN',
      message: '4 цифры для быстрого входа на этом устройстве',
      value: '',
      keyboard: 'number-pad',
      onSubmit: (pin) => {
        if (!isPin(pin)) return Alert.alert('PIN — ровно 4 цифры');
        setPending('pin');
        resetStaffPin(row.id, pin)
          .then(() => {
            haptic.success();
            Alert.alert('PIN обновлён', `Передайте ${row.nickname} новый PIN.`);
          })
          .catch((error: unknown) => Alert.alert('PIN не изменён', errorText(error)))
          .finally(() => setPending(null));
      },
    });

  const linkTelegram = () => {
    haptic.light();
    setPending('tg');
    staffTelegramLink(row.id)
      .then(({ deepLink, linked, tgUsername }) =>
        Alert.alert(linked ? `Telegram привязан${tgUsername ? `: @${tgUsername}` : ''}` : 'Привязка Telegram', linked ? 'Ссылка ниже перепривяжет аккаунт к другому Telegram.' : `Откройте ссылку на телефоне ${row.nickname} — бот свяжет аккаунт с кассой.`, [
          { text: 'Закрыть', style: 'cancel' },
          { text: 'Открыть в Telegram', onPress: () => void Linking.openURL(deepLink).catch(() => Alert.alert('Не удалось открыть Telegram')) },
        ]),
      )
      .catch((error: unknown) => Alert.alert('Ссылка не получена', errorText(error)))
      .finally(() => setPending(null));
  };

  const removePasskey = (passkeyId: string) =>
    Alert.alert('Удалить ключ входа?', 'С этого устройства нельзя будет войти по Face ID.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void deleteStaffPasskey(row.id, passkeyId)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Ключ не удалён', errorText(error))),
      },
    ]);

  const remove = () =>
    Alert.alert(`Уволить ${row.nickname}?`, 'Профиль скроется, вход и ключи Face ID перестанут работать. Смены, чеки и зарплата сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Уволить',
        style: 'destructive',
        onPress: () =>
          void deleteStaff(row.id)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => Alert.alert('Сотрудник не удалён', errorText(error))),
      },
    ]);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{row.nickname}</Stack.Title>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <GlassCard style={styles.hero}>
          <Avatar name={row.nickname} photoUrl={row.photoUrl} size={64} />
          <Text style={[type.title2, styles.label]} numberOfLines={1}>
            {row.nickname}
          </Text>
          <Text style={[type.subhead, styles.secondary]}>{row.role === 'owner' ? 'Владелец' : 'Сотрудник'}</Text>
        </GlassCard>

        <Group title="Профиль">
          <Row icon="person" color="#64748B" title="Никнейм" value={row.nickname} busy={pending === 'nickname'} onPress={() => promptValue({ title: 'Никнейм', message: 'Под этим именем сотрудник входит в кассу', value: row.nickname, onSubmit: (nickname) => (nickname.length < 2 ? Alert.alert('Слишком короткий никнейм') : patch('nickname', { nickname }, 'Никнейм не изменён')) })} />
          <Row icon="phone" color="#10B981" title="Телефон" value={row.phone ?? 'не указан'} busy={pending === 'phone'} onPress={() => promptValue({ title: 'Телефон', value: row.phone ?? '', keyboard: 'phone-pad', onSubmit: (phone) => patch('phone', { phone }, 'Телефон не изменён') })} />
        </Group>

        <Group title="Роль" footer={row.role === 'owner' ? 'Владелец видит всё и может менять настройки клуба.' : 'Сотрудник работает в кассе; разделы «Управления» открываются правами ниже.'}>
          <View style={styles.chips}>
            <GlassChip label="Сотрудник" icon="person" active={row.role !== 'owner'} onPress={() => setRole('staff')} />
            <GlassChip label="Владелец" icon="crown" active={row.role === 'owner'} onPress={() => setRole('owner')} />
          </View>
        </Group>

        {row.role !== 'owner' && (
          <Group title="Права" inset={16} footer="Выключенное право убирает раздел из «Управления» у этого сотрудника.">
            {PERMISSIONS.map((item) => (
              <SwitchRow key={item.key} title={item.label} value={permissionOn(row, item.key)} disabled={pending?.startsWith('perm:')} onChange={(on) => togglePermission(item.key, on)} />
            ))}
          </Group>
        )}

        <Group title="Вход">
          <Row icon="key" color="#F59E0B" title="Сменить пароль" busy={pending === 'password'} onPress={changePassword} />
          <Row icon="number.circle" color="#8B5CF6" title="Сбросить PIN" busy={pending === 'pin'} onPress={changePin} />
          <Row icon="paperplane" color="#0EA5E9" title="Telegram" value={row.tgUsername ? `@${row.tgUsername}` : row.tgId ? 'привязан' : 'не привязан'} busy={pending === 'tg'} onPress={linkTelegram} />
        </Group>

        <Group title="Ключи входа" footer="Face ID на устройствах сотрудника. Удаление ключа не трогает пароль.">
          {(passkeys.data ?? []).map((key) => (
            <Row key={key.id} icon="faceid" color="#22C55E" title={key.deviceType === 'multiDevice' ? 'Ключ в iCloud Keychain' : 'Ключ на устройстве'} subtitle={new Date(key.createdAt).toLocaleDateString('ru-RU')} value="Удалить" valueColor={colors.red} onPress={() => removePasskey(key.id)} />
          ))}
        </Group>

        {!isSelf && (
          <DangerRow title="Уволить сотрудника" icon="person.badge.minus" onPress={remove} />
        )}
        {isSelf && <Text style={[type.footnote, styles.secondary, styles.centered]}>Это ваш профиль — удалить себя нельзя.</Text>}
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  chips: { flexDirection: 'row', gap: space.sm, padding: space.lg },
});
