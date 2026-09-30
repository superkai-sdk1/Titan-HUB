import { ContentUnavailableView, Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { Stack } from 'expo-router';
import { Alert } from 'react-native';

import { FieldRow } from '@/components/native-form';
import { saveReviewsConfig, useReviewsConfig, type ReviewsConfig } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Отзывы гостей: ссылки на страницы отзывов клуба и текст приглашения, который уходит гостям. */
export default function ReviewsSettingsScreen() {
  const config = useReviewsConfig();

  const save = (patch: Partial<ReviewsConfig>) =>
    saveReviewsConfig(patch)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        Alert.alert('Не сохранилось', errorText(error));
      });

  if (!config.data) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {config.isError ? <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={config.error.message} /> : <ProgressView />}
      </Host>
    );
  }

  return (
    <>
      <Stack.Title>Отзывы гостей</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section title="Яндекс Карты" footer={<Text>Ссылка на страницу «Оставить отзыв» вашего клуба.</Text>}>
            <FieldRow value={config.data.yandexUrl} placeholder="https://yandex.ru/maps/org/…" keyboard="url" maxLength={500} onCommit={(yandexUrl) => void save({ yandexUrl })} />
          </Section>
          <Section title="2ГИС">
            <FieldRow value={config.data.twogisUrl} placeholder="https://2gis.ru/…" keyboard="url" maxLength={500} onCommit={(twogisUrl) => void save({ twogisUrl })} />
          </Section>
          <Section title="Приглашение" footer={<Text>Текст, с которым гостю предлагают оставить отзыв. QR-коды для печати — в веб-панели.</Text>}>
            <FieldRow value={config.data.inviteText} placeholder="Понравился вечер? Расскажите о нас!" maxLength={500} multiline onCommit={(inviteText) => void save({ inviteText })} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
