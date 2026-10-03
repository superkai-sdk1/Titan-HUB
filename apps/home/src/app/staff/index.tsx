// Панель сотрудника: вход PIN-ом (удержать логотип 2 секунды на любом экране гостя).
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PinPad } from '@/components/pin-pad';
import { ActionRow, InfoRow, Section, Segments, ToggleRow } from '@/components/staff-ui';
import { Button, IconButton } from '@/components/ui';
import { kickHa, useHa } from '@/lib/home-assistant';
import { usePrefs } from '@/lib/prefs';
import { queryClient, useSmartHome } from '@/lib/queries';
import { forgetClubCompletely } from '@/lib/reset';
import { useSession } from '@/lib/session';
import { useStaff, verifyStaffPin } from '@/lib/staff';
import { colors, GUTTER, space, type } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

import { Kiosk, type KioskStatus } from '../../../modules/titan-kiosk';

export default function StaffScreen() {
  const router = useRouter();
  const sp = useSession((s) => s.space);
  const until = useStaff((s) => s.until);
  const now = useNow(5_000);
  const unlocked = until > now.getTime();

  const close = () => {
    useStaff.getState().lock();
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="close" label="Закрыть" onPress={close} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>Для сотрудника</Text>
          <Text style={type.caption}>{sp?.name}</Text>
        </View>
        {unlocked ? <Button title="Готово" size="md" onPress={close} /> : null}
      </View>
      {unlocked ? (
        <Panel />
      ) : (
        <View style={styles.gate}>
          <Text style={[type.body, { color: colors.textSecondary, marginBottom: space.xl }]}>Введите PIN — тот же, что для входа в кассу</Text>
          <PinPad onSubmit={(pin) => verifyStaffPin(sp!.id, pin)} />
        </View>
      )}
    </View>
  );
}

const HA_STATUS: Record<string, { text: string; tone: string }> = {
  connected: { text: 'Подключено', tone: colors.green },
  connecting: { text: 'Подключаемся…', tone: colors.amber },
  offline: { text: 'Нет связи', tone: colors.red },
  auth_failed: { text: 'Неверный токен', tone: colors.red },
  idle: { text: 'Не настроено', tone: colors.textMuted },
};

