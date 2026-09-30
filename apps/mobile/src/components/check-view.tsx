import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { GlassView } from '@/components/glass';
import { Avatar, BalanceChips } from '@/components/new-check-parts';
import { RollingText } from '@/components/rolling-text';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import type { CheckTotals } from '@/lib/checks';
import { promptText } from '@/lib/dialog';
import { eventErrorMessage, eventTitle, updateEvent, useEvent, useEventRates } from '@/lib/events-api';
import { formatDuration, formatMoney, formatTime, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { PosPlayer } from '@/lib/payment';
import { addItem, reloadCheck, TIER_LABEL, useCheckSuggestions } from '@/lib/pos-api';
import { parseAmount } from '@/lib/shift-api';
import { colors, radius, space, type } from '@/lib/theme';
import type { CheckDetail } from '@/lib/types';
import type { CheckActions } from '@/lib/use-check-actions';
import { useNow } from '@/lib/use-now';

/**
 * Открытый чек в стиле Liquid Glass: сумма крупно на фирменном фоне, дальше стеклянные
 * карточки — клиент, заказ из кабинки, позиции, скидки, аренда, итог. Общий для экрана
 * чека на iPhone и правой панели на iPad. Цифры сменяются «прокруткой», строки
 * появляются и уходят анимацией, позиции и скидки снимаются свайпом.
 */

const rowLayout = LinearTransition.springify().damping(22).stiffness(220);
const ORDER_TINT = 'rgba(255,149,0,0.20)';
/** Фиолетовое стекло Tai — как карточки предчеков. */
const TAI_TINT = 'rgba(139,92,246,0.18)';

type Props = {
  check: CheckDetail;
  totals: CheckTotals;
  actions: CheckActions;
  player?: PosPlayer | null;
  now: number;
} & Pick<ScrollViewProps, 'contentInsetAdjustmentBehavior' | 'contentContainerStyle'>;

export function CheckView({ check, totals, actions, player, now, contentInsetAdjustmentBehavior, contentContainerStyle }: Props) {
  const isOpen = check.status === 'open';
  const itemRows = check.items.filter((row) => row.checkItem.quantity > 0);
  const discountsTotal = check.discounts.reduce((sum, d) => sum + toNumber(d.amount), 0);
  const guests = check.guestNames ?? [];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      showsVerticalScrollIndicator={false}>
      {/* При открытии чек появляется целиком; анимации — только на изменения. */}
      <LayoutAnimationConfig skipEntering skipExiting>
        <View style={styles.hero}>
          <Text style={[type.footnote, styles.heroCaption]}>{isOpen ? 'К ОПЛАТЕ' : check.status === 'closed' ? 'ОПЛАЧЕН' : 'ОТМЕНЁН'}</Text>
          <RollingText text={formatMoney(totals.due)} style={[styles.heroAmount, type.amount]} />
          <Text style={[type.subhead, styles.secondary]}>
            {isOpen ? `Открыт в ${formatTime(check.createdAt)} · ${formatDuration(check.createdAt, now)}` : `Открыт в ${formatTime(check.createdAt)}`}
          </Text>
          {check.staffCompId && <Pill icon="person.badge.shield.checkmark" text="Списание на персонал — гостю бесплатно" color={colors.indigo} />}
        </View>

        {(isOpen || check.playerId) && (
          <Pressable onPress={actions.onOpenPlayer} disabled={!isOpen} accessibilityRole="button" accessibilityLabel="Клиенты чека">
            <GlassView isInteractive={isOpen} style={styles.card}>
              <View style={styles.clientRow}>
                {check.playerId ? (
                  <Avatar name={player?.nickname ?? '··'} photoUrl={player?.photoUrl} size={44} />
                ) : (
                  <View style={styles.addClientIcon}>
                    <SymbolView name="person.crop.circle.badge.plus" size={24} tintColor={colors.accent} />
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={[type.headline, styles.label]} numberOfLines={1}>
                    {check.playerId ? (player?.nickname ?? 'Клиент') : 'Добавить клиента'}
                  </Text>
                  <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
                    {check.playerId
                      ? player
                        ? (TIER_LABEL[player.clientTier] ?? player.clientTier)
                        : 'Загружаем…'
                      : 'Бонусы, депозит и долг — только с клиентом'}
                  </Text>
                </View>
                {player && <BalanceChips balance={player.balance} bonusPoints={player.bonusPoints} />}
                {isOpen && <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />}
              </View>

              {guests.map((name) => (
                <Animated.View key={name} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                  <View style={styles.divider} />
                  <View style={styles.guestRow}>
                    <View style={styles.guestIcon}>
                      <SymbolView name="person.fill" size={13} tintColor={colors.secondaryLabel} />
                    </View>
                    <Text style={[type.body, styles.label, styles.flex]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[type.footnote, styles.tertiary]}>участник</Text>
                    {isOpen && (
                      <Pressable hitSlop={10} onPress={() => actions.onRemoveGuest(name)} accessibilityRole="button" accessibilityLabel={`Убрать ${name}`}>
                        <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.tertiaryLabel} />
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              ))}
            </GlassView>
          </Pressable>
        )}

        {isOpen &&
          check.pendingOrders.map((order) => {
            const orderTotal = order.items.reduce((sum, item) => sum + toNumber(item.price) * item.quantity, 0);
            const busy = actions.busyOrderId === order.id;
            return (
              <Animated.View key={order.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                <GlassView tintColor={ORDER_TINT} style={styles.card}>
                  <CardHeader icon="bell.badge.fill" iconColor={colors.orange} title="Заказ из кабинки" detail={formatTime(order.createdAt)} />
                  {order.items.map((item, i) => (
                    <View key={`${order.id}-${i}`} style={styles.lineRow}>
                      <Text style={[type.body, styles.label, styles.flex]} numberOfLines={1}>
                        {item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
                      </Text>
                      <Text style={[type.body, type.amount, styles.label]}>{formatMoney(toNumber(item.price) * item.quantity)}</Text>
                    </View>
                  ))}
                  <View style={styles.divider} />
                  <View style={styles.lineRow}>
                    <Text style={[type.subhead, styles.secondary, styles.flex]}>Итого по заказу</Text>
                    <Text style={[type.headline, type.amount, styles.label]}>{formatMoney(orderTotal)}</Text>
                  </View>
                  <View style={styles.orderButtons}>
                    <Pressable
                      disabled={busy}
                      onPress={() => actions.onRejectOrder(order.id)}
                      style={({ pressed }) => [styles.orderButton, styles.rejectButton, pressed && styles.pressed]}
                      accessibilityRole="button">
                      <Text style={[type.headline, styles.rejectText]}>Отклонить</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => actions.onConfirmOrder(order.id)}
                      style={({ pressed }) => [styles.orderButton, styles.confirmButton, pressed && styles.pressed]}
                      accessibilityRole="button">
                      {busy ? <ActivityIndicator color="white" /> : <SymbolView name="checkmark" size={15} weight="bold" tintColor="white" />}
                      <Text style={[type.headline, styles.confirmText]}>Подтвердить</Text>
                    </Pressable>
                  </View>
                </GlassView>
              </Animated.View>
            );
          })}

        <GlassView style={styles.card}>
          <CardHeader
            icon="list.bullet"
            title="Позиции"
            detail={itemRows.length > 0 ? `${itemRows.length} ${plural(itemRows.length, ['позиция', 'позиции', 'позиций'])}` : undefined}
            action={isOpen ? { label: 'Добавить', icon: 'plus', onPress: actions.onAddItems } : undefined}
          />
          {itemRows.length === 0 ? (
            <Text style={[type.subhead, styles.secondary, styles.empty]}>{isOpen ? 'Чек пуст — добавьте позиции из меню' : 'Позиций нет'}</Text>
          ) : (
            itemRows.map((row, index) => (
              <Animated.View key={row.checkItem.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                {index > 0 && <View style={styles.divider} />}
                <ItemRow
                  name={row.item?.name ?? '—'}
                  checkItemId={row.checkItem.id}
                  quantity={row.checkItem.quantity}
                  price={toNumber(row.checkItem.priceAtTime)}
                  isOpen={isOpen}
                  onQuantity={actions.onQuantity}
                />
              </Animated.View>
            ))
          )}
        </GlassView>

        {isOpen && check.playerId && <TaiSuggestions checkId={check.id} itemIds={new Set(itemRows.map((row) => row.checkItem.itemId))} />}

        {check.linkedEventId && <LinkedEventCard check={check} isOpen={isOpen} base={totals.eventBase} />}

        {(isOpen || check.discounts.length > 0) && (
          <GlassView style={styles.card}>
            <CardHeader
              icon="percent"
              title="Скидки"
              detail={discountsTotal > 0 ? formatMoney(-discountsTotal) : undefined}
              action={isOpen ? { label: 'Добавить', icon: 'plus', onPress: actions.onAddDiscount } : undefined}
            />
            {check.discounts.length === 0 ? (
              <Text style={[type.subhead, styles.secondary, styles.empty]}>Скидок нет</Text>
            ) : (
              check.discounts.map((d, index) => (
                <Animated.View key={d.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                  {index > 0 && <View style={styles.divider} />}
                  <SwipeToDelete enabled={isOpen} label="Снять" onDelete={() => actions.onRemoveDiscount(d.id)}>
                    <View style={styles.lineRow}>
                      <View style={styles.flex}>
                        <Text style={[type.body, styles.label]} numberOfLines={1}>
                          {d.name}
                        </Text>
                        {d.discountId && <Text style={[type.caption1, styles.tertiary]}>автоматическая</Text>}
                      </View>
                      <Text style={[type.body, type.amount, styles.green]}>{formatMoney(-toNumber(d.amount))}</Text>
                    </View>
                  </SwipeToDelete>
                </Animated.View>
              ))
            )}
          </GlassView>
        )}

        {check.spaceId && check.spaceStartAt && (
          <GlassView style={styles.card}>
            <CardHeader icon="timer" title="Аренда зоны" detail={check.spaceEndAt ? 'завершена' : 'идёт'} detailColor={check.spaceEndAt ? undefined : colors.green} />
            <RentalTimer startAt={check.spaceStartAt} endAt={check.spaceEndAt} />
            <View style={styles.lineRow}>
              <Text style={[type.subhead, styles.secondary, styles.flex]}>
                {check.spaceEndAt ? `${formatTime(check.spaceStartAt)} – ${formatTime(check.spaceEndAt)}` : `с ${formatTime(check.spaceStartAt)}`}
                {check.spaceHourlyRate ? ` · ${formatMoney(check.spaceHourlyRate)}/ч` : ''}
              </Text>
              <RollingText text={formatMoney(totals.rental)} style={[type.headline, type.amount, styles.label]} />
            </View>
            {isOpen && (
              <Pressable onPress={actions.onEditRental} style={({ pressed }) => [styles.softButton, pressed && styles.pressed]} accessibilityRole="button">
                <SymbolView name="clock.arrow.circlepath" size={15} weight="semibold" tintColor={colors.accent} />
                <Text style={[type.subhead, styles.softButtonText]}>Изменить время</Text>
              </Pressable>
            )}
          </GlassView>
        )}

        <GlassView style={styles.card}>
          <CardHeader icon="sum" title="Итого" />
          <TotalRow label="Позиции" value={totals.items} />
          {discountsTotal > 0 && <TotalRow label="В том числе скидки" value={-discountsTotal} muted />}
          {totals.rental > 0 && <TotalRow label="Аренда" value={totals.rental} />}
          {totals.eventBase > 0 && <TotalRow label="Мероприятие" value={totals.eventBase} />}
          {totals.prepaid > 0 && <TotalRow label="Предоплата" value={-totals.prepaid} />}
          <View style={styles.divider} />
          <View style={styles.lineRow}>
            <Text style={[type.headline, styles.label, styles.flex]}>К оплате</Text>
            <RollingText text={formatMoney(totals.due)} style={[type.title3, type.amount, styles.label]} />
          </View>
        </GlassView>

        {isOpen && (
          <Pressable onPress={actions.onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={[type.body, styles.cancelText]}>Отменить чек</Text>
          </Pressable>
        )}
      </LayoutAnimationConfig>
    </ScrollView>
  );
}

/* ─────────────────────────── Строка позиции ─────────────────────────── */

function ItemRow({
  name,
  checkItemId,
  quantity,
  price,
  isOpen,
  onQuantity,
}: {
  name: string;
  checkItemId: string;
  quantity: number;
  price: number;
  isOpen: boolean;
  onQuantity: CheckActions['onQuantity'];
}) {
  // Количество меняется сразу, сервер подтверждает следом; быстрые нажатия не прыгают назад.
  const [pending, setPending] = useState<number | null>(null);
  const inflight = useRef(0);
  const qty = pending ?? quantity;

  const change = (next: number) => {
    const value = Math.max(0, next);
    haptic.selection();
    setPending(value);
    inflight.current += 1;
    void onQuantity(checkItemId, value).finally(() => {
      inflight.current -= 1;
      if (inflight.current === 0) setPending(null);
    });
  };

  return (
    <SwipeToDelete enabled={isOpen} label="Удалить" onDelete={() => change(0)}>
      <View style={[styles.itemRow, qty === 0 && styles.removing]}>
        <View style={styles.flex}>
          <Text style={[type.body, styles.label]} numberOfLines={2}>
            {name}
          </Text>
          <RollingText text={`${qty} × ${formatMoney(price)}`} style={[type.footnote, styles.secondary]} />
        </View>
        <View style={styles.itemRight}>
          <RollingText text={formatMoney(price * qty)} style={[type.body, type.amount, styles.label]} />
          {isOpen && (
            <View style={styles.stepper}>
              <Pressable
                hitSlop={6}
                onPress={() => change(qty - 1)}
                style={({ pressed }) => [styles.stepperButton, pressed && styles.stepperPressed]}
                accessibilityRole="button"
                accessibilityLabel={qty <= 1 ? `Удалить ${name}` : `Меньше: ${name}`}>
                <SymbolView name={qty <= 1 ? 'trash' : 'minus'} size={13} weight="semibold" tintColor={qty <= 1 ? colors.red : colors.label} />
              </Pressable>
              <RollingText text={String(qty)} style={[type.subhead, styles.stepperValue]} />
              <Pressable
                hitSlop={6}
                onPress={() => change(qty + 1)}
                style={({ pressed }) => [styles.stepperButton, pressed && styles.stepperPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Больше: ${name}`}>
                <SymbolView name="plus" size={13} weight="semibold" tintColor={colors.label} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </SwipeToDelete>
  );
}

/* ─────────────────────────── Tai предлагает ─────────────────────────── */

/**
 * Частые заказы резидента, которых ещё нет в чеке, — как «Tai предлагает» в веб-кассе.
 * Тап добавляет позицию. Сервер сам отдаёт пусто без подписки Tai и для не-резидентов.
 */
function TaiSuggestions({ checkId, itemIds }: { checkId: string; itemIds: Set<string> }) {
  const suggestions = useCheckSuggestions(checkId, true);
  const [adding, setAdding] = useState<string | null>(null);
  const list = (suggestions.data ?? []).filter((s) => !itemIds.has(s.itemId));
  if (list.length === 0) return null;

  const add = (itemId: string) => {
    haptic.light();
    setAdding(itemId);
    addItem(checkId, itemId)
      .catch((error: Error) => {
        haptic.error();
        Alert.alert('Позиция не добавлена', error.message === 'Check not open' ? 'Чек уже закрыт.' : error.message);
      })
      .finally(() => setAdding(null));
  };

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
      <GlassView tintColor={TAI_TINT} style={styles.card}>
        <CardHeader icon="sparkles" iconColor={colors.accent} title="Tai предлагает" detail="обычно берёт" />
        {list.map((s, index) => (
          <Animated.View key={s.itemId} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
            {index > 0 && <View style={styles.divider} />}
            <Pressable
              disabled={adding !== null}
              onPress={() => add(s.itemId)}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Добавить ${s.name}, ${formatMoney(toNumber(s.price))}`}>
              <View style={styles.flex}>
                <Text style={[type.body, styles.label]} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={[type.footnote, styles.secondary]}>{formatMoney(toNumber(s.price))}</Text>
              </View>
              <View style={styles.addBadge}>
                {adding === s.itemId ? <ActivityIndicator color="white" size="small" /> : <SymbolView name="plus" size={14} weight="bold" tintColor="white" />}
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </GlassView>
    </Animated.View>
  );
}

/* ─────────────────────────── Мероприятие чека ─────────────────────────── */

/**
 * Чек мероприятия: база (фикс-сумма или почасовой тариф) и её правка прямо из чека,
 * как в веб-кассе. Сервер пересчитывает базу только в собственном чеке мероприятия,
 * поэтому правка доступна лишь там; у миникапа база — взнос участника, его меняют в карточке миникапа.
 */
function LinkedEventCard({ check, isOpen, base }: { check: CheckDetail; isOpen: boolean; base: number }) {
  const event = useEvent(check.linkedEventId ?? undefined);
  const data = event.data;
  const hourly = data?.billingMode === 'hourly';
  // «По ставке зоны»: денег у мероприятия нет — их считает аренда зоны в этом же чеке.
  const rental = data?.billingMode === 'rental';
  const rates = useEventRates();
  const [busy, setBusy] = useState(false);
  const editable = isOpen && !!data && data.checkId === check.id && data.format !== 'minicap' && data.status !== 'completed' && data.status !== 'cancelled';
  if (!data && base <= 0) return null;

  const save = async (input: { plannedHours: number } | { fixedAmount: number }) => {
    if (!data || busy) return;
    haptic.selection();
    setBusy(true);
    try {
      await updateEvent(data.id, input);
      await reloadCheck(check.id);
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert('Мероприятие не изменено', eventErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  };

  const editAmount = () =>
    promptText(
      'Сумма мероприятия',
      'Фиксированная сумма — основа этого чека',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сохранить',
          onPress: (value?: string) => {
            const amount = parseAmount(value ?? '');
            if (amount === null) return Alert.alert('Введите сумму');
            void save({ fixedAmount: amount });
          },
        },
      ],
      'plain-text',
      String(data?.fixedAmount != null ? toNumber(data.fixedAmount) : base || ''),
      'decimal-pad',
    );

  return (
    <GlassView style={styles.card}>
      <CardHeader
        icon="calendar"
        iconColor={colors.accent}
        title={data ? eventTitle(data) : 'Мероприятие'}
        detail={hourly && data?.plannedHours ? `${data.plannedHours} ч` : undefined}
      />
      <View style={styles.lineRow}>
        <Text style={[type.subhead, styles.secondary, styles.flex]}>{rental ? 'Оплата по ставке зоны' : hourly ? 'Пакет по часам' : 'Сумма мероприятия'}</Text>
        {busy ? <ActivityIndicator /> : rental ? (
          <Text style={[type.subhead, styles.secondary]}>по факту</Text>
        ) : (
          <RollingText text={formatMoney(base)} style={[type.headline, type.amount, styles.label]} />
        )}
      </View>
      {editable && hourly && (rates.data?.length ?? 0) > 0 && (
        <View style={styles.hoursGrid}>
          {rates.data!.map((rate) => {
            const active = data!.plannedHours === rate.hours;
            return (
              <Pressable
                key={rate.hours}
                disabled={busy || active}
                onPress={() => void save({ plannedHours: rate.hours })}
                style={({ pressed }) => [styles.hourChip, active && styles.hourChipActive, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${rate.hours} ч, ${formatMoney(toNumber(rate.price))}`}>
                <Text style={[type.subhead, styles.hourText, active && styles.hourTextActive]}>{rate.hours} ч</Text>
                <Text style={[type.caption1, active ? styles.hourTextActive : styles.secondary]} numberOfLines={1}>
                  {formatMoney(toNumber(rate.price))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {editable && !hourly && !rental && (
        <Pressable onPress={editAmount} disabled={busy} style={({ pressed }) => [styles.softButton, pressed && styles.pressed]} accessibilityRole="button">
          <SymbolView name="pencil" size={15} weight="semibold" tintColor={colors.accent} />
          <Text style={[type.subhead, styles.softButtonText]}>Изменить сумму</Text>
        </Pressable>
      )}
    </GlassView>
  );
}

/* ─────────────────────────── Мелкие части ─────────────────────────── */

function CardHeader({
  icon,
  iconColor = colors.secondaryLabel,
  title,
  detail,
  detailColor,
  action,
}: {
  icon: SFSymbol;
  iconColor?: typeof colors.secondaryLabel;
  title: string;
  detail?: string;
  detailColor?: typeof colors.green;
  action?: { label: string; icon: SFSymbol; onPress: () => void };
}) {
  return (
    <View style={styles.cardHeader}>
      <SymbolView name={icon} size={15} weight="semibold" tintColor={iconColor} />
      <Text style={[type.headline, styles.label]}>{title}</Text>
      {detail && <Text style={[type.subhead, detailColor ? { color: detailColor } : styles.secondary]}>{detail}</Text>}
      <View style={styles.flex} />
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]} accessibilityRole="button">
          <SymbolView name={action.icon} size={13} weight="bold" tintColor={colors.accent} />
          <Text style={[type.subhead, styles.headerActionText]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <View style={styles.lineRow}>
      <Text style={[type.subhead, muted ? styles.tertiary : styles.secondary, styles.flex]}>{label}</Text>
      <RollingText text={formatMoney(value)} style={[type.subhead, type.amount, muted ? styles.tertiary : styles.label]} />
    </View>
  );
}

function Pill({ icon, text, color }: { icon: SFSymbol; text: string; color: typeof colors.indigo }) {
  return (
    <View style={styles.pill}>
      <SymbolView name={icon} size={13} tintColor={color} />
      <Text style={[type.footnote, styles.label]}>{text}</Text>
    </View>
  );
}

/** Живой таймер аренды: обновляется каждую секунду, не перерисовывая весь чек. */
function RentalTimer({ startAt, endAt }: { startAt: string; endAt: string | null }) {
  const now = useNow(1000);
  const end = endAt ? new Date(endAt).getTime() : now;
  const seconds = Math.max(0, Math.floor((end - new Date(startAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <Text style={[styles.timer, type.amount]}>{`${h}:${pad(m)}:${pad(s)}`}</Text>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 120, gap: space.md },
  flex: { flex: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  green: { color: colors.green },
  pressed: { opacity: 0.6 },

  hero: { alignItems: 'center', gap: 2, paddingTop: space.sm, paddingBottom: space.sm },
  heroCaption: { color: colors.secondaryLabel, letterSpacing: 0.6, fontWeight: '600' },
  heroAmount: { fontSize: 52, lineHeight: 62, color: colors.label },
  pill: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },

  card: { borderRadius: radius.card, borderCurve: 'continuous', padding: space.lg, gap: space.sm, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.fill },
  headerActionText: { color: colors.accent, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  empty: { paddingVertical: space.sm },

  clientRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  addClientIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  guestIcon: { width: 44, alignItems: 'center' },

  lineRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 30 },
  orderButtons: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  orderButton: { flex: 1, height: 44, borderRadius: 14, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rejectButton: { backgroundColor: colors.fill },
  rejectText: { color: colors.red },
  confirmButton: { backgroundColor: colors.accent },
  confirmText: { color: 'white' },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  removing: { opacity: 0.4 },
  itemRight: { alignItems: 'flex-end', gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 32, borderRadius: 999, backgroundColor: colors.fill, paddingHorizontal: 2 },
  stepperButton: { width: 32, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepperPressed: { backgroundColor: colors.fill },
  stepperValue: { minWidth: 22, textAlign: 'center', color: colors.label, fontWeight: '600', fontVariant: ['tabular-nums'] },

  timer: { fontSize: 34, lineHeight: 40, color: colors.label },
  softButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
  softButtonText: { color: colors.accent, fontWeight: '600' },

  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  addBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  hoursGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  hourChip: { flexGrow: 1, minWidth: 64, alignItems: 'center', gap: 2, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.fill },
  hourChipActive: { backgroundColor: colors.accent },
  hourText: { color: colors.label, fontWeight: '700' },
  hourTextActive: { color: 'white' },
  cancel: { alignSelf: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
  cancelText: { color: colors.red, fontWeight: '600' },

});
