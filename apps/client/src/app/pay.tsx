// Оплата: пополнить депозит, погасить долг, внести взнос (фонд клуба и разовые сборы).
// Платёж создаётся на сервере и открывается страница СБП эквайера клуба; деньги
// зачисляются, когда банк подтвердит платёж (вебхук) — приложение ждёт этого,
// опрашивая статус. Закрыть экран можно в любой момент: зачисление всё равно
// произойдёт, а клиент получит уведомление.
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { amountToInput, Keypad, parseAmount } from '@/components/keypad';
import { Button, EmptyState, Icon, type IconName, Tap } from '@/components/ui';
import { errorText } from '@/lib/api';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { createPayment, paymentStatus, refreshMoney, useWallet } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';
import type { CreatedPayment, PayPurpose, Wallet } from '@/lib/types';

type Phase = 'form' | 'creating' | 'waiting' | 'success' | 'failed' | 'timeout';
interface Target { id: string; purpose: PayPurpose; collectionId?: string; label: string; icon: IconName; color: string; hint: string }

const POLL_MS = 3000;
const WAIT_LIMIT_MS = 8 * 60 * 1000;
const QUICK = [500, 1000, 2000, 5000];

function targetsFor(w: Wallet): Target[] {
  const list: Target[] = [
    { id: 'deposit', purpose: 'deposit', label: 'Депозит', icon: 'wallet', color: colors.green, hint: 'Пополнить личный счёт в клубе' },
  ];
  if (w.debt > 0) list.unshift({ id: 'debt', purpose: 'debt', label: 'Долг', icon: 'card', color: colors.red, hint: `Текущий долг ${money(w.debt)}` });
  for (const c of w.collections.filter((x) => !x.excluded)) {
    list.push({
      id: `fund:${c.id}`, purpose: 'fund', collectionId: c.id, label: c.name, icon: 'people', color: colors.cyan,
      hint: c.topUp > 0 ? `К оплате ${money(c.topUp)}${c.kind === 'recurring' ? ` · ${c.period.label}` : ''}` : c.kind === 'recurring' ? 'Оплачено — можно внести вперёд' : 'Оплачено',
    });
  }
  return list;
}

function suggested(t: Target, w: Wallet): number {
  if (t.purpose === 'debt') return w.debt;
  if (t.purpose === 'fund') {
    const c = w.collections.find((x) => x.id === t.collectionId);
    return c ? (c.topUp > 0 ? c.topUp : c.due) : 0;
  }
  return 0;
}

