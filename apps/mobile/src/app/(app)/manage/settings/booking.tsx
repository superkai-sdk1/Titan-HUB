import { Button, ContentUnavailableView, Form, Host, ProgressView, Section, Text, Toggle, VStack } from '@expo/ui/swift-ui';
import { font, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Share } from 'react-native';

import { primary, secondary } from '@/components/native-form';
import { saveBookingConfig, useBookingConfig } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const LINKS = [
  { loc: 'titan', title: 'Бронь в клубе', hint: 'Гость выбирает кабинку и время' },
  { loc: 'exit', title: 'Бронь выезда', hint: 'Мероприятие на площадке гостя' },
] as const;

/**
 * Онлайн-бронирование: публичная форма /book. Заявки приходят в «Мероприятия» и
 * уведомлением; подтверждение создаёт мероприятие (кабинка — с арендой по ставке зоны).
 */
export default function BookingSettingsScreen() {
  const router = useRouter();
  const config = useBookingConfig();
  const host = useSession((s) => s.club?.host ?? '');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const on = enabled ?? config.data?.enabled ?? false;

  const toggle = (next: boolean) => {
    setEnabled(next);
    saveBookingConfig(next)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        setEnabled(null);
        Alert.alert('Не сохранилось', errorText(error));
      });
  };

  if (!config.data) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {config.isError ? <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={config.error.message} /> : <ProgressView />}
      </Host>
    );
  }

  return (
    <>
      <Stack.Title>Онлайн-бронирование</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section footer={<Text>Гости бронируют сами по ссылке. Заявки приходят в «Мероприятия» и уведомлением.</Text>}>
            <Toggle label="Публичная форма брони" isOn={on} onIsOnChange={toggle} />
          </Section>

          {on && (
            <Section title="Ссылки для гостей" footer={<Text>Нажмите, чтобы отправить ссылку — в мессенджер, в сторис или на сайт.</Text>}>
              {LINKS.map((link) => {
                const url = `https://${host}/book?loc=${link.loc}`;
                return (
                  <Button
                    key={link.loc}
                    onPress={() => {
                      haptic.light();
                      void Share.share({ message: url, url });
                    }}>
                    <VStack alignment="leading" spacing={2}>
                      <Text modifiers={[primary]}>{link.title}</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), secondary, lineLimit(1)]}>{`${link.hint} · ${url.replace('https://', '')}`}</Text>
                    </VStack>
                  </Button>
                );
              })}
            </Section>
          )}

          <Section>
            <Button label="Открыть мероприятия" systemImage="calendar" onPress={() => router.navigate('/events')} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