function Panel() {
  const router = useRouter();
  const session = useSession();
  const staff = useStaff((s) => s.nickname);
  const touch = useStaff((s) => s.touch);
  const prefs = usePrefs();
  const smart = useSmartHome();
  const haStatus = useHa((s) => s.status);
  const [status, setStatus] = useState<KioskStatus>(() => Kiosk.getStatus());
  const refresh = () => setStatus(Kiosk.getStatus());

  const act = async (fn: () => Promise<unknown>) => {
    touch();
    await fn();
    refresh();
  };

  const lockLabel = status.lockTask === 'locked' ? 'Закреплён (киоск)' : status.lockTask === 'pinned' ? 'Закреплён' : 'Не закреплён';
  const room = smart.data?.room;
  const roomText = !smart.data?.connection
    ? 'Home Assistant не подключён в Titan HUB'
    : room && (room.lights.length || room.climate)
      ? [...room.lights.map((l) => l.name), room.climate?.name].filter(Boolean).join(', ')
      : 'Устройства не выбраны';
  const ha = HA_STATUS[haStatus] ?? HA_STATUS.idle!;

  const confirm = (title: string, message: string, ok: string, onOk: () => void) =>
    Alert.alert(title, message, [{ text: 'Отмена', style: 'cancel' }, { text: ok, style: 'destructive', onPress: onOk }]);

  const openSystem = (kind: 'settings' | 'wifi' | 'home') =>
    act(async () => {
      await Kiosk.stopLockTask();
      await Kiosk.openSettings(kind);
    });

  return (
    <ScrollView contentContainerStyle={styles.panel} onScrollBeginDrag={touch}>
      <View style={styles.columns}>
        <View style={styles.column}>
          <Section title="Планшет">
            <InfoRow icon="store-outline" label="Клуб" value={session.club?.name} />
            <InfoRow icon="sofa-outline" label="Кабинка" value={session.space?.name} />
            <InfoRow icon="account-tie" label="Подтвердил" value={staff ?? session.staff} />
            <InfoRow icon="tablet" label="Устройство" value={`${status.model} · Android ${status.androidVersion}`} />
            <InfoRow icon="information-outline" label="Версия" value={`${Application.nativeApplicationVersion ?? '—'} (${Application.nativeBuildVersion ?? '—'})`} />
          </Section>

          <Section
            title="Режим киоска"
            footer={status.isDeviceOwner
              ? 'Titan Home — владелец устройства: экран закрепляется сам, «Домой» ведёт в киоск, шторка и экран блокировки отключены.'
              : 'Полный киоск без вопросов: один раз на сброшенном планшете выполните на компьютере\nadb shell dpm set-device-owner ru.titan.home/expo.modules.titankiosk.KioskAdminReceiver\nБез этого Android спросит подтверждение закрепления, а «Домой» нужно выбрать вручную.'}
          >
            <InfoRow icon="shield-lock-outline" label="Владелец устройства" value={status.isDeviceOwner ? 'Да' : 'Нет'} tone={status.isDeviceOwner ? colors.green : undefined} />
            <InfoRow icon="lock-outline" label="Экран" value={lockLabel} tone={status.lockTask !== 'none' ? colors.green : colors.amber} />
            <InfoRow icon="home-outline" label="Домашний экран" value={status.isDefaultHome ? 'Titan Home' : 'Другое приложение'} tone={status.isDefaultHome ? colors.green : colors.amber} />
            {status.lockTask === 'none' ? (
              <ActionRow icon="pin-outline" label="Закрепить экран" hint="Гость не выйдет из Titan Home" onPress={() => void act(async () => { await prefs.update({ lockTask: true }); await Kiosk.startLockTask(); })} />
            ) : (
              <ActionRow icon="pin-off-outline" label="Открепить экран" hint="Например, чтобы обновить приложение" onPress={() => void act(async () => { await prefs.update({ lockTask: false }); await Kiosk.stopLockTask(); })} />
            )}
            {!status.isDefaultHome ? <ActionRow icon="home-import-outline" label="Сделать домашним экраном" hint="Выберите Titan Home в списке" onPress={() => void openSystem('home')} /> : null}
          </Section>

          <Section
            title="Ориентация экрана"
            footer="«Как планшет» — экран поворачивается вместе с планшетом; закрепите поворот в настройках Android. Альбомную или книжную фиксируйте, только если планшет так и стоит: иначе Android сузит экран полосой."
          >
            <Segments
              value={prefs.orientation}
              onChange={(o) => void act(async () => { await prefs.update({ orientation: o }); await Kiosk.setOrientation(o); })}
              options={[
                { key: 'auto', label: 'Как планшет', icon: 'screen-rotation' },
                { key: 'landscape', label: 'Альбомная', icon: 'phone-rotate-landscape' },
                { key: 'portrait', label: 'Книжная', icon: 'phone-rotate-portrait' },
              ]}
            />
          </Section>
        </View>

        <View style={styles.column}>
          <Section title="Свет и климат" footer="Адрес и долгосрочный токен Home Assistant вбиваются в Titan HUB: «Управление» → «Настройки» → «Интеграции». Планшет сам подключается к HA по локальной сети и держит связь постоянно — это делает фоновый сервис Android, даже когда экран свёрнут, и после перезагрузки. Здесь выбираются устройства этой кабинки.">
            <InfoRow icon="home-automation" label="Home Assistant" value={smart.data?.connection ? ha.text : 'Не подключён'} tone={smart.data?.connection ? ha.tone : colors.textMuted} />
            {smart.data?.connection && haStatus !== 'connected' ? (
              <ActionRow icon="refresh" label="Переподключить" hint="Не ждать следующей попытки" onPress={() => { touch(); kickHa(); }} />
            ) : null}
            <ActionRow icon="lightbulb-group-outline" label="Устройства кабинки" hint={roomText} onPress={() => { touch(); router.push('/staff/room'); }} disabled={!smart.data?.connection} />
            <ToggleRow icon="power-sleep" label="Выключать после счёта" hint="Когда счёт закрыт — погасить свет и выключить кондиционер" value={prefs.roomAutoOff} onChange={(v) => void act(() => prefs.update({ roomAutoOff: v }))} />
          </Section>

          <Section title="Обслуживание">
            <ActionRow icon="refresh" label="Обновить данные" hint="Меню, счёт, устройства" onPress={() => void act(() => queryClient.invalidateQueries())} />
            <ActionRow icon="wifi-cog" label="Настройки Wi-Fi" onPress={() => void openSystem('wifi')} />
            <ActionRow icon="cog-outline" label="Настройки Android" hint="Экран открепится; вернуться — кнопкой «Домой»" onPress={() => void openSystem('settings')} />
            {status.isDeviceOwner ? (
              <ActionRow icon="restart" label="Перезагрузить планшет" onPress={() => confirm('Перезагрузить планшет?', 'Titan Home откроется сам после включения.', 'Перезагрузить', () => void Kiosk.reboot())} />
            ) : null}
          </Section>

          <Section title="Сброс">
            <ActionRow icon="swap-horizontal" label="Другая кабинка" tone={colors.amber} onPress={() => confirm('Перенести планшет?', 'Понадобится выбрать кабинку и ввести PIN.', 'Сменить', () => void session.setSpace(null))} />
            <ActionRow icon="logout" label="Другой клуб" tone={colors.amber} onPress={() => confirm('Отключить от клуба?', 'Планшет забудет клуб и кабинку.', 'Отключить', () => void forgetClubCompletely())} />
            {status.isDeviceOwner ? (
              <ActionRow
                icon="shield-off-outline"
                label="Снять режим владельца устройства"
                hint="Планшет станет обычным; удалить Titan Home можно будет только после этого"
                tone={colors.red}
                onPress={() => confirm('Снять режим киоска?', 'Закрепление, «Домой» и отключение шторки будут сняты.', 'Снять', () => void act(() => Kiosk.clearDeviceOwner()))}
              />
            ) : null}
          </Section>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.md },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: GUTTER },
  panel: { padding: GUTTER, paddingTop: space.sm },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  column: { flexGrow: 1, flexBasis: 380, gap: space.xl },
});
