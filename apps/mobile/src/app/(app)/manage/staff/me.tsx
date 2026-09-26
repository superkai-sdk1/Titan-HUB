import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Avatar, DangerRow, GlassCard } from '@/components/new-check-parts';
import { Group, promptValue, Row, SwitchRow } from '@/components/settings-parts';
import { PERMISSIONS, permissionOn, setMyPin, updateMe } from '@/lib/admin-api';
import { clearClubCalendar, ensureCalendarAccess, syncEventsToCalendar } from '@/lib/calendar-sync';
import { markCalendarSynced, useDevicePrefs } from '@/lib/device-prefs';
import { useEvents } from '@/lib/events-api';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { pickAndUploadPhoto } from '@/lib/photo';
import { signOutEverywhere, useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** «ДД.ММ.ГГГГ» → «ГГГГ-ММ-ДД»; пустая строка стирает дату. */
function parseBirthday(input: string): string | null | undefined {
  if (!input) return null;
  const match = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(input);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getDate() !== Number(day) || date.getMonth() !== Number(month) - 1) return undefined;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const showBirthday = (value: string | null | undefined) => {
  if (!value) return 'не указан';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}.${month}.${year}` : value;
};

/** Мой профиль: имя и контакты, PIN, уведомления. Права показываем как есть — их выдаёт владелец. */
export default function MyProfileScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const me = useMe();
  const club = useSession((s) => s.club);
  const [pulling, setPulling] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const calendarSync = useDevicePrefs((state) => state.calendarSync);
  const setCalendarSync = useDevicePrefs((state) => state.setCalendarSync);
  const events = useEvents();

  const profile = me.data;
  const isOwner = profile?.role === 'owner';

  const refresh = async () => {
    setPulling(true);
    await me.refetch();
    setPulling(false);
  };

  const patch = (field: string, body: Parameters<typeof updateMe>[0], failure: string) => {
    setPending(field);
    updateMe(body)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        Alert.alert(failure, errorText(error));
      })
      .finally(() => setPending(null));
  };

  const changePhoto = () => pickAndUploadPhoto('Моё фото', (photoUrl) => patch('photo', { photoUrl }, 'Фото не сохранилось'), setPhotoBusy);

  /** Мероприятия клуба в календаре телефона: разрешение спрашиваем при включении. */
  const toggleCalendar = (on: boolean) => {
    if (!on) {
      Alert.alert('Убрать мероприятия из календаря?', 'Календарь «Titan HUB» и записи в нём удалятся с этого устройства.', [
        { text: 'Оставить записи', onPress: () => void setCalendarSync(false) },
        {
          text: 'Убрать',
          style: 'destructive',
          onPress: () => {
            void setCalendarSync(false);
            void clearClubCalendar();
          },
        },
      ]);
      return;
    }
    void (async () => {
      if (!(await ensureCalendarAccess())) {
        Alert.alert('Нужен доступ к календарю', 'Разрешите доступ в настройках телефона — тогда мероприятия будут появляться в календаре с напоминаниями.', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      await setCalendarSync(true);
      const result = await syncEventsToCalendar(events.data ?? []).catch(() => null);
      markCalendarSynced();
      haptic.success();
      Alert.alert(
        'Календарь подключён',
        result && result.added > 0
          ? `Добавлено мероприятий: ${result.added}. Напоминания придут за час и за 30 минут до начала.`
          : 'Новые мероприятия будут появляться в календаре с напоминаниями за час и за 30 минут.',
      );
    })();
  };

  const changePin = () =>
    promptValue({
      title: 'Новый PIN',
      message: '4 цифры для быстрого входа в кассу на этом устройстве',
      value: '',
      keyboard: 'number-pad',
      onSubmit: (pin) => {
        if (!/^\d{4}$/.test(pin)) return Alert.alert('PIN — ровно 4 цифры');
        setPending('pin');
        setMyPin(pin)
          .then(() => {
            haptic.success();
            Alert.alert('PIN обновлён');
          })
          .catch((error: unknown) => Alert.alert('PIN не изменён', errorText(error)))
          .finally(() => setPending(null));
      },
    });

  const logout = () =>
    Alert.alert('Выйти из кассы?', 'Для входа понадобится PIN или пароль.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void signOutEverywhere() },
    ]);

  const permissionList = PERMISSIONS.filter((item) => profile && permissionOn(profile, item.key))
    .map((item) => item.label)
    .join(', ');

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Мой профиль</Stack.Title>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <GlassCard style={styles.hero}>
          <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Сменить фото">
            <Avatar name={profile?.nickname ?? '··'} photoUrl={profile?.photoUrl} size={72} />
            {photoBusy && <ActivityIndicator style={styles.photoBusy} />}
          </Pressable>
          <Text style={[type.footnote, styles.secondary]}>Нажмите на фото, чтобы сменить</Text>
          <Text style={[type.title2, styles.label]} numberOfLines={1}>
            {profile?.nickname ?? ''}
          </Text>
          <Text style={[type.subhead, styles.secondary]}>{`${isOwner ? 'Владелец' : 'Сотрудник'} · ${club?.name ?? ''}`}</Text>
        </GlassCard>

        <Group title="О себе">
          <Row icon="person" color="#64748B" title="Никнейм" value={profile?.nickname ?? ''} busy={pending === 'nickname'} onPress={() => promptValue({ title: 'Никнейм', message: 'Имя, которое видят коллеги и гости', value: profile?.nickname ?? '', onSubmit: (nickname) => (nickname.length < 2 ? Alert.alert('Слишком короткий никнейм') : patch('nickname', { nickname }, 'Никнейм не изменён')) })} />
          <Row icon="signature" color="#8B5CF6" title="Имя и фамилия" value={profile?.fullName ?? 'не указаны'} busy={pending === 'fullName'} onPress={() => promptValue({ title: 'Имя и фамилия', value: profile?.fullName ?? '', onSubmit: (fullName) => patch('fullName', { fullName: fullName || null }, 'Имя не изменено') })} />
          <Row icon="phone" color="#10B981" title="Телефон" value={profile?.phone ?? 'не указан'} busy={pending === 'phone'} onPress={() => promptValue({ title: 'Телефон', value: profile?.phone ?? '', keyboard: 'phone-pad', onSubmit: (phone) => patch('phone', { phone: phone || null }, 'Телефон не изменён') })} />
          <Row
            icon="gift"
            color="#EC4899"
            title="День рождения"
            value={showBirthday(profile?.birthday)}
            busy={pending === 'birthday'}
            onPress={() =>
              promptValue({
                title: 'День рождения',
                message: 'В формате ДД.ММ.ГГГГ',
                value: showBirthday(profile?.birthday) === 'не указан' ? '' : showBirthday(profile?.birthday),
                keyboard: 'number-pad',
                onSubmit: (raw) => {
                  const birthday = parseBirthday(raw);
                  if (birthday === undefined) return Alert.alert('Дата в формате ДД.ММ.ГГГГ');
                  patch('birthday', { birthday }, 'Дата не изменена');
                },
              })
            }
          />
        </Group>

        <Group title="Вход и уведомления">
          <Row icon="number.circle" color="#F59E0B" title="Изменить PIN" busy={pending === 'pin'} onPress={changePin} />
          <Row icon="bell.badge" color="#0EA5E9" title="Уведомления" chevron onPress={() => router.push('/manage/staff/notifications')} />
          <SwitchRow
            icon="calendar"
            color="#F43F5E"
            title="Мероприятия в календаре"
            subtitle="Напоминания за час и за 30 минут"
            value={calendarSync}
            onChange={toggleCalendar}
          />
        </Group>

        {!isOwner && (
          <Group title="Права" footer="Права выдаёт владелец клуба.">
            <Row icon="checkmark.shield" color="#22C55E" title="Доступные разделы" subtitle={permissionList || 'не настроены'} />
          </Group>
        )}

        <DangerRow title="Выйти из кассы" icon="rectangle.portrait.and.arrow.right" onPress={logout} />
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  photoBusy: { position: 'absolute', left: 0, right: 0, top: 26 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  pressed: { opacity: 0.6 },
});
