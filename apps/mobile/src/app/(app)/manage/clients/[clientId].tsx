import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { TierBadge } from '@/components/client-row';
import { Avatar, GlassCard, sheetStyles } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import {
  adjustVisits,
  archiveClient,
  BALANCE_OPS,
  clientPhoto,
  gomafiaIdOf,
  purgeClient,
  restoreClient,
  tierLook,
  transactionLook,
  updateClient,
  useClient,
  useClientTiers,
  useClientTransactions,
  userTags,
  useVisitProgress,
  whenText,
  type BalanceOp,
  type ClientTransaction,
} from '@/lib/clients-api';
import { normalizePhone } from '@/lib/events-api';
import { usePageGutter } from '@/lib/layout';
import { pickAndUploadPhoto } from '@/lib/photo';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

type Tab = 'main' | 'history';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Карточка клиента: фото, статус, депозит или долг и бонусы крупно; связь в один тап;
 * операции с балансом и бонусами — шторками; прогресс «Новичок → Резидент»; контакты;
 * вкладка «История» — движения денег и посещений.
 */
export default function ClientScreen() {
  const gutter = usePageGutter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const client = useClient(clientId);
  const tiers = useClientTiers();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [tab, setTab] = useState<Tab>('main');
  const [pulling, setPulling] = useState(false);
  const data = client.data;
  const visits = useVisitProgress(clientId, data?.clientTier === 'newbie' && !data?.deletedAt);
  const history = useClientTransactions(clientId);
  const [visitBusy, setVisitBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <View style={styles.state}>
          {client.isError ? <Text style={[type.body, styles.secondary]}>{errorText(client.error)}</Text> : <ActivityIndicator />}
        </View>
      </AmbientBackdrop>
    );
  }

  const tier = tierLook(data.clientTier, tiers.data);
  const balance = toNumber(data.balance);
  const bonus = Math.floor(toNumber(data.bonusPoints));
  const archived = !!data.deletedAt;
  const phone = data.phone ? normalizePhone(data.phone) : null;
  const gomafiaId = gomafiaIdOf(data);
  const tags = userTags(data);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([client.refetch(), history.refetch(), visits.refetch()]);
    setPulling(false);
  };

  const openBalance = (op: BalanceOp) => {
    haptic.light();
    router.push({ pathname: '/manage/clients/adjust', params: { clientId, mode: 'balance', op } });
  };
  const openBonus = (sign: 'plus' | 'minus') => {
    haptic.light();
    router.push({ pathname: '/manage/clients/adjust', params: { clientId, mode: 'bonus', op: sign } });
  };

  const archive = () =>
    Alert.alert('Отправить в архив?', `${data.nickname} скроется из списков. Вернуть можно в разделе «Архив».`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'В архив',
        style: 'destructive',
        onPress: () =>
          archiveClient(data, isOwner)
            .then(() => haptic.success())
            .catch((error: unknown) => {
              haptic.error();
              Alert.alert('Клиент не в архиве', errorText(error));
            }),
      },
    ]);

  const restore = () =>
    restoreClient(data.id)
      .then(() => haptic.success())
      .catch((error: unknown) => {
        haptic.error();
        Alert.alert('Клиент не восстановлен', errorText(error));
      });

  const purge = () =>
    Alert.alert(
      'Удалить навсегда?',
      `Данные ${data.nickname} будут обезличены без возможности восстановления. История чеков клуба сохранится.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () =>
            purgeClient(data.id)
              .then(() => {
                haptic.success();
                router.back();
              })
              .catch((error: unknown) => {
                haptic.error();
                Alert.alert('Клиент не удалён', errorText(error));
              }),
        },
      ],
    );

  const changeVisits = async (delta: 1 | -1) => {
    haptic.selection();
    setVisitBusy(true);
    try {
      const result = await adjustVisits(data.id, delta);
      if (result.promoted) {
        haptic.success();
        Alert.alert('Клиент стал резидентом 🎉', `${data.nickname} набрал ${result.threshold} посещений.`);
      }
    } catch (error) {
      haptic.error();
      Alert.alert('Посещение не изменено', errorText(error));
    } finally {
      setVisitBusy(false);
    }
  };

  const changePhoto = () => pickAndUploadPhoto('Фото клиента', (photoUrl) => void savePhoto(photoUrl), setPhotoBusy);

  const savePhoto = (photoUrl: string | null) =>
    updateClient(data.id, { photoUrl })
      .then(() => haptic.success())
      .catch((error: unknown) => Alert.alert('Фото не сохранилось', errorText(error)));

  const removePhoto = () =>
    Alert.alert('Убрать фото?', 'Останется фото из Telegram или GoMafia, если оно есть.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Убрать', style: 'destructive', onPress: () => void savePhoto(null) },
    ]);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{data.nickname}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="ellipsis" accessibilityLabel="Действия с клиентом">
          {!archived && (
            <ToolbarMenuAction icon="pencil" onPress={() => router.push({ pathname: '/manage/clients/edit', params: { clientId: data.id } })}>
              Изменить
            </ToolbarMenuAction>
          )}
          {!archived && (
            <ToolbarMenuAction icon="camera" onPress={changePhoto}>
              {data.photoUrl ? 'Сменить фото' : 'Добавить фото'}
            </ToolbarMenuAction>
          )}
          {!archived && data.photoUrl && (
            <ToolbarMenuAction icon="trash" onPress={removePhoto}>
              Убрать фото
            </ToolbarMenuAction>
          )}
          {!archived && (
            <ToolbarMenuAction icon="paperplane" onPress={() => router.push({ pathname: '/manage/clients/telegram', params: { clientId: data.id } })}>
              Привязать Telegram
            </ToolbarMenuAction>
          )}
          {!archived && (
            <ToolbarMenuAction icon="archivebox" destructive onPress={archive}>
              В архив
            </ToolbarMenuAction>
          )}
          {archived && (
            <ToolbarMenuAction icon="arrow.uturn.backward" onPress={() => void restore()}>
              Восстановить из архива
            </ToolbarMenuAction>
          )}
          {archived && isOwner && (
            <ToolbarMenuAction icon="trash" destructive onPress={purge}>
              Удалить навсегда
            </ToolbarMenuAction>
          )}
        </ToolbarMenu>
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <View style={styles.hero}>
          <Pressable onPress={archived ? undefined : changePhoto} disabled={archived} accessibilityRole="button" accessibilityLabel="Фото клиента">
            <Avatar name={data.nickname} photoUrl={clientPhoto(data)} size={96} />
            {photoBusy && <ActivityIndicator style={styles.photoBusy} />}
          </Pressable>
          <Text style={[type.title1, styles.label, styles.centered]} numberOfLines={2}>
            {data.nickname}
          </Text>
          {data.fullName && <Text style={[type.subhead, styles.secondary]}>{data.fullName}</Text>}
          <View style={styles.heroBadges}>
            <TierBadge label={tier.label} color={tier.color} />
            {archived && <TierBadge label="В архиве" color="#94A3B8" />}
          </View>
        </View>

        <View style={styles.tiles}>
          <StatTile
            label={balance > 0.004 ? 'Депозит' : balance < -0.004 ? 'Долг' : 'Баланс'}
            value={formatMoney(Math.abs(balance), { kopecks: 'auto' })}
            color={balance > 0.004 ? '#06B6D4' : balance < -0.004 ? '#F43F5E' : '#94A3B8'}
            icon={balance < -0.004 ? 'exclamationmark.circle.fill' : 'wallet.bifold.fill'}
            onPress={archived ? undefined : () => openBalance(balance < -0.004 ? 'debt_repay' : 'deposit_add')}
          />
          <StatTile label="Бонусы" value={`★ ${bonus}`} color="#F59E0B" icon="star.fill" onPress={archived ? undefined : () => openBonus('plus')} />
        </View>

        <View style={styles.contactRow}>
          <ContactButton icon="phone.fill" label="Позвонить" color="#10B981" disabled={!phone} onPress={() => void Linking.openURL(`tel:+${phone}`)} />
          <ContactButton
            icon="paperplane.fill"
            label="Telegram"
            color="#0EA5E9"
            disabled={!data.tgUsername && !phone}
            onPress={() => void Linking.openURL(data.tgUsername ? `https://t.me/${data.tgUsername.replace(/^@/, '')}` : `tg://resolve?phone=${phone}`)}
          />
          <ContactButton icon="message.fill" label="WhatsApp" color="#22C55E" disabled={!phone} onPress={() => void Linking.openURL(`https://wa.me/${phone}`)} />
        </View>

        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('main')]}>Основное</SwiftText>
            <SwiftText modifiers={[tag('history')]}>История</SwiftText>
          </Picker>
        </Host>

        <LayoutAnimationConfig skipEntering>
          <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.tab}>
            {tab === 'main' ? (
              <>
                {!archived && (
                  <Section title="ДЕПОЗИТ И ДОЛГ">
                    <View style={styles.opsGrid}>
                      {(['deposit_add', 'deposit_sub', 'debt_repay', 'debt_lend'] as const).map((op) => {
                        const look = BALANCE_OPS[op];
                        const disabled = (op === 'deposit_sub' && balance <= 0.004) || (op === 'debt_repay' && balance >= -0.004);
                        return <OpTile key={op} title={look.title} icon={look.symbol} color={look.color} disabled={disabled} onPress={() => openBalance(op)} />;
                      })}
                    </View>
                  </Section>
                )}

                {!archived && (
                  <Section title="БОНУСЫ">
                    <View style={styles.opsGrid}>
                      <OpTile title="Начислить" icon="star.circle.fill" color="#F59E0B" onPress={() => openBonus('plus')} />
                      <OpTile title="Списать" icon="minus.circle.fill" color="#64748B" disabled={bonus <= 0} onPress={() => openBonus('minus')} />
                    </View>
                  </Section>
                )}

                {visits.data && visits.data.tier === 'newbie' && (
                  <Section title="НОВИЧОК → РЕЗИДЕНТ">
                    <GlassCard style={styles.card}>
                      <View style={styles.visitTop}>
                        <RollingText text={`${visits.data.visits} из ${visits.data.threshold}`} style={[type.title2, type.amount, styles.label]} />
                        <View style={styles.flex} />
                        <StepButton icon="minus" disabled={visitBusy || visits.data.visits <= 0} onPress={() => void changeVisits(-1)} />
                        <StepButton icon="plus" disabled={visitBusy} onPress={() => void changeVisits(1)} />
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${Math.min(100, (visits.data.visits / Math.max(1, visits.data.threshold)) * 100)}%` }]} />
                      </View>
                      <Text style={[type.footnote, styles.secondary]}>
                        {visits.data.remaining > 0
                          ? `Ещё ${visits.data.remaining} ${plural(visits.data.remaining, ['посещение', 'посещения', 'посещений'])} до статуса «Резидент»`
                          : 'Порог достигнут — статус повысится при следующем посещении'}
                      </Text>
                    </GlassCard>
                  </Section>
                )}

                <Section title="КОНТАКТЫ">
                  <GlassCard style={styles.card}>
                    <InfoRow icon="phone" label="Телефон" value={data.phone || 'Не указан'} muted={!data.phone} />
                    <InfoRow icon="paperplane" label="Telegram" value={data.tgUsername ? `@${data.tgUsername.replace(/^@/, '')}` : data.tgId ? `id ${data.tgId}` : 'Не привязан'} muted={!data.tgId && !data.tgUsername} />
                    <InfoRow icon="gift" label="День рождения" value={birthdayText(data.birthday) ?? 'Не указан'} muted={!data.birthday} />
                    {tags.length > 0 && <InfoRow icon="tag" label="Теги" value={tags.join(', ')} />}
                    {gomafiaId && (
                      <Pressable onPress={() => void Linking.openURL(`https://gomafia.pro/stats/${gomafiaId}`)} accessibilityRole="link">
                        <InfoRow icon="link" label="GoMafia" value={`Профиль #${gomafiaId}`} link />
                      </Pressable>
                    )}
                  </GlassCard>
                  <Text style={[type.footnote, styles.footnote]}>{`В клубе с ${new Date(data.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`}</Text>
                </Section>
              </>
            ) : (
              <HistoryList transactions={history.data} loading={history.isLoading} error={history.isError ? errorText(history.error) : null} onOpenCheck={(checkId) => router.push({ pathname: '/pos/[checkId]', params: { checkId } })} />
            )}
          </Animated.View>
        </LayoutAnimationConfig>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const birthdayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function birthdayText(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return birthdayFormat.format(new Date(`${value}T12:00:00Z`));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, sheetStyles.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

function StatTile({ label, value, color, icon, onPress }: { label: string; value: string; color: string; icon: SFSymbol; onPress?: () => void }) {
  return (
    <Pressable style={styles.flex} onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <GlassView isInteractive={!!onPress} tintColor={`${color}33`} style={styles.tile}>
        <View style={styles.tileTop}>
          <SymbolView name={icon} size={15} tintColor={color} />
          <Text style={[type.footnote, styles.tileLabel, { color }]}>{label}</Text>
        </View>
        <RollingText text={value} style={[type.title2, type.amount, styles.label]} />
      </GlassView>
    </Pressable>
  );
}

function ContactButton({ icon, label, color, disabled, onPress }: { icon: SFSymbol; label: string; color: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={styles.flex}
      disabled={disabled}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}>
      <GlassView isInteractive={!disabled} style={[styles.contact, disabled && styles.disabled]}>
        <View style={[styles.contactIcon, { backgroundColor: disabled ? colors.fill : color }]}>
          <SymbolView name={icon} size={15} tintColor={disabled ? colors.tertiaryLabel : 'white'} />
        </View>
        <Text style={[type.caption1, styles.contactText]}>{label}</Text>
      </GlassView>
    </Pressable>
  );
}

