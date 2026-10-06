import { ContentUnavailableView, Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import { ActionRow, LinkRow } from '@/components/native-form';
import { KINDS, ROTATIONS, deviceStatus, useScreens } from '@/lib/screens-api';
import { useSession } from '@/lib/session';

/**
 * «Экраны» — телевизоры клуба с приложением Titan Menu. У каждого свои настройки (что
 * показывает, как висит, тема, слайды); подключить новый ТВ — поиском в Wi‑Fi сети.
 */
export default function ScreensScreen() {
  const router = useRouter();
  const screens = useScreens();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const list = screens.data ?? [];

  if (screens.isLoading) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }
  if (screens.error && !screens.data) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={screens.error.message} />
      </Host>
    );
  }

  return (
    <>
      <Stack.Title>Экраны</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form
          modifiers={[
            refreshable(async () => {
              await screens.refetch();
            }),
          ]}>
          <Section
            title="Телевизоры"
            footer={<Text>У каждого экрана свои настройки: меню или слайдшоу, как висит ТВ, тема и картинки. Приставка подхватывает изменения за 20 секунд.</Text>}>
            {list.length === 0 ? (
              <Text>Экранов пока нет</Text>
            ) : (
              list.map((s) => {
                const status = deviceStatus(s);
                const kind = KINDS.find((k) => k.key === s.kind);
                const rotation = ROTATIONS.find((r) => r.key === s.rotation);
                return (
                  <LinkRow
                    key={s.id}
                    icon={s.kind === 'slideshow' ? 'photo.on.rectangle' : 'tv'}
                    color={s.kind === 'slideshow' ? '#FF9500' : '#8B5CF6'}
                    title={s.name}
                    subtitle={`${kind?.label ?? ''} · ${rotation?.label ?? ''} · ${status.label}`}
                    onPress={() => router.push({ pathname: '/manage/screens/[screenId]', params: { screenId: s.id } })}
                  />
                );
              })
            )}
          </Section>

          {isOwner && (
            <Section footer={<Text>Телефон найдёт приставку с Titan Menu в той же Wi‑Fi сети — по коду на экране телевизора.</Text>}>
              <ActionRow title="Подключить ТВ" icon="antenna.radiowaves.left.and.right" onPress={() => router.push('/manage/screens/connect')} />
              <ActionRow title="Добавить экран" icon="plus" onPress={() => router.push('/manage/screens/new')} />
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
