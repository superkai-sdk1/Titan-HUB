// Главный экран кабинки: действующий счёт, меню и действия гостя. Рядом всегда
// панель «Свет и климат». До открытия счёта — то же место, но счёт «ждёт» администратора.
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { callStaff, requestBill } from '@/lib/actions';
import { api, errorText } from '@/lib/api';
import { toast } from '@/lib/flow';
import { amount, duration, money, plural } from '@/lib/format';
import { checkTotals, lineTotal, rentalMinutes } from '@/lib/money';
import { invalidate, useActiveEvent, useChat, useCheck } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { brandGradient, colors, GUTTER, payGradient, radius, space, type } from '@/lib/theme';
import type { Check, ClubEvent, PendingOrder } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { useRoom } from '@/lib/use-room';

import { TopBar } from './top-bar';
import { Badge, Icon, type IconName, Loader, Tap } from './ui';

export function HomeView({ checkId }: { checkId: string | null }) {
  const check = useCheck(checkId);
  const spaceId = useSession((s) => s.space?.id ?? null);
  const event = useActiveEvent(spaceId, !!checkId);
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = checkId ? check.data ?? null : null;

  const subtitle = !checkId ? 'Добро пожаловать!' : data?.guestName ? `Счёт · ${data.guestName}` : 'Приятного вечера!';

  if (checkId && !data) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar subtitle={subtitle} />
        <Loader label={check.isError ? errorText(check.error) : 'Загружаем счёт…'} />
      </View>
    );
  }

  const bill = data ? <BillCard check={data} /> : <WaitingCard fill={wide} />;
  const details = data ? (
    <>
      <PendingOrders orders={data.pendingOrders ?? []} />
      <Items check={data} />
    </>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <TopBar subtitle={subtitle} />
      {wide ? (
        <View style={styles.wide}>
          <ScrollView style={{ flex: 1.3 }} contentContainerStyle={[styles.column, !data && { flexGrow: 1 }]} showsVerticalScrollIndicator={false}>
            {event.data ? <EventBanner event={event.data} /> : null}
            {bill}
            {details}
          </ScrollView>
          <View style={styles.actionsColumn}>
            <Actions check={data} layout="column" />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.column, { paddingLeft: GUTTER }]} showsVerticalScrollIndicator={false}>
          {event.data ? <EventBanner event={event.data} /> : null}
          {bill}
          <Actions check={data} layout="grid" />
          {details}
        </ScrollView>
      )}
    </View>
  );
}

function PulseDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.set(withRepeat(withSequence(withTiming(0.25, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

/** Счёта ещё нет: администратор откроет его в кассе — экран обновится сам. */
function WaitingCard({ fill }: { fill: boolean }) {
  const { configured } = useRoom();
  return (
    <View style={[styles.bill, fill && styles.billFill]}>
      <Text style={type.overline}>Ваш счёт</Text>
      <View style={styles.waitRow}>
        <View style={styles.waitIcon}>
          <Icon name="receipt-text-outline" size={36} color={colors.violetLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>Счёт ещё не открыт</Text>
          <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>Администратор откроет его в кассе — он появится здесь сам.</Text>
        </View>
      </View>
      <View style={styles.waitHint}>
        <PulseDot />
        <Text style={styles.waitHintText}>{configured ? 'Свет и кондиционер уже можно включить' : 'А пока можно посмотреть меню'}</Text>
      </View>
    </View>
  );
}

function EventBanner({ event }: { event: ClubEvent }) {
  return (
    <View style={styles.event}>
      <View style={styles.eventIcon}>
        <Icon name="party-popper" size={24} color={colors.violetLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.overline, { color: colors.violetLight }]}>Сейчас идёт</Text>
        <Text style={type.headline} numberOfLines={1}>{event.title || 'Мероприятие'}</Text>
      </View>
      {event.startTime ? (
        <Text style={styles.eventTime}>{event.startTime.slice(0, 5)}{event.endTime ? `–${event.endTime.slice(0, 5)}` : ''}</Text>
      ) : null}
    </View>
  );
}

function BillCard({ check }: { check: Check }) {
  const now = useNow(30_000);
  const t = checkTotals(check, now.getTime());
  const itemsCount = check.items.reduce((s, r) => s + r.checkItem.quantity, 0);
  const minutes = rentalMinutes(check, now.getTime());

  return (
    <View style={styles.bill}>
      <Text style={type.overline}>Ваш счёт</Text>
      <View style={styles.totalRow}>
        <Text style={styles.total}>{amount(t.total)}</Text>
        <Text style={styles.totalRub}>₽</Text>
      </View>
      <View style={styles.breakdown}>
        <Row icon="silverware-fork-knife" label={itemsCount ? `${itemsCount} ${plural(itemsCount, 'позиция', 'позиции', 'позиций')}` : 'Пока без заказов'} value={money(t.items + t.discount)} />
        {check.spaceStartAt ? (
          <Row icon="timer-outline" label={`Аренда · ${duration(minutes)}${check.spaceEndAt ? '' : ' и идёт'}`} value={money(t.rental)} />
        ) : null}
        {t.event > 0 ? <Row icon="party-popper" label="Мероприятие" value={money(t.event)} /> : null}
        {t.discount > 0 ? <Row icon="sale" label="Скидка" value={`−${money(t.discount)}`} tone={colors.green} /> : null}
      </View>
    </View>
  );
}

function Row({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={20} color={tone ?? colors.textSecondary} />
      <Text style={[styles.rowLabel, tone ? { color: tone } : null]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function PendingOrders({ orders }: { orders: PendingOrder[] }) {
  const cancel = useMutation({
    mutationFn: (orderId: string) => api.post(`/pos/orders/${orderId}/cancel`, {}),
    onSuccess: () => {
      toast('Заказ отменён', 'info');
      void invalidate('check');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  if (!orders.length) return null;
  return (
    <View style={{ gap: space.md }}>
      {orders.map((order) => (
        <Animated.View key={order.id} entering={FadeInDown} layout={LinearTransition} style={styles.pending}>
          <View style={styles.pendingHead}>
            <Icon name="timer-sand" size={22} color={colors.amber} />
            <Text style={styles.pendingTitle}>Ждёт подтверждения</Text>
            <Tap onPress={() => cancel.mutate(order.id)} disabled={cancel.isPending} style={styles.pendingCancel} accessibilityRole="button">
              <Text style={styles.pendingCancelText}>Отменить</Text>
            </Tap>
          </View>
          {order.items.map((it, i) => (
            <View key={i} style={styles.pendingLine}>
              <Text style={styles.pendingName} numberOfLines={1}>{it.name} × {it.quantity}</Text>
              <Text style={styles.pendingSum}>{money(parseFloat(it.price) * it.quantity)}</Text>
            </View>
          ))}
        </Animated.View>
      ))}
    </View>
  );
}

function Items({ check }: { check: Check }) {
  if (!check.items.length) return null;
  return (
    <View style={styles.items}>
      <Text style={[type.overline, { marginBottom: space.sm }]}>В счёте</Text>
      {check.items.map((row) => (
        <View key={row.checkItem.id} style={styles.itemRow}>
          <Text style={styles.itemName} numberOfLines={1}>{row.item?.name ?? 'Позиция'}</Text>
          <Text style={styles.itemQty}>× {row.checkItem.quantity}</Text>
          <Text style={styles.itemSum}>{money(lineTotal(row))}</Text>
        </View>
      ))}
    </View>
  );
}

function Actions({ check, layout }: { check: Check | null; layout: 'column' | 'grid' }) {
  const router = useRouter();
  const chat = useChat(check?.id ?? null);
  const now = useNow(30_000);
  const unread = (chat.data ?? []).filter((m) => m.sender === 'staff' && !m.readAt).length;
  const total = check ? checkTotals(check, now.getTime()).total : 0;
  const grid = layout === 'grid';

  return (
    <View style={[styles.actions, grid && styles.actionsGrid]}>
      <Tap style={[styles.menuTile, grid && { flexBasis: '100%', minHeight: 120 }]} onPress={() => router.push('/menu')} accessibilityRole="button" accessibilityLabel="Меню">
        <View style={styles.menuIcon}>
          <Icon name="silverware-fork-knife" size={34} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.menuTitle}>Меню</Text>
          <Text style={styles.menuText}>{check ? 'Закажите отсюда — администратор подтвердит' : 'Посмотрите, что у нас есть'}</Text>
        </View>
        <Icon name="chevron-right" size={32} color="rgba(255,255,255,0.8)" />
      </Tap>
      {check ? (
        <>
          <View style={[styles.pair, grid && { flexBasis: '100%' }]}>
            <ActionTile icon="bell-ring-outline" label="Позвать" tone={colors.amber} onPress={() => void callStaff()} />
            <ActionTile icon="chat-outline" label="Чат" tone={colors.cyan} onPress={() => router.push('/chat')} badge={unread} />
          </View>
          <View style={[styles.pair, grid && { flexBasis: '100%' }]}>
            <ActionTile icon="receipt-text-outline" label="Попросить счёт" tone={colors.violetLight} onPress={() => void requestBill(check.id)} disabled={total <= 0} />
            <Tap style={styles.payTile} onPress={() => router.push('/pay')} disabled={total <= 0} accessibilityRole="button" accessibilityLabel="Оплатить по QR">
              <Icon name="qrcode" size={30} color="#fff" />
              <Text style={styles.payText}>Оплатить</Text>
            </Tap>
          </View>
        </>
      ) : (
        <View style={[styles.pair, grid && { flexBasis: '100%' }, { flex: 0.6 }]}>
          <ActionTile icon="bell-ring-outline" label="Позвать администратора" tone={colors.amber} onPress={() => void callStaff()} />
        </View>
      )}
    </View>
  );
}

function ActionTile({ icon, label, tone, onPress, badge = 0, disabled }: { icon: IconName; label: string; tone: string; onPress: () => void; badge?: number; disabled?: boolean }) {
  return (
    <Tap style={[styles.tile, { borderColor: `${tone}44`, backgroundColor: `${tone}12` }]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
      <View>
        <Icon name={icon} size={30} color={tone} />
        <Badge count={badge} />
      </View>
      <Text style={[styles.tileText, { color: tone }]} numberOfLines={2}>{label}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  wide: { flex: 1, flexDirection: 'row', gap: space.lg, paddingLeft: GUTTER },
  column: { gap: space.lg, padding: GUTTER, paddingTop: space.sm, paddingLeft: 0 },
  actionsColumn: { flex: 1, maxWidth: 360, paddingRight: GUTTER, paddingTop: space.sm, paddingBottom: GUTTER },

  event: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card,
    backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet,
  },
  eventIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.22)', alignItems: 'center', justifyContent: 'center' },
  eventTime: { fontSize: 16, fontWeight: '800', color: colors.lavender, fontVariant: ['tabular-nums'] },

  bill: {
    padding: space.xxl, borderRadius: radius.panel, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  },
  billFill: { flex: 1, justifyContent: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.xs },
  total: { fontSize: 72, lineHeight: 80, fontWeight: '900', color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -2 },
  totalRub: { fontSize: 34, lineHeight: 52, fontWeight: '800', color: colors.violetLight, marginLeft: 6 },
  breakdown: { marginTop: space.lg, gap: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowLabel: { flex: 1, fontSize: 16, color: colors.textBody },
  rowValue: { fontSize: 17, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },

  waitRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.lg },
  waitIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.violetTint, alignItems: 'center', justifyContent: 'center' },
  waitHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.xl, paddingTop: space.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  waitHintText: { flex: 1, fontSize: 15, color: colors.textSecondary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violetLight, boxShadow: '0 0 10px rgba(139,92,246,0.8)' },

  pending: { padding: space.lg, borderRadius: radius.card, backgroundColor: colors.amberTint, borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)', gap: space.sm },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  pendingTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.amber, textTransform: 'uppercase', letterSpacing: 0.6 },
  pendingCancel: { paddingHorizontal: 16, height: 40, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.redTint, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' },
  pendingCancelText: { color: colors.red, fontWeight: '800', fontSize: 14 },
  pendingLine: { flexDirection: 'row', gap: space.md },
  pendingName: { flex: 1, fontSize: 16, color: colors.textBody },
  pendingSum: { fontSize: 16, fontWeight: '700', color: colors.textBody, fontVariant: ['tabular-nums'] },

  items: { padding: space.xl, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemName: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  itemQty: { fontSize: 15, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  itemSum: { width: 110, textAlign: 'right', fontSize: 17, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },

  actions: { flex: 1, gap: space.md },
  actionsGrid: { flex: 0, flexDirection: 'row', flexWrap: 'wrap' },
  menuTile: {
    flex: 1.3, minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.xl,
    borderRadius: radius.panel, experimental_backgroundImage: brandGradient, boxShadow: '0 14px 40px rgba(139,92,246,0.35)',
  },
  menuIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 28, fontWeight: '900', color: '#fff' },
  menuText: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 4 },
  pair: { flex: 1, flexDirection: 'row', gap: space.md, minHeight: 118 },
  tile: { flex: 1, flexBasis: 0, minWidth: 0, borderRadius: radius.card, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md },
  tileText: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  payTile: {
    flex: 1, flexBasis: 0, minWidth: 0, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', gap: space.sm,
    padding: space.md, borderWidth: 1, borderColor: 'transparent',
    experimental_backgroundImage: payGradient, boxShadow: '0 12px 32px rgba(16,185,129,0.3)',
  },
  payText: { fontSize: 18, fontWeight: '900', color: '#fff' },
});