export default function PayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ purpose?: string; collectionId?: string }>();
  const { data: w } = useWallet();
  const demo = useSession((s) => s.status === 'demo');

  const targets = useMemo(() => (w ? targetsFor(w) : []), [w]);
  const initial = useMemo(() => {
    if (!targets.length) return null;
    if (params.purpose === 'fund') {
      return targets.find((t) => t.collectionId === params.collectionId)
        ?? targets.find((t) => t.purpose === 'fund' && w?.collections.find((c) => c.id === t.collectionId)?.topUp)
        ?? targets.find((t) => t.purpose === 'fund') ?? targets[0];
    }
    return targets.find((t) => t.purpose === params.purpose) ?? targets[0];
  }, [targets, params.purpose, params.collectionId, w]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const target = targets.find((t) => t.id === selectedId) ?? initial;
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const amountStr = amountInput ?? (target && w ? amountToInput(suggested(target, w)) : '');
  const amount = parseAmount(amountStr);

  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<CreatedPayment | null>(null);
  const [kick, setKick] = useState(0);
  const startedAt = useRef(0);
  const checking = useRef(false);

  const surcharge = w?.pay.surchargePercent ?? 8;
  const charged = Math.round(amount * (100 + surcharge)) / 100;
  const canPay = !!target && amount >= 1 && phase === 'form';

  function select(t: Target) {
    haptic.select();
    setSelectedId(t.id);
    setAmountInput(w ? amountToInput(suggested(t, w)) : '');
    setError(null);
  }

  async function openBank(url: string) {
    if (demo) return;
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.background,
      controlsColor: colors.violetLight,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      showTitle: true,
    }).catch(() => {});
    // Клиент закрыл страницу банка — сразу проверяем статус (через эффект ниже).
    setKick((k) => k + 1);
  }

  async function pay() {
    if (!target || !canPay) return;
    haptic.tap();
    setError(null);
    setPhase('creating');
    try {
      const p = await createPayment({ purpose: target.purpose, amount, ...(target.collectionId ? { collectionId: target.collectionId } : {}) });
      setPayment(p);
      startedAt.current = Date.now();
      setPhase('waiting');
      void openBank(p.paymentUrl);
    } catch (e) {
      haptic.error();
      setError(errorText(e));
      setPhase('form');
    }
  }

  const check = useEffectEvent(async () => {
    if (phase !== 'waiting' || !payment || checking.current) return;
    checking.current = true;
    try {
      const s = await paymentStatus(payment.paymentId);
      if (s === 'confirmed') {
        if (Platform.OS === 'ios') void WebBrowser.dismissBrowser().catch(() => {});
        haptic.success();
        refreshMoney();
        setPhase('success');
      } else if (s === 'failed') {
        haptic.error();
        setPhase('failed');
      } else if (Date.now() - startedAt.current > WAIT_LIMIT_MS) {
        setPhase('timeout');
      }
    } catch { /* сеть моргнула — повторим */ } finally {
      checking.current = false;
    }
  });

  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (kick === 0) return;
    const t = setTimeout(() => void check(), 300);
    return () => clearTimeout(t);
  }, [kick]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.md }]}>
      <View style={[styles.top, { paddingTop: Platform.OS === 'android' ? insets.top + space.md : space.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={type.heading}>Оплата</Text>
          <Tap onPress={close} scaleTo={0.9} style={styles.close} accessibilityLabel="Закрыть">
            <Icon name="close" size={20} color={colors.textBody} />
          </Tap>
        </View>
      </View>

      {!w ? (
        <ActivityIndicator color={colors.violetLight} style={{ marginTop: 60 }} />
      ) : !w.pay.online ? (
        <EmptyState icon="card-outline" title="Онлайн-оплата временно недоступна"
          text="Пополнить депозит, погасить долг или внести взнос можно на кассе клуба.">
          <Button title="Понятно" variant="secondary" onPress={close} />
        </EmptyState>
      ) : phase === 'success' && payment ? (
        <Success payment={payment} target={target} onDone={close} />
      ) : phase === 'waiting' || phase === 'timeout' || phase === 'failed' ? (
        <Waiting phase={phase} payment={payment!} demo={demo} onReopen={() => payment && void openBank(payment.paymentUrl)}
          onRetry={() => { setPhase('form'); setPayment(null); }} onClose={close} />
      ) : (
        <View style={styles.form}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: GUTTER }}>
            {targets.map((t) => {
              const active = t.id === target?.id;
              return (
                <Tap key={t.id} onPress={() => select(t)} scaleTo={0.95} hapticOnPress={false}
                  style={[styles.chip, active && { backgroundColor: `${t.color}1f`, borderColor: `${t.color}66` }]}
                  accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={t.label}>
                  <Icon name={t.icon} size={16} color={active ? t.color : colors.textSecondary} />
                  <Text style={[styles.chipText, active && { color: colors.text }]} numberOfLines={1}>{t.label}</Text>
                </Tap>
              );
            })}
          </ScrollView>

          <View style={styles.column}>
            <Text style={[type.caption, { textAlign: 'center', marginTop: space.lg }]}>{target?.hint}</Text>
            <Animated.View key={target?.id} entering={FadeIn.duration(200)} style={styles.amountBox}>
              <Text style={[styles.amount, !amountStr && { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
                {amountStr ? `${amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽` : '0 ₽'}
              </Text>
            </Animated.View>

            <View style={styles.quickRow}>
              {target?.purpose === 'deposit'
                ? QUICK.map((q) => (
                    <Tap key={q} onPress={() => setAmountInput(String(q))} scaleTo={0.94} style={styles.quick}>
                      <Text style={styles.quickText}>{q.toLocaleString('ru')}</Text>
                    </Tap>
                  ))
                : target && w && suggested(target, w) > 0 ? (
                    <Tap onPress={() => setAmountInput(amountToInput(suggested(target, w)))} scaleTo={0.94} style={styles.quick}>
                      <Text style={styles.quickText}>{target.purpose === 'debt' ? 'Весь долг' : 'Вся сумма'} · {money(suggested(target, w))}</Text>
                    </Tap>
                  ) : null}
            </View>

            <Breakdown target={target} amount={amount} charged={charged} surcharge={surcharge} wallet={w} />

            <Keypad value={amountStr} onChange={(v) => { setAmountInput(v); setError(null); }} />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title={amount >= 1 ? `Оплатить ${money(charged)}` : 'Введите сумму'}
              icon="flash"
              loading={phase === 'creating'}
              disabled={!canPay}
              onPress={() => void pay()}
              style={{ marginTop: space.md }}
            />
            <Text style={styles.sbp}>Оплата через СБП · откроется страница банка</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Breakdown({ target, amount, charged, surcharge, wallet }: { target: Target | null | undefined; amount: number; charged: number; surcharge: number; wallet: Wallet }) {
  if (!target || amount < 1) return <View style={{ height: 44 }} />;
  let note: string | null = null;
  if (target.purpose === 'debt' && amount > wallet.debt && wallet.debt > 0) note = `Сверх долга ${money(amount - wallet.debt)} уйдёт на депозит`;
  if (target.purpose === 'fund') {
    const c = wallet.collections.find((x) => x.id === target.collectionId);
    if (c && c.topUp > 0 && amount < c.topUp) note = `Частичный взнос: останется ${money(c.topUp - amount)}`;
    if (c && c.kind === 'recurring' && c.due > 0 && amount > Math.max(c.topUp, 0) + 0.005) {
      const ahead = Math.floor((amount - Math.max(c.topUp, 0)) / c.due);
      if (ahead > 0) note = `Хватит ещё на ${ahead} мес. вперёд`;
    }
  }
  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownText}>
        Зачислим <Text style={{ color: colors.text, fontWeight: '700' }}>{money(amount)}</Text> · банк +{surcharge}% · к оплате{' '}
        <Text style={{ color: colors.lavender, fontWeight: '800' }}>{money(charged)}</Text>
      </Text>
      {note ? <Text style={[styles.breakdownText, { color: colors.amber, marginTop: 2 }]}>{note}</Text> : null}
    </View>
  );
}

function Waiting({
  phase, payment, demo, onReopen, onRetry, onClose,
}: { phase: Phase; payment: CreatedPayment; demo: boolean; onReopen: () => void; onRetry: () => void; onClose: () => void }) {
  if (phase === 'failed') {
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.column, styles.center]}>
        <View style={[styles.statusCircle, { backgroundColor: colors.redTint }]}><Icon name="close" size={44} color={colors.red} /></View>
        <Text style={[type.heading, { textAlign: 'center', marginTop: space.xl }]}>Платёж не прошёл</Text>
        <Text style={[type.callout, styles.centerText]}>Деньги не списаны. Попробуйте ещё раз или выберите другой банк.</Text>
        <Button title="Попробовать снова" onPress={onRetry} style={styles.wide} />
        <Button title="Закрыть" variant="ghost" onPress={onClose} />
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.column, styles.center]}>
      <View style={[styles.statusCircle, { backgroundColor: colors.violetTint }]}>
        {phase === 'timeout' ? <Icon name="time" size={40} color={colors.violetLight} /> : <ActivityIndicator size="large" color={colors.violetLight} />}
      </View>
      <Text style={[type.heading, { textAlign: 'center', marginTop: space.xl }]}>
        {phase === 'timeout' ? 'Ждём подтверждение банка' : 'Ожидаем оплату'}
      </Text>
      <Text style={[type.callout, styles.centerText]}>
        {demo
          ? 'Демо-режим: платёж подтвердится сам через пару секунд.'
          : phase === 'timeout'
            ? 'Если вы оплатили — деньги зачислятся автоматически, мы пришлём уведомление. Экран можно закрыть.'
            : `Подтвердите платёж ${money(payment.charged)} в приложении банка. Как только банк ответит, баланс обновится.`}
      </Text>
      {!demo ? <Button title="Открыть страницу оплаты" variant="secondary" icon="open-outline" onPress={onReopen} style={styles.wide} /> : null}
      <Button title="Закрыть" variant="ghost" onPress={onClose} />
    </Animated.View>
  );
}