function OpTile({ title, icon, color, disabled, onPress }: { title: string; icon: SFSymbol; color: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.opCell} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}>
      <GlassView isInteractive={!disabled} style={[styles.op, disabled && styles.disabled]}>
        <SymbolView name={icon} size={20} tintColor={disabled ? colors.tertiaryLabel : color} />
        <Text style={[type.subhead, styles.opText]} numberOfLines={2}>
          {title}
        </Text>
      </GlassView>
    </Pressable>
  );
}

function StepButton({ icon, disabled, onPress }: { icon: 'plus' | 'minus'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={icon === 'plus' ? 'Добавить посещение' : 'Снять посещение'}>
      <GlassView isInteractive={!disabled} style={[styles.step, disabled && styles.disabled]}>
        <SymbolView name={icon} size={16} weight="semibold" tintColor={colors.accent} />
      </GlassView>
    </Pressable>
  );
}

function InfoRow({ icon, label, value, muted, link }: { icon: SFSymbol; label: string; value: string; muted?: boolean; link?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <SymbolView name={icon} size={15} weight="semibold" tintColor={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.caption1, styles.secondary]}>{label}</Text>
        <Text style={[type.body, muted ? styles.tertiary : link ? styles.link : styles.label]}>{value}</Text>
      </View>
      {link && <SymbolView name="arrow.up.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />}
    </View>
  );
}

