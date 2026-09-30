import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppRefreshControl } from '@/components/refresh-control';
import { GlassView } from '@/components/glass';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { MinicapLineup } from '@/components/minicap-lineup';
import { GlassCard, PrimaryButton } from '@/components/new-check-parts';
import { api } from '@/lib/api';
import {
  BILLING_LABEL,
  dayLabel,
  eventBase,
  eventErrorMessage,
  eventKind,
  eventTitle,
  normalizePhone,
  purgeEvent,
  startEvent,
  STATUS_LOOK,
  timeRange,
  updateEvent,
  useEvent,
  useEventParticipants,
  useEventRates,
  useStaffList,
  type EventStatus,
} from '@/lib/events-api';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { routeInYandex } from '@/lib/phone-book';
import { usePageGutter } from '@/lib/layout';
import { useSpaces } from '@/lib/pos-api';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import { ToolbarMenu, ToolbarMenuAction } from '@/components/toolbar';

const errorText = (error: unknown) => eventErrorMessage(error instanceof Error ? error.message : String(error));

/**
 * Мероприятие: крупно название, статус и время; стеклянные карточки — детали, заказчик
 * со связью в один тап, маршрут для выезда. Действия — начать (откроет чек в кассе),
 * перейти к чеку, отменить. Открывается зумом из карточки списка.
 */
