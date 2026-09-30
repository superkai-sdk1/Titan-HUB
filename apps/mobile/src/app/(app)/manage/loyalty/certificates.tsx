import { ContentUnavailableView, Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { Alert, Share } from 'react-native';

import { ActionRow, LinkRow } from '@/components/native-form';
import { promptValue } from '@/components/settings-parts';
import { deactivateCertificate, issueCertificate, useCertificates } from '@/lib/admin-api';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { parseAmount } from '@/lib/shift-api';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Подарочные сертификаты: действующие и погашенные, выпуск нового, погашение. */
export default function CertificatesScreen() {
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const certificates = useCertificates();
  const list = certificates.data ?? [];
  const active = list.filter((c) => c.status === 'active');
  const closed = list.filter((c) => c.status !== 'active');

  const issue = () =>
    promptValue({
      title: 'Новый сертификат',
      message: 'Номинал сертификата в рублях',
      value: '',
      keyboard: 'decimal-pad',
      onSubmit: (raw) => {
        const nominal = parseAmount(raw);
        if (nominal === null || nominal <= 0) return Alert.alert('Введите номинал');
        issueCertificate(nominal)
          .then((certificate) => {
            haptic.success();
            Alert.alert(`Сертификат на ${formatMoney(nominal)}`, `Код: ${certificate.code}\n\nПередайте код гостю — на кассе он оплачивает им покупку.`, [
              { text: 'Готово', style: 'cancel' },
              { text: 'Поделиться', onPress: () => void Share.share({ message: certificate.code }) },
            ]);
          })
          .catch((error: unknown) => {
            haptic.error();
            Alert.alert('Сертификат не выпущен', errorText(error));
          });
      },
    });

  const close = (id: string, code: string) =>
    Alert.alert(`Погасить ${code}?`, 'Сертификат перестанет приниматься на кассе. Отменить это нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Погасить',
        style: 'destructive',
        onPress: () =>
          void deactivateCertificate(id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Сертификат не погашен', errorText(error))),
      },
    ]);

  return (
    <>
      <Stack.Title>Сертификаты</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await certificates.refetch()))]}>
          <Section footer={<Text>Сертификат — код на сумму: гость оплачивает им покупку на кассе, остаток сохраняется.</Text>}>
            <ActionRow title="Выпустить сертификат" icon="plus.circle.fill" onPress={issue} />
          </Section>

          <Section title="Действующие" footer={isOwner && active.length > 0 ? <Text>Нажмите на сертификат, чтобы погасить его.</Text> : undefined}>
            {certificates.isLoading ? (
              <ProgressView />
            ) : active.length === 0 ? (
              <ContentUnavailableView title="Действующих сертификатов нет" systemImage="giftcard" />
            ) : (
              active.map((c) => (
                <LinkRow
                  key={c.id}
                  icon="giftcard.fill"
                  color="#AF52DE"
                  title={c.code}
                  subtitle={c.balance < c.amount ? `осталось ${formatMoney(c.balance)} из ${formatMoney(c.amount)}` : 'не использован'}
                  value={formatMoney(c.amount)}
                  chevron={false}
                  onPress={isOwner ? () => close(c.id, c.code) : undefined}
                />
              ))
            )}
          </Section>

          {closed.length > 0 && (
            <Section title="Погашенные">
              {closed.map((c) => (
                <LinkRow key={c.id} icon="giftcard" color="#8E8E93" title={c.code} subtitle="погашен" value={formatMoney(c.amount)} />
              ))}
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
