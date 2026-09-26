import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { GlassCard, GlassChip, PrimaryButton, SheetHeader } from '@/components/new-check-parts';
import { Row } from '@/components/settings-parts';
import { unlinkClientTg, useClient, useClientTelegramLink, useClientTgAccounts } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Привязка Telegram клиента: гость сканирует QR или открывает ссылку, бот кошелька
 * связывает свой аккаунт с профилем. Ссылка подписанная и живёт 15 минут.
 */
export default function ClientTelegramSheet() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const client = useClient(clientId);
  const accounts = useClientTgAccounts(clientId);
  const invite = useClientTelegramLink(clientId);
  const [busy, setBusy] = useState(false);

  const link = invite.data ?? null;
  const failed = invite.error ? errorText(invite.error) : null;

  const unlink = (tgId: string, username: string | null) =>
    Alert.alert(`Отвязать ${username ? `@${username}` : 'Telegram'}?`, 'Клиент перестанет получать уведомления и лишится доступа в Titan Resident с этого аккаунта.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отвязать',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          unlinkClientTg(clientId, tgId)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Не отвязано', errorText(error)))
            .finally(() => setBusy(false));
        },
      },
    ]);

  const linked = accounts.data ?? [];

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Telegram клиента" onClose={() => router.back()} />

      <Text style={[type.footnote, styles.caption]}>{`Покажите ${client.data?.nickname ?? 'гостю'} этот код — он откроет бота и привяжет свой Telegram. Код действует 15 минут.`}</Text>

      <GlassCard style={styles.qrCard}>
        {link ? (
          <Image source={{ uri: link.qrDataUrl }} style={styles.qr} contentFit="contain" transition={160} accessibilityLabel="QR-код привязки" />
        ) : (
          <View style={styles.qr}>{failed ? <Text style={[type.subhead, styles.caption, styles.centered]}>{failed}</Text> : <ActivityIndicator />}</View>
        )}
      </GlassCard>

      <View style={styles.actions}>
        <GlassChip label="Открыть в Telegram" icon="paperplane" active={false} onPress={() => link && void Linking.openURL(link.deepLink).catch(() => Alert.alert('Не удалось открыть Telegram'))} />
        <GlassChip label="Поделиться" icon="square.and.arrow.up" active={false} onPress={() => link && void Share.share({ message: link.deepLink })} />
      </View>
      {/* Как «Участники чата» в вебе: гость уже писал в чат клуба — привязка без QR. */}
      <View style={styles.actions}>
        <GlassChip
          label="Выбрать из чата клуба"
          icon="person.2"
          active={false}
          onPress={() => router.push({ pathname: '/manage/clients/tg-roster', params: { clientId } })}
        />
      </View>

      {linked.length > 0 && (
        <GlassCard>
          {linked.map((account, index) => (
            <View key={account.tgId}>
              {index > 0 && <View style={styles.separator} />}
              <Row
                icon="checkmark.circle"
                color="#22C55E"
                title={account.username ? `@${account.username}` : `ID ${account.tgId}`}
                subtitle={account.primary ? 'Основной аккаунт' : 'Дополнительный'}
                value="Отвязать"
                valueColor={colors.red}
                busy={busy}
                onPress={() => unlink(account.tgId, account.username)}
              />
            </View>
          ))}
        </GlassCard>
      )}
      {linked.length === 0 && !accounts.isLoading && <Text style={[type.footnote, styles.caption, styles.centered]}>Пока ни один Telegram не привязан.</Text>}

      <PrimaryButton title="Готово" icon="checkmark" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  centered: { textAlign: 'center' },
  qrCard: { alignItems: 'center', padding: space.lg },
  qr: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'white' },
  actions: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 62 },
});