function HistoryList({
  transactions,
  loading,
  error,
  onOpenCheck,
}: {
  transactions: ClientTransaction[] | undefined;
  loading: boolean;
  error: string | null;
  onOpenCheck: (checkId: string) => void;
}) {
  if (loading) return <ActivityIndicator style={styles.historyState} />;
  if (error) return <Text style={[type.subhead, styles.secondary, styles.centered, styles.historyState]}>{error}</Text>;
  if (!transactions?.length) {
    return (
      <View style={[styles.historyState, styles.historyEmpty]}>
        <SymbolView name="clock.arrow.circlepath" size={28} tintColor={colors.tertiaryLabel} />
        <Text style={[type.subhead, styles.secondary]}>Движений пока не было</Text>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <GlassCard>
        {transactions.map((tx, index) => {
          const look = transactionLook(tx);
          const amount = toNumber(tx.amount);
          const color = look.sign > 0 ? colors.green : look.sign < 0 ? colors.red : colors.secondaryLabel;
          const amountText =
            tx.type === 'visit_adjust'
              ? `${amount > 0 ? '+' : ''}${amount} ${plural(Math.abs(amount), ['посещение', 'посещения', 'посещений'])}`
              : formatMoney(look.sign < 0 ? -amount : amount, { sign: look.sign > 0, kopecks: 'auto' });
          return (
            <View key={tx.id}>
              {index > 0 && <View style={[sheetStyles.separator, styles.historySeparator]} />}
              <Pressable
                disabled={!tx.checkId}
                onPress={() => tx.checkId && onOpenCheck(tx.checkId)}
                style={({ pressed }) => [styles.historyRow, pressed && sheetStyles.pressedRow]}
                accessibilityRole={tx.checkId ? 'button' : undefined}>
                <SymbolView name={look.symbol} size={22} tintColor={look.sign > 0 ? colors.green : look.sign < 0 ? colors.red : colors.secondaryLabel} />
                <View style={styles.flex}>
                  <Text style={[type.body, styles.label]} numberOfLines={2}>
                    {look.title}
                  </Text>
                  <Text style={[type.footnote, styles.secondary]}>{whenText(tx.createdAt)}</Text>
                </View>
                <Text style={[type.body, type.amount, styles.historyAmount, { color }]}>{amountText}</Text>
              </Pressable>
            </View>
          );
        })}
      </GlassCard>
      <Text style={[type.footnote, styles.footnote]}>Показаны последние 50 движений</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.lg },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  link: { color: colors.accent },
  centered: { textAlign: 'center' },
  disabled: { opacity: 0.5 },
  hero: { alignItems: 'center', gap: 4, paddingTop: space.sm },
  photoBusy: { position: 'absolute', left: 0, right: 0, top: 38 },
  heroBadges: { flexDirection: 'row', gap: space.sm, marginTop: 4 },
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { padding: space.lg, gap: 6, borderRadius: 22, borderCurve: 'continuous' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileLabel: { fontWeight: '600' },
  contactRow: { flexDirection: 'row', gap: space.sm },
  contact: { alignItems: 'center', gap: 6, paddingVertical: space.md, borderRadius: 18, borderCurve: 'continuous' },
  contactIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  contactText: { color: colors.label, fontWeight: '600' },
  segment: { alignSelf: 'stretch' },
  tab: { gap: space.lg },
  section: { gap: space.sm },
  opsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  opCell: { width: '48.8%', flexGrow: 1 },
  op: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 56, borderRadius: 18, borderCurve: 'continuous' },
  opText: { flex: 1, color: colors.label, fontWeight: '600' },
  card: { padding: space.lg, gap: space.md },
  visitTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  infoIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  footnote: { color: colors.tertiaryLabel, paddingHorizontal: space.xs },
  historyState: { paddingVertical: space.xxl },
  historyEmpty: { alignItems: 'center', gap: space.sm },
  historySeparator: { marginLeft: 52 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  historyAmount: { fontWeight: '600' },
});
