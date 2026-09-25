import { Button, Host, Menu, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { buttonBorderShape, buttonStyle, controlSize, labelStyle, menuStyle, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { syncEventsToCalendar } from '@/lib/calendar-sync';
import { calendarSyncDue, markCalendarSynced, useDevicePrefs } from '@/lib/device-prefs';
import { EventCard } from '@/components/event-card';
import { GlassCard } from '@/components/new-check-parts';
import { Unavailable } from '@/components/unavailable';
import {
  dayLabel,
  eventBase,
  eventErrorMessage,
  formatMskDateTime,
  isUpcoming,
  monthLabel,
  parsePgTimestamp,
  resolveBooking,
  startEvent,
  todayMsk,
  useBookingRequests,
  useEventRates,
  useEvents,
  type BookingRequest,
  type EventRow,
} from '@/lib/events-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useSpaces } from '@/lib/pos-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

type Tab = 'upcoming' | 'past';

const rowLayout = LinearTransition.springify().damping(22).stiffness(200);

/**
 * События: предстоящие (сверху заявки на бронь с сайта) и прошедшие — текущий месяц
 * списком, прошлые месяцы свёрнуты в папки, как в веб-кассе. Карточки — стекло; тап
 * открывает мероприятие зумом.
 */
export default function EventsScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const events = useEvents();
  const calendarSync = useDevicePrefs((state) => state.calendarSync);

  // Календарь телефона подтягивается сам: список мероприятий обновляется после любой
  // правки, так что здесь же приводим календарь в соответствие (не чаще раза в 5 минут).
  const rows = events.data;
  useEffect(() => {
    if (!calendarSync || !rows || !calendarSyncDue()) return;
    markCalendarSynced();
    void syncEventsToCalendar(rows).catch(() => {});
  }, [calendarSync, rows]);
  const bookings = useBookingRequests();
  const rates = useEventRates();
  const spaces = useSpaces();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [pulling, setPulling] = useState(false);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [bookingBusy, setBookingBusy] = useState<string | null>(null);

  const all = useMemo(() => events.data ?? [], [events.data]);
  const requests = bookings.data ?? [];
  const spaceName = useMemo(() => new Map((spaces.data ?? []).map((s) => [s.id, s.name])), [spaces.data]);

  const upcoming = useMemo(
    () => all.filter(isUpcoming).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
    [all],
  );
  const past = useMemo(
    () => all.filter((e) => !isUpcoming(e)).sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    [all],
  );

  const upcomingDays = useMemo(() => groupBy(upcoming, (e) => e.date), [upcoming]);
  const currentMonth = todayMsk().slice(0, 7);
  const pastThisMonth = past.filter((e) => e.date.slice(0, 7) >= currentMonth);
  const pastMonths = useMemo(() => groupBy(past.filter((e) => e.date.slice(0, 7) < currentMonth), (e) => e.date.slice(0, 7)), [past, currentMonth]);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([events.refetch(), bookings.refetch()]);
    setPulling(false);
  };

  const onStart = async (event: EventRow) => {
    haptic.medium();
    setStartingId(event.id);
    try {
      await startEvent(event.id);
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert('Мероприятие не началось', eventErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setStartingId(null);
    }
  };

  const onBooking = async (booking: BookingRequest, status: 'confirmed' | 'cancelled') => {
    haptic.medium();
    setBookingBusy(booking.id);
    try {
      const eventId = await resolveBooking(booking.id, status);
      haptic.success();
      // Как в вебе: подтверждённая заявка сразу открывает мероприятие для уточнения деталей.
      if (status === 'confirmed' && eventId) router.push({ pathname: '/events/edit', params: { eventId } });
    } catch (error) {
      haptic.error();
      Alert.alert(status === 'confirmed' ? 'Заявка не подтверждена' : 'Заявка не отклонена', error instanceof Error ? error.message : String(error));
    } finally {
      setBookingBusy(null);
    }
  };

  const renderEvent = (event: EventRow) => (
    <Animated.View key={event.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
      <Link href={{ pathname: '/events/[eventId]', params: { eventId: event.id } }} asChild>
        <Link.Trigger withAppleZoom>
          <EventCard
            event={event}
            base={eventBase(event, rates.data)}
            place={event.type === 'exit' ? event.location : event.spaceId ? (spaceName.get(event.spaceId) ?? null) : null}
            starting={startingId === event.id}
            onStart={event.format === 'minicap' ? undefined : () => void onStart(event)}
          />
        </Link.Trigger>
      </Link>
    </Animated.View>
  );

  const toggleMonth = (key: string) => {
    haptic.selection();
    setOpenMonths((open) => (open.includes(key) ? open.filter((k) => k !== key) : [...open, key]));
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, gutter, { paddingTop: insets.top }]}
        refreshControl={<RefreshControl tintColor={colors.accent} progressViewOffset={insets.top} refreshing={pulling} onRefresh={refresh} />}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={[type.largeTitle, styles.label]}>События</Text>
            <Text style={[type.subhead, styles.secondary]}>
              {events.isLoading
                ? 'Загружаем…'
                : `${upcoming.length} ${plural(upcoming.length, ['предстоящее', 'предстоящих', 'предстоящих'])}${requests.length ? ` · ${requests.length} ${plural(requests.length, ['заявка', 'заявки', 'заявок'])}` : ''}`}
            </Text>
          </View>
          <Host matchContents style={styles.add}>
            <Menu
              label="Создать"
              systemImage="plus"
              modifiers={[menuStyle('button'), labelStyle('iconOnly'), buttonStyle('glassProminent'), buttonBorderShape('circle'), controlSize('large'), tint(accent)]}>
              <Button label="Мероприятие" systemImage="calendar.badge.plus" onPress={() => router.push('/events/edit')} />
              <Button label="Миникап" systemImage="trophy" onPress={() => router.push('/events/minicap')} />
            </Menu>
          </Host>
        </View>

        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('upcoming')]}>{`Предстоящие · ${upcoming.length}`}</SwiftText>
            <SwiftText modifiers={[tag('past')]}>{`Прошедшие · ${past.length}`}</SwiftText>
          </Picker>
        </Host>

        {events.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : events.isError && all.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable title="Нет связи" systemImage="wifi.exclamationmark" description={events.error.message} />
          </View>
        ) : (
          <LayoutAnimationConfig skipEntering>
            {tab === 'upcoming' ? (
              <View style={styles.list}>
                {requests.length > 0 && (
                  <View style={styles.group}>
                    <SectionTitle icon="envelope.badge" color={colors.orange} title={`Заявки на бронь · ${requests.length}`} />
                    {requests.map((booking) => (
                      <Animated.View key={booking.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                        <BookingCard
                          booking={booking}
                          busy={bookingBusy === booking.id}
                          onConfirm={() => void onBooking(booking, 'confirmed')}
                          onReject={() =>
                            Alert.alert('Отклонить заявку?', `${booking.name} · ${booking.phone}`, [
                              { text: 'Назад', style: 'cancel' },
                              { text: 'Отклонить', style: 'destructive', onPress: () => void onBooking(booking, 'cancelled') },
                            ])
                          }
                        />
                      </Animated.View>
                    ))}
                  </View>
                )}

                {upcoming.length === 0 && requests.length === 0 ? (
                  <View style={styles.empty}>
                    <Unavailable title="Мероприятий нет" systemImage="calendar" description="Мероприятие или миникап — кнопка «+» вверху." />
                  </View>
                ) : (
                  upcomingDays.map(([date, dayEvents]) => (
                    <View key={date} style={styles.group}>
                      <SectionTitle icon="calendar" color={date === todayMsk() ? colors.accent : colors.secondaryLabel} title={dayLabel(date)} />
                      {dayEvents.map(renderEvent)}
                    </View>
                  ))
                )}
              </View>
            ) : (
              <View style={styles.list}>
                {past.length === 0 && (
                  <View style={styles.empty}>
                    <Unavailable title="Пока пусто" systemImage="clock.arrow.circlepath" description="Здесь появятся завершённые и отменённые мероприятия." />
                  </View>
                )}
                {pastThisMonth.length > 0 && (
                  <View style={styles.group}>
                    <SectionTitle icon="calendar" color={colors.secondaryLabel} title={monthLabel(currentMonth)} />
                    {pastThisMonth.map(renderEvent)}
                  </View>
                )}
                {pastMonths.map(([month, monthEvents]) => {
                  const open = openMonths.includes(month);
                  return (
                    <View key={month} style={styles.group}>
                      <Pressable onPress={() => toggleMonth(month)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                        <GlassCard interactive style={styles.folder}>
                          <SymbolView name={open ? 'folder.fill' : 'folder'} size={20} tintColor={colors.accent} />
                          <Text style={[type.headline, styles.label, styles.flex]}>{monthLabel(month)}</Text>
                          <Text style={[type.subhead, styles.secondary]}>{monthEvents.length}</Text>
                          <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
                        </GlassCard>
                      </Pressable>
                      {open && monthEvents.map(renderEvent)}
                    </View>
                  );
                })}
              </View>
            )}
          </LayoutAnimationConfig>
        )}
      </ScrollView>
    </AmbientBackdrop>
  );
}