export default function EventScreen() {
  const gutter = usePageGutter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const event = useEvent(eventId);
  const rates = useEventRates();
  const spaces = useSpaces();
  const staff = useStaffList();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const [busy, setBusy] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const data = event.data;
  const isMinicap = data?.format === 'minicap';
  const lineup = useEventParticipants(isMinicap ? eventId : undefined, data?.status === 'active');

  const run = async (key: string, action: () => Promise<unknown>, failTitle: string) => {
    haptic.medium();
    setBusy(key);
    try {
      await action();
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert(failTitle, errorText(error));
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <AmbientBackdrop style={styles.screen}>
        <View style={styles.state}>
          {event.isError ? <Text style={[type.body, styles.secondary]}>{errorText(event.error)}</Text> : <ActivityIndicator />}
        </View>
      </AmbientBackdrop>
    );
  }

  const kind = eventKind(data);
  const status = STATUS_LOOK[data.status];
  const base = eventBase(data, rates.data);
  const spaceName = data.spaceId ? (spaces.data ?? []).find((s) => s.id === data.spaceId)?.name : null;
  const responsible = data.responsibleStaffId ? (staff.data ?? []).find((s) => s.id === data.responsibleStaffId)?.nickname : null;
  const phone = data.customerPhone ? normalizePhone(data.customerPhone) : null;
  const address = data.type === 'exit' ? data.location : null;
  const canCancel = data.status !== 'cancelled' && data.status !== 'completed';

  const players = (lineup.data ?? []).filter((p) => p.role === 'player');
  const fee = toNumber(data.participationFee);
  const costs = [
    { label: 'Призовой фонд', icon: 'gift' as const, amount: toNumber(data.prizeFund) },
    { label: 'Обед', icon: 'fork.knife' as const, amount: toNumber(data.lunchCost) },
    { label: 'Иные расходы', icon: 'ellipsis.circle' as const, amount: toNumber(data.otherCost) },
  ].filter((c) => c.amount > 0);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([event.refetch(), isMinicap ? lineup.refetch() : Promise.resolve()]);
    setPulling(false);
  };

  const setStatus = (next: EventStatus) => void run(`status-${next}`, () => updateEvent(data.id, { status: next }), 'Статус не изменён');

  const cancel = () =>
    Alert.alert(
      isMinicap ? 'Отменить миникап?' : 'Отменить мероприятие?',
      isMinicap ? 'Открытые счета участников в кассе тоже отменятся.' : data.checkId ? 'Открытый чек мероприятия тоже будет отменён.' : undefined,
      [
      { text: 'Назад', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: () => setStatus('cancelled') },
      ],
    );

  const purge = () =>
    Alert.alert('Удалить навсегда?', 'Мероприятие исчезнет из списка и аналитики. Чеки останутся в истории.', [
      { text: 'Назад', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          void run(
            'purge',
            async () => {
              await purgeEvent(data.id);
              router.back();
            },
            'Мероприятие не удалено',
          ),
      },
    ]);

  const openTaxi = async () => {
    if (!address) return;
    haptic.light();
    const coords = await api.get<{ lat?: number; lon?: number }>(`/geo/geocode?text=${encodeURIComponent(address)}`).catch(() => ({}) as { lat?: number; lon?: number });
    const url =
      coords.lat !== undefined && coords.lon !== undefined
        ? `https://3.redirect.appmetrica.yandex.com/route?end-lat=${coords.lat}&end-lon=${coords.lon}&ref=titanhub&appmetrica_tracking_id=1178268795219780156`
        : `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}&rtt=taxi`;
    void Linking.openURL(url);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>{eventTitle(data)}</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarMenu icon="ellipsis" accessibilityLabel="Действия с мероприятием">
          {canCancel && (
            <ToolbarMenuAction
              icon="pencil"
              onPress={() => router.push({ pathname: isMinicap ? '/events/minicap' : '/events/edit', params: { eventId: data.id } })}>
              Редактировать
            </ToolbarMenuAction>
          )}
          {data.status === 'planned' && (
            <ToolbarMenuAction icon="questionmark.circle" onPress={() => setStatus('needs_clarification')}>
              Требует уточнения
            </ToolbarMenuAction>
          )}
          {(data.status === 'needs_clarification' || data.status === 'cancelled') && (
            <ToolbarMenuAction icon="clock" onPress={() => setStatus('planned')}>
              Вернуть в запланированные
            </ToolbarMenuAction>
          )}
          {canCancel && (
            <ToolbarMenuAction icon="xmark.circle" destructive onPress={cancel}>
              {isMinicap ? 'Отменить миникап' : 'Отменить мероприятие'}
            </ToolbarMenuAction>
          )}
          {isOwner && data.status === 'cancelled' && (
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
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <View style={styles.hero}>
          <View style={[styles.kind, { backgroundColor: `${kind.color}24` }]}>
            <SymbolView name={kind.symbol} size={13} weight="semibold" tintColor={kind.color} />
            <Text style={[type.footnote, styles.kindText, { color: kind.color }]}>{kind.label}</Text>
          </View>
          <Text style={[type.title1, styles.label, styles.centered]}>{eventTitle(data)}</Text>
          <Text style={[type.title3, styles.label]}>{dayLabel(data.date)}</Text>
          <Text style={[type.headline, styles.secondary]}>{timeRange(data)}</Text>
          <View style={[styles.status, { backgroundColor: `${status.color}24` }]}>
            <SymbolView name={status.symbol} size={13} weight="semibold" tintColor={status.color} />
            <Text style={[type.subhead, styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {data.status === 'planned' && isMinicap && (
          <View style={styles.startBlock}>
            <PrimaryButton
              title={busy === 'start' ? 'Открываем счета…' : 'Начать миникап'}
              icon="play.fill"
              busy={busy === 'start'}
              disabled={players.length === 0}
              onPress={() => void run('start', () => startEvent(data.id), 'Миникап не начался')}
            />
            <Text style={[type.footnote, styles.secondary, styles.centered]}>
              {players.length === 0
                ? lineup.isLoading
                  ? 'Загружаем состав…'
                  : 'Сначала добавьте игроков в состав'
                : `Откроет ${players.length} ${plural(players.length, ['счёт', 'счёта', 'счетов'])} в кассе — нужна открытая смена`}
            </Text>
          </View>
        )}
        {data.status === 'active' && isMinicap && (
          <GlassCard tint="rgba(52,199,89,0.16)" style={styles.liveCard}>
            <View style={styles.liveTop}>
              <SymbolView name="play.circle.fill" size={22} tintColor={colors.green} />
              <Text style={[type.subhead, styles.label, styles.flex]}>Миникап идёт — счета участников открыты в кассе. Взнос уже в каждом счёте.</Text>
            </View>
            <Pressable
              onPress={() => {
                haptic.light();
                router.navigate('/pos');
              }}
              style={({ pressed }) => [styles.liveButton, pressed && styles.pressed]}
              accessibilityRole="button">
              <SymbolView name="rublesign.circle" size={15} weight="semibold" tintColor={colors.green} />
              <Text style={[type.subhead, styles.liveButtonText]}>Перейти в кассу</Text>
            </Pressable>
          </GlassCard>
        )}

        {data.status === 'planned' && !isMinicap && (
          <PrimaryButton
            title={busy === 'start' ? 'Начинаем…' : 'Начать мероприятие'}
            icon="play.fill"
            busy={busy === 'start'}
            onPress={() => void run('start', () => startEvent(data.id), 'Мероприятие не началось')}
          />
        )}
        {data.status === 'active' && data.checkId && (
          <PrimaryButton
            title="Открыть чек мероприятия"
            icon="rublesign.circle"
            onPress={() => {
              haptic.light();
              router.push({ pathname: '/pos/[checkId]', params: { checkId: data.checkId! } });
            }}
          />
        )}

        {isMinicap ? (
          <>
            <GlassCard style={styles.card}>
              <InfoRow icon="clock" label="Начало" value={`${dayLabel(data.date)}, ${timeRange(data)}`} />
              <InfoRow icon="mappin.and.ellipse" label="Локация" value="TITAN" />
              <InfoRow
                icon="rublesign.circle"
                label="Взнос"
                value={fee > 0 ? `${formatMoney(fee)}${players.length > 0 ? ` · сбор ${formatMoney(fee * players.length)}` : ''}` : 'Без взноса'}
              />
              {costs.map((c) => (
                <InfoRow key={c.label} icon={c.icon} label={c.label} value={formatMoney(c.amount)} />
              ))}
              {data.comment && <InfoRow icon="text.bubble" label="Комментарий" value={data.comment} multiline />}
            </GlassCard>
            <MinicapLineup event={data} lineup={lineup} />
          </>
        ) : (
          <GlassCard style={styles.card}>
            <InfoRow icon="clock" label="Время" value={`${dayLabel(data.date)}, ${timeRange(data)}`} />
            {spaceName && <InfoRow icon="square.split.bottomrightquarter" label="Зона" value={spaceName} />}
            {address && <InfoRow icon="mappin.and.ellipse" label="Адрес" value={address} />}
            {responsible && <InfoRow icon="person.badge.shield.checkmark" label="Ответственный" value={responsible} />}
            <InfoRow
              icon="rublesign.circle"
              label={BILLING_LABEL[data.billingMode] ?? 'Сумма'}
              value={
                data.billingMode === 'rental'
                  ? 'аренда зоны, по факту'
                  : `${data.billingMode === 'hourly' && data.plannedHours ? `${data.plannedHours} ч · ` : ''}${formatMoney(base)}`
              }
            />
            {(data.attendeesCount > 0 || data.maxGuests) && (
              <InfoRow icon="person.2" label="Гостей" value={data.maxGuests ? `${data.attendeesCount} из ${data.maxGuests}` : String(data.attendeesCount)} />
            )}
            {data.comment && <InfoRow icon="text.bubble" label="Комментарий" value={data.comment} multiline />}
          </GlassCard>
        )}

        {(data.customerName || data.customerPhone) && (
          <GlassCard style={styles.card}>
            <InfoRow icon="person.crop.circle" label="Заказчик" value={[data.customerName, data.customerPhone].filter(Boolean).join(' · ')} />
            {phone && (
              <View style={styles.actionsRow}>
                <ActionButton icon="phone.fill" label="Позвонить" color="#10B981" onPress={() => void Linking.openURL(`tel:+${phone}`)} />
                <ActionButton icon="message.fill" label="WhatsApp" color="#22C55E" onPress={() => void Linking.openURL(`https://wa.me/${phone}`)} />
                <ActionButton icon="paperplane.fill" label="Telegram" color="#0EA5E9" onPress={() => void Linking.openURL(`tg://resolve?phone=${phone}`)} />
              </View>
            )}
          </GlassCard>
        )}

        {address && (
          <GlassCard style={styles.card}>
            <InfoRow icon="map" label="Маршрут" value={address} />
            <View style={styles.actionsRow}>
              <ActionButton
                icon="location.fill"
                label="Маршрут"
                color="#F59E0B"
                onPress={() => {
                  haptic.light();
                  // Маршрут строится от текущей точки: координаты берём сами, если есть доступ.
                  void routeInYandex(address);
                }}
              />
              <ActionButton icon="car.fill" label="Такси" color="#EAB308" onPress={() => void openTaxi()} />
            </View>
          </GlassCard>
        )}

        {data.status === 'needs_clarification' && (
          <PrimaryButton
            title="Всё уточнено"
            icon="checkmark"
            busy={busy === 'status-planned'}
            onPress={() => setStatus('planned')}
          />
        )}

        {canCancel && (
          <Pressable onPress={cancel} disabled={!!busy} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={[type.body, styles.destructive]}>{busy === 'status-cancelled' ? 'Отменяем…' : isMinicap ? 'Отменить миникап' : 'Отменить мероприятие'}</Text>
          </Pressable>
        )}
        {isOwner && data.status === 'cancelled' && (
          <Pressable onPress={purge} disabled={!!busy} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={[type.body, styles.destructive]}>{busy === 'purge' ? 'Удаляем…' : 'Удалить навсегда'}</Text>
          </Pressable>
        )}
      </ScrollView>
    </AmbientBackdrop>
  );
}

function InfoRow({ icon, label, value, multiline }: { icon: SFSymbol; label: string; value: string; multiline?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <SymbolView name={icon} size={15} weight="semibold" tintColor={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.caption1, styles.secondary]}>{label}</Text>
        <Text style={[type.body, styles.label]} numberOfLines={multiline ? undefined : 2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ActionButton({ icon, label, color, onPress }: { icon: SFSymbol; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={styles.flex} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <GlassView isInteractive style={styles.action}>
        <View style={[styles.actionIcon, { backgroundColor: color }]}>
          <SymbolView name={icon} size={15} tintColor="white" />
        </View>
        <Text style={[type.caption1, styles.actionText]}>{label}</Text>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  hero: { alignItems: 'center', gap: 4, paddingTop: space.sm, paddingBottom: space.sm },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 4 },
  kindText: { fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: space.sm },
  statusText: { fontWeight: '600' },
  card: { padding: space.lg, gap: space.md },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  infoIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  actionsRow: { flexDirection: 'row', gap: space.sm },
  action: { alignItems: 'center', gap: 6, paddingVertical: space.md, borderRadius: 18, borderCurve: 'continuous' },
  actionIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.label, fontWeight: '600' },
  textButton: { alignSelf: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
  startBlock: { gap: space.sm },
  liveCard: { padding: space.lg, gap: space.md },
  liveTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  liveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(52,199,89,0.18)',
  },
  liveButtonText: { color: colors.green, fontWeight: '600' },
  destructive: { color: colors.red, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
