import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { dayNumber, eventKind, eventTitle, monthShort, STATUS_LOOK, timeRange, type EventRow } from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';

/**
 * Карточка мероприятия — интерактивное стекло. Props Pressable пробрасываются дальше:
 * так работают `<Link asChild>` и зум-переход в экран мероприятия.
 */
export function EventCard({
  event,
  base,
  place,
  starting,
  onStart,
  ...pressable
}: {
  event: EventRow;
  base: number;
  /** Зона клуба или адрес выезда. */
  place: string | null;
  starting?: boolean;
  onStart?: () => void;
} & PressableProps) {
  const status = STATUS_LOOK[event.status];
  const kind = eventKind(event);
  const dimmed = event.status === 'cancelled';
  const fee = toNumber(event.participationFee);
  const amount = event.format === 'minicap' ? (fee > 0 ? `взнос ${formatMoney(fee)}` : null) : base > 0 ? formatMoney(base) : null;

  return (
    <Pressable {...pressable} accessibilityRole="button" accessibilityLabel={`${eventTitle(event)}, ${status.label}`}>
      <GlassView isInteractive style={[styles.card, dimmed && styles.dimmed]}>
        <View style={styles.top}>
          <View style={[styles.date, { backgroundColor: `${status.color}29` }]}>
            <Text style={[styles.day, type.amount, { color: status.color }]}>{dayNumber(event.date)}</Text>
            <Text style={[type.caption2, styles.month, { color: status.color }]}>{monthShort(event.date)}</Text>
          </View>

          <View style={styles.titles}>
            <View style={styles.kind}>
              <SymbolView name={kind.symbol} size={12} weight="semibold" tintColor={kind.color} />
              <Text style={[type.caption1, styles.kindText, { color: kind.color }]}>{kind.label}</Text>
            </View>
            <Text style={[type.headline, styles.label]} numberOfLines={1}>
              {eventTitle(event)}
            </Text>
            <Text style={[type.subhead, styles.secondary]} numberOfLines={1}>
              {`${timeRange(event)}${event.billingMode === 'hourly' && event.plannedHours ? ` · ${event.plannedHours} ч` : ''}${amount ? ` · ${amount}` : ''}`}
            </Text>
          </View>

          <View style={[styles.status, { backgroundColor: `${status.color}24` }]}>
            <SymbolView name={status.symbol} size={11} weight="semibold" tintColor={status.color} />
            <Text style={[type.caption1, styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {place && <Detail icon={event.type === 'exit' ? 'mappin.and.ellipse' : 'square.split.bottomrightquarter'} text={place} />}
        {(event.customerName || event.customerPhone) && (
          <Detail icon="person" text={[event.customerName, event.customerPhone].filter(Boolean).join(' · ')} />
        )}
        {event.comment && <Detail icon="text.bubble" text={event.comment} />}

        {event.status === 'planned' && onStart && (
          <Pressable onPress={onStart} disabled={starting} style={({ pressed }) => [styles.start, pressed && styles.pressed]} accessibilityRole="button">
            {starting ? <ActivityIndicator color="white" /> : <SymbolView name="play.fill" size={13} tintColor="white" />}
            <Text style={[type.subhead, styles.startText]}>{starting ? 'Начинаем…' : 'Начать'}</Text>
          </Pressable>
        )}
      </GlassView>
    </Pressable>
  );
}

function Detail({ icon, text }: { icon: SFSymbol; text: string }) {
  return (
    <View style={styles.detail}>
      <SymbolView name={icon} size={13} tintColor={colors.tertiaryLabel} />
      <Text style={[type.footnote, styles.secondary, styles.flex]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: radius.card, borderCurve: 'continuous', padding: space.lg, gap: space.sm },
  dimmed: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  date: { width: 52, height: 56, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 22, lineHeight: 26 },
  month: { fontWeight: '600', textTransform: 'uppercase' },
  titles: { flex: 1, gap: 1 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindText: { fontWeight: '600' },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  statusText: { fontWeight: '600' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 2 },
  start: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  startText: { color: 'white', fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