function Success({ payment, target, onDone }: { payment: CreatedPayment; target: Target | null | undefined; onDone: () => void }) {
  const title = target?.purpose === 'debt' ? 'Долг погашен' : target?.purpose === 'fund' ? 'Взнос получен' : 'Депозит пополнен';
  return (
    <View style={[styles.column, styles.center]}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.statusCircle, styles.successCircle]}>
        <Icon name="checkmark" size={52} color="#fff" />
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(150).duration(350)} style={[type.title, { textAlign: 'center', marginTop: space.xl }]}>
        {title}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(230).duration(350)} style={[styles.successAmount]}>
        +{money(payment.base)}
      </Animated.Text>
      <Animated.View entering={FadeIn.delay(400)} style={{ alignSelf: 'stretch' }}>
        <Text style={[type.callout, styles.centerText]}>{target?.label ?? ''} · оплачено {money(payment.charged)} с учётом комиссии банка</Text>
        <Button title="Готово" onPress={onDone} style={styles.wide} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: GUTTER },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: space.md, display: Platform.OS === 'ios' ? 'flex' : 'none' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  form: { flex: 1, justifyContent: 'space-between' },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: GUTTER },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, maxWidth: 220,
  },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  amountBox: { alignItems: 'center', justifyContent: 'center', height: 76, marginTop: space.sm },
  amount: { color: colors.text, fontSize: 52, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, minHeight: 34, flexWrap: 'wrap' },
  quick: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet, justifyContent: 'center' },
  quickText: { color: colors.lavender, fontSize: 13, fontWeight: '700' },
  breakdown: { minHeight: 44, justifyContent: 'center', marginVertical: space.sm },
  breakdownText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  error: { color: colors.red, fontSize: 13, textAlign: 'center', marginTop: space.sm },
  sbp: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: space.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  centerText: { color: colors.textSecondary, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
  statusCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successCircle: { experimental_backgroundImage: 'linear-gradient(135deg, #34D399 0%, #059669 100%)', boxShadow: '0 14px 36px rgba(16,185,129,0.4)' },
  successAmount: { color: colors.greenBright, fontSize: 34, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginTop: space.sm, fontVariant: ['tabular-nums'] },
  wide: { alignSelf: 'stretch', marginTop: space.xl },
});
