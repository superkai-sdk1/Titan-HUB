import { ContentUnavailableView, Form, HStack, Host, Picker, ProgressView, RNHostView, Section, Text, Toggle, VStack } from '@expo/ui/swift-ui';
import { font, lineLimit, pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Linking } from 'react-native';

import { ActionRow, LinkRow, primary, secondary, TextRow } from '@/components/native-form';
import { Avatar } from '@/components/new-check-parts';
import { promptValue } from '@/components/settings-parts';
import { deleteStaff, deleteStaffPasskey, PERMISSIONS, permissionOn, resetStaffPin, staffTelegramLink, updateStaff, useStaffAdmin, useStaffPasskeys } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isPin = (value: string) => /^\d{4}$/.test(value);

/** Карточка сотрудника: профиль, роль, права, пароль и PIN, Telegram и ключи входа. */
export default function StaffMemberScreen() {
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const me = useMe();
  const staff = useStaffAdmin(isOwner);
  const passkeys = useStaffPasskeys(staffId, isOwner);

  const row = staff.data?.find((item) => item.id === staffId);
  const isSelf = me.data?.id === staffId;

  if (!row) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {staff.isLoading ? <ProgressView /> : <ContentUnavailableView title="Сотрудник не найден" systemImage="person.crop.circle.badge.questionmark" />}
      </Host>
    );
  }

  const patch = (body: Parameters<typeof updateStaff>[1], failure: string) =>
    updateStaff(row.id, body)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        Alert.alert(failure, errorText(error));
      });

  const setRole = (role: 'owner' | 'staff') => {
    if (role === row.role) return;
    haptic.light();
    Alert.alert(role === 'owner' ? `Сделать ${row.nickname} владельцем?` : `Сделать ${row.nickname} сотрудником?`, role === 'owner' ? 'Владелец видит деньги, аналитику и настройки клуба.' : 'Доступ ограничится правами сотрудника.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сменить роль', onPress: () => void patch({ role }, 'Роль не изменена') },
    ]);
  };

  const togglePermission = (key: string, on: boolean) => {
    const permissions: Record<string, boolean> = {};
    for (const item of PERMISSIONS) permissions[item.key] = item.key === key ? on : permissionOn(row, item.key);
    void patch({ permissions }, 'Права не изменены');
  };

  const changePassword = () =>
    promptValue({
      title: 'Новый пароль',
      message: `Пароль для входа ${row.nickname} в кассу. Не меньше 4 символов.`,
      value: '',
      onSubmit: (password) => {
        if (password.length < 4) return Alert.alert('Пароль короче 4 символов');
        void patch({ password }, 'Пароль не изменён');
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
        resetStaffPin(row.id, pin)
          .then(() => {
            haptic.success();
            Alert.alert('PIN обновлён', `Передайте ${row.nickname} новый PIN.`);
          })
          .catch((error: unknown) => Alert.alert('PIN не изменён', errorText(error)));
      },
    });

  const linkTelegram = () => {
    haptic.light();
    staffTelegramLink(row.id)
      .then(({ deepLink, linked, tgUsername }) =>
        Alert.alert(linked ? `Telegram привязан${tgUsername ? `: @${tgUsername}` : ''}` : 'Привязка Telegram', linked ? 'Ссылка ниже перепривяжет аккаунт к другому Telegram.' : `Откройте ссылку на телефоне ${row.nickname} — бот свяжет аккаунт с кассой.`, [
          { text: 'Закрыть', style: 'cancel' },
          { text: 'Открыть в Telegram', onPress: () => void Linking.openURL(deepLink).catch(() => Alert.alert('Не удалось открыть Telegram')) },
        ]),
      )
      .catch((error: unknown) => Alert.alert('Ссылка не получена', errorText(error)));
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
    <>
      <Stack.Title>{row.nickname}</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([staff.refetch(), passkeys.refetch()])))]}>
          <Section>
            <HStack spacing={14}>
              <RNHostView matchContents>
                <Avatar name={row.nickname} photoUrl={row.photoUrl} size={60} />
              </RNHostView>
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold' }), primary, lineLimit(1)]}>{row.nickname}</Text>
                <Text modifiers={[secondary]}>{row.role === 'owner' ? 'Владелец' : 'Сотрудник'}</Text>
              </VStack>
            </HStack>
          </Section>

          <Section title="Профиль" footer={<Text>Под никнеймом сотрудник входит в кассу.</Text>}>
            <TextRow
              label="Никнейм"
              value={row.nickname}
              capitalize="never"
              onCommit={(nickname) => (nickname.length < 2 ? Alert.alert('Слишком короткий никнейм') : void patch({ nickname }, 'Никнейм не изменён'))}
            />
            <TextRow label="Телефон" value={row.phone ?? ''} placeholder="Не указан" keyboard="phone-pad" onCommit={(phone) => void patch({ phone }, 'Телефон не изменён')} />
          </Section>

          <Section
            title="Роль"
            footer={<Text>{row.role === 'owner' ? 'Владелец видит всё и может менять настройки клуба.' : 'Сотрудник работает в кассе; разделы «Управления» открываются правами ниже.'}</Text>}>
            <Picker selection={row.role === 'owner' ? 'owner' : 'staff'} onSelectionChange={(value) => setRole(value as 'owner' | 'staff')} modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('staff')]}>Сотрудник</Text>
              <Text modifiers={[tag('owner')]}>Владелец</Text>
            </Picker>
          </Section>

          {row.role !== 'owner' && (
            <Section title="Права" footer={<Text>Выключенное право убирает раздел из «Управления» у этого сотрудника.</Text>}>
              {PERMISSIONS.map((item) => (
                <Toggle key={item.key} label={item.label} isOn={permissionOn(row, item.key)} onIsOnChange={(on) => togglePermission(item.key, on)} />
              ))}
            </Section>
          )}

          <Section title="Вход">
            <LinkRow icon="key.fill" color="#FF9500" title="Сменить пароль" chevron={false} onPress={changePassword} />
            <LinkRow icon="number.circle.fill" color="#AF52DE" title="Сбросить PIN" chevron={false} onPress={changePin} />
            <LinkRow icon="paperplane.fill" color="#32ADE6" title="Telegram" value={row.tgUsername ? `@${row.tgUsername}` : row.tgId ? 'привязан' : 'не привязан'} onPress={linkTelegram} />
          </Section>

          {(passkeys.data ?? []).length > 0 && (
            <Section title="Ключи входа" footer={<Text>Face ID на устройствах сотрудника. Удаление ключа не трогает пароль.</Text>}>
              {(passkeys.data ?? []).map((key) => (
                <LinkRow
                  key={key.id}
                  icon="faceid"
                  color="#34C759"
                  title={key.deviceType === 'multiDevice' ? 'Ключ в iCloud Keychain' : 'Ключ на устройстве'}
                  subtitle={new Date(key.createdAt).toLocaleDateString('ru-RU')}
                  value="Удалить"
                  valueColor={colors.red}
                  chevron={false}
                  onPress={() => removePasskey(key.id)}
                />
              ))}
            </Section>
          )}

          <Section footer={isSelf ? <Text>Это ваш профиль — удалить себя нельзя.</Text> : undefined}>
            {!isSelf && <ActionRow title="Уволить сотрудника" icon="person.badge.minus" destructive onPress={remove} />}
          </Section>
        </Form>
      </Host>
    </>
  );
}