function SectionTitle({ icon, color, title }: { icon: 'calendar' | 'envelope.badge'; color: typeof colors.accent; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <SymbolView name={icon} size={14} weight="semibold" tintColor={color} />
      <Text style={[type.headline, styles.label]}>{title}</Text>
    </View>
  );
}

function BookingCard({ booking, busy, onConfirm, onReject }: { booking: BookingRequest; busy: boolean; onConfirm: () => void; onReject: () => void }) {
  const startsAt = parsePgTimestamp(booking.starts_at);
  const hours = booking.tariff_hours ?? (booking.duration_hours ? Number(booking.duration_hours) : null);
  const where = booking.location === 'exit' ? (booking.address ?? 'Выезд') : (booking.zone_name ?? 'Клуб');
  return (
    <GlassCard tint="rgba(255,149,0,0.16)" style={styles.booking}>
      <View style={styles.bookingTop}>
        <SymbolView name={booking.location === 'exit' ? 'car' : 'building.2'} size={16} weight="semibold" tintColor={colors.orange} />
        <Text style={[type.headline, styles.label, styles.flex]} numberOfLines={1}>
          {booking.title || booking.name}
        </Text>
      </View>
      <Text style={[type.subhead, styles.secondary]}>
        {`${formatMskDateTime(startsAt)}${hours ? ` · ${hours} ч` : ''}${booking.guests ? ` · ${booking.guests} гостей` : ''}`}
      </Text>
      <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
        {`${where} · ${booking.name} · ${booking.phone}`}
      </Text>
      {booking.comment && (
        <Text style={[type.footnote, styles.tertiary]} numberOfLines={2}>
          {booking.comment}
        </Text>
      )}
      <View style={styles.bookingButtons}>
        <Pressable disabled={busy} onPress={onReject} style={({ pressed }) => [styles.bookingButton, styles.reject, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={[type.subhead, styles.rejectText]}>Отклонить</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={onConfirm} style={({ pressed }) => [styles.bookingButton, styles.confirm, pressed && styles.pressed]} accessibilityRole="button">
          {busy ? <ActivityIndicator color="white" /> : <SymbolView name="checkmark" size={13} weight="bold" tintColor="white" />}
          <Text style={[type.subhead, styles.confirmText]}>Подтвердить</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

function groupBy<T>(list: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingTop: space.xs },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  add: { marginBottom: 4 },
  segment: { alignSelf: 'stretch' },
  loading: { paddingTop: 80 },
  empty: { height: 360 },
  list: { gap: space.xl },
  group: { gap: space.sm },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  folder: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  booking: { padding: space.lg, gap: 4 },
  bookingTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bookingButtons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  bookingButton: { flex: 1, height: 40, borderRadius: 12, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reject: { backgroundColor: colors.fill },
  rejectText: { color: colors.red, fontWeight: '600' },
  confirm: { backgroundColor: colors.accent },
  confirmText: { color: 'white', fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
