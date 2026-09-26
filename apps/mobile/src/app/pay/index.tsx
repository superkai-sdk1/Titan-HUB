import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from 'expo-glass-effect';

import { Avatar, BalanceChips, GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { PaymentSuccess } from '@/components/payment-success';
import { checkTitle } from '@/lib/checks';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import {
  addTender,
  DueChangedError,
  METHODS,
  payCheck,
  paymentLedger,
  payTotals,
  setTenderAmount,
  usePaymentDraft,
  usePaySettings,
  usePosPlayer,
  validateCertificate,
  type Ledger,
  type PaymentPart,
  type PayResult,
  type TenderMethod,
} from '@/lib/payment';
import { usePosSelection } from '@/lib/pos-selection';
import { useCheck } from '@/lib/queries';
import { parseAmount } from '@/lib/shift-api';
import { isSplitLayout } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { useNow } from '@/lib/use-now';
import { promptText } from '@/lib/dialog';
import { ToolbarButton } from '@/components/toolbar';

const SHEET_DISMISS_MS = 420;
const NO_PARTS: PaymentPart[] = [];

/** Сетка способов — как в веб-кассе. Сертификат есть только у чеков мероприятий. */
const METHOD_ROWS: TenderMethod[][] = [
  ['cash', 'card', 'transfer'],
  ['deposit', 'bonus', 'debt'],
];

/**
 * Оплата чека. Кассир нажимает способ — он ложится частью на остаток; сумму части можно
 * поправить (для наличных — сколько дал гость, сдача посчитается). СБП — только на весь чек.
 */
export default function PayScreen() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const check = useCheck(checkId);
  const now = useNow(15_000);
  const settings = usePaySettings();
  const data = check.data;
  const player = usePosPlayer(data?.playerId ?? null);
  // Черновик другого чека не показываем даже на первый кадр, пока begin() его не сбросил.
  const ownDraft = usePaymentDraft((s) => s.checkId === checkId);
  const draftParts = usePaymentDraft((s) => s.parts);
  const draftCertificate = usePaymentDraft((s) => s.certificate);
  const draftNotice = usePaymentDraft((s) => s.notice);
  const parts = ownDraft ? draftParts : NO_PARTS;
  const certificate = ownDraft ? draftCertificate : null;
  const notice = ownDraft ? draftNotice : null;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PayResult | null>(null);

  useEffect(() => {
    usePaymentDraft.getState().begin(checkId);
    // Сумму к оплате считаем по свежему чеку, а не по кэшу.
    void check.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId]);

  const close = () => router.back();

  const finish = () => {
    const split = isSplitLayout();
    if (split) usePosSelection.getState().select(null);
    router.back();
    // Без панели после шторки уходит и экран чека — обычным переходом назад.
    if (!split) setTimeout(() => router.dismissTo('/pos'), SHEET_DISMISS_MS);
  };

  const toolbar = (
    <Stack.Toolbar placement="left">
      <ToolbarButton icon="xmark" accessibilityLabel="Закрыть" onPress={close} />
    </Stack.Toolbar>
  );

  if (result) {
    return (
      <PaymentSuccess
        title={result.alreadyClosed ? 'Чек уже закрыт' : 'Оплачено'}
        amount={result.alreadyClosed ? null : result.due}
        change={result.change}
        onDone={finish}
      />
    );
  }

  if (!data) {
    return (
      <>
        {toolbar}
        <View style={styles.state}>
          {check.isError ? (
            <>
              <SymbolView name="wifi.exclamationmark" size={40} tintColor={colors.secondaryLabel} />
              <Text style={[type.body, sheetStyles.secondary, styles.stateText]}>{check.error.message}</Text>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </>
    );
  }

  if (data.status !== 'open') {
    return (
      <>
        {toolbar}
        <View style={styles.state}>
          <SymbolView name="checkmark.seal.fill" size={44} tintColor={colors.green} />
          <Text style={[type.title3, sheetStyles.label]}>Чек уже закрыт</Text>
          <Text style={[type.body, sheetStyles.secondary, styles.stateText]}>Оплату провели на другом устройстве или по СБП.</Text>
        </View>
      </>
    );
  }

  const totals = payTotals(data, now);
  const hasPlayer = !!data.playerId;
  const ledgerFor = (nextParts: PaymentPart[], nextCertificate = certificate): Ledger =>
    paymentLedger({ parts: nextParts, totals, player: player.data, hasPlayer, settings, certificate: nextCertificate });
  const ledger = ledgerFor(parts);
  const methodRows = data.linkedEventId ? [...METHOD_ROWS, ['certificate' as const]] : METHOD_ROWS;

  const setParts = (next: PaymentPart[]) => usePaymentDraft.getState().setParts(next);

  const openQr = (surcharge8: boolean) => {
    haptic.light();
    router.push({ pathname: '/pay/qr', params: { checkId, surcharge: surcharge8 ? '1' : '0', base: String(totals.due) } });
  };

  const addMethod = async (method: TenderMethod) => {
    if (method === 'transfer') {
      Alert.alert('Оплата по СБП', 'Гость оплатит весь чек по QR-коду в приложении банка.', [
        { text: `Без комиссии · ${formatMoney(totals.due, { kopecks: 'auto' })}`, onPress: () => openQr(false) },
        { text: `С комиссией 8% · ${formatMoney(Math.round(totals.due * 1.08))}`, onPress: () => openQr(true) },
        { text: 'Отмена', style: 'cancel' },
      ]);
      return;
    }

    if (method === 'certificate' && !certificate) {
      promptText(
        'Сертификат',
        'Введите код с сертификата',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Найти',
            onPress: async (code?: string) => {
              try {
                const found = await validateCertificate(code ?? '');
                const draft = usePaymentDraft.getState();
                draft.setCertificate(found);
                draft.setParts(addTender(draft.parts, 'certificate', ledgerFor(draft.parts, found)));
                haptic.success();
              } catch (error) {
                haptic.error();
                Alert.alert('Сертификат', error instanceof Error ? error.message : String(error));
              }
            },
          },
        ],
        'plain-text',
        '',
        'default',
      );
      return;
    }

    const next = addTender(parts, method, ledger);
    if (next === parts) {
      haptic.warning();
      return;
    }
    haptic.selection();
    setParts(next);
  };

  const editPart = (part: PaymentPart) => {
    if (part.locked) return;
    const look = METHODS[part.method];
    promptText(
      look.title,
      part.method === 'cash' ? 'Сколько наличных дал гость — сдачу посчитаем' : 'Сумма этой части оплаты',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Готово',
          onPress: (value?: string) => {
            const amount = parseAmount(value ?? '');
            if (amount === null) return;
            const draft = usePaymentDraft.getState();
            draft.setParts(setTenderAmount(draft.parts, part.id, amount, ledgerFor(draft.parts)));
            haptic.selection();
          },
        },
      ],
      'plain-text',
      String(part.amount),
      'decimal-pad',
    );
  };

  const canSubmit = !busy && (totals.due <= 0 || (parts.length > 0 && ledger.remaining < 0.01));

  const submit = async () => {
    if (!canSubmit) return;
    haptic.medium();
    setBusy(true);
    try {
      const paid = await payCheck(checkId, { parts, certificate, expectedDue: totals.due });
      haptic.success();
      usePaymentDraft.getState().clear();
      setResult(paid);
    } catch (error) {
      haptic.error();
      if (error instanceof DueChangedError) {
        await check.refetch();
        Alert.alert('Сумма чека изменилась', `Теперь к оплате ${formatMoney(error.due, { kopecks: 'auto' })}. Проверьте части оплаты.`);
      } else {
        Alert.alert('Оплата не прошла', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const breakdown = [
    totals.items > 0 ? `позиции ${formatMoney(totals.items)}` : null,
    totals.rental > 0 ? `аренда ${formatMoney(totals.rental)}` : null,
    totals.eventBase > 0 ? `мероприятие ${formatMoney(totals.eventBase)}` : null,
    totals.prepaid > 0 ? `предоплата −${formatMoney(totals.prepaid)}` : null,
  ].filter(Boolean);

  const caption = (method: TenderMethod): string => {
    const reason = ledger.blockedReason(method);
    if (reason) return reason;
    switch (method) {
      case 'cash':
        return 'сдача посчитается';
      case 'card':
        return 'на карту';
      case 'transfer':
        return 'QR-код';
      case 'deposit':
        return `до ${formatMoney(ledger.depositCap)}`;
      case 'bonus':
        return `до ${formatMoney(ledger.bonusCap)}`;
      case 'debt':
        return Number.isFinite(ledger.debtCap) ? `до ${formatMoney(ledger.debtCap)}` : 'на клиента';
      case 'certificate':
        return certificate ? `остаток ${formatMoney(certificate.remaining)}` : 'по коду';
    }
  };

  const summary =
    totals.due <= 0
      ? { text: totals.staffComp ? 'Списание на персонал — без оплаты' : 'Чек на 0 ₽', color: colors.secondaryLabel }
      : ledger.remaining > 0
        ? { text: parts.length ? `Осталось ${formatMoney(ledger.remaining, { kopecks: 'auto' })}` : 'Выберите способ оплаты', color: parts.length ? colors.orange : colors.secondaryLabel }
        : ledger.change > 0
          ? { text: `Сдача ${formatMoney(ledger.change, { kopecks: 'auto' })}`, color: colors.green }
          : { text: 'Сумма сходится', color: colors.green };

  return (
    <>
      {toolbar}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={[type.subhead, sheetStyles.secondary]} numberOfLines={1}>
            {checkTitle(data)}
          </Text>
          <Text style={[styles.heroAmount, type.amount]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(totals.due, { kopecks: 'auto' })}
          </Text>
          {breakdown.length > 0 && <Text style={[type.footnote, sheetStyles.secondary]}>{breakdown.join(' · ')}</Text>}
          {totals.staffComp && (
            <View style={styles.staffComp}>
              <SymbolView name="person.badge.shield.checkmark" size={14} tintColor={colors.indigo} />
              <Text style={[type.footnote, styles.staffCompText]}>Списание на персонал · бесплатно</Text>
            </View>
          )}
        </View>

        {hasPlayer && (
          <GlassCard style={styles.payer}>
            <Avatar name={player.data?.nickname ?? '··'} photoUrl={player.data?.photoUrl} size={40} />
            <View style={styles.flex}>
              <Text style={[type.headline, sheetStyles.label]} numberOfLines={1}>
                {player.data?.nickname ?? 'Клиент'}
              </Text>
              <Text style={[type.footnote, sheetStyles.secondary]}>Плательщик</Text>
            </View>
            {player.data && <BalanceChips balance={player.data.balance} bonusPoints={player.data.bonusPoints} />}
          </GlassCard>
        )}

        {notice && (
          <Animated.View entering={FadeIn}>
            <GlassCard tint="rgba(52,199,89,0.22)" style={styles.notice}>
              <SymbolView name="checkmark.seal.fill" size={18} tintColor={colors.green} />
              <Text style={[type.footnote, styles.noticeText]}>{notice}</Text>
            </GlassCard>
          </Animated.View>
        )}

        {totals.due > 0 && (
          <View style={styles.section}>
            <Text style={[type.footnote, styles.sectionTitle]}>СПОСОБ ОПЛАТЫ</Text>
            {methodRows.map((row) => (
              <View key={row.join()} style={styles.methodRow}>
                {row.map((method) => {
                  const look = METHODS[method];
                  const blocked = !!ledger.blockedReason(method);
                  return (
                    <Pressable
                      key={method}
                      disabled={blocked || busy}
                      onPress={() => void addMethod(method)}
                      style={[styles.flex, blocked && styles.methodBlocked]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: blocked }}
                      accessibilityLabel={`${look.title}, ${caption(method)}`}>
                      <GlassView isInteractive={!blocked} style={styles.methodTile}>
                        <View style={[styles.methodIcon, { backgroundColor: `${look.color}26` }]}>
                          <SymbolView name={look.symbol} size={20} weight="semibold" tintColor={look.color} />
                        </View>
                        <Text style={[type.footnote, styles.methodTitle]} numberOfLines={1}>
                          {look.title}
                        </Text>
                        <Text style={[type.caption2, sheetStyles.secondary]} numberOfLines={1}>
                          {caption(method)}
                        </Text>
                      </GlassView>
                    </Pressable>
                  );
                })}
                {row.length < 3 && Array.from({ length: 3 - row.length }, (_, i) => <View key={i} style={styles.flex} />)}
              </View>
            ))}
          </View>
        )}

        {parts.length > 0 && (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} layout={LinearTransition} style={styles.section}>
            <Text style={[type.footnote, styles.sectionTitle]}>ОПЛАТА</Text>
            <GlassCard>
              {parts.map((part, index) => {
                const look = METHODS[part.method];
                return (
                  <Animated.View key={part.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} layout={LinearTransition}>
                    {index > 0 && <View style={[sheetStyles.separator, styles.partSeparator]} />}
                    <Pressable
                      onPress={() => editPart(part)}
                      disabled={part.locked || busy}
                      style={({ pressed }) => [styles.partRow, pressed && sheetStyles.pressedRow]}
                      accessibilityRole="button"
                      accessibilityLabel={`${look.title} ${formatMoney(part.amount)}. Изменить сумму`}>
                      <View style={[styles.partIcon, { backgroundColor: look.color }]}>
                        <SymbolView name={look.symbol} size={14} weight="semibold" tintColor="white" />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[type.body, sheetStyles.label]}>{look.title}</Text>
                        {part.locked ? (
                          <Text style={[type.caption1, sheetStyles.secondary]}>Подтверждено банком</Text>
                        ) : (
                          <Text style={[type.caption1, sheetStyles.tertiary]}>Нажмите, чтобы изменить сумму</Text>
                        )}
                      </View>
                      <Text style={[type.body, type.amount, sheetStyles.label]}>{formatMoney(part.amount, { kopecks: 'auto' })}</Text>
                      {!part.locked && (
                        <Pressable
                          hitSlop={10}
                          disabled={busy}
                          onPress={() => {
                            haptic.light();
                            usePaymentDraft.getState().remove(part.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Убрать ${look.title}`}>
                          <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.tertiaryLabel} />
                        </Pressable>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </GlassCard>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        <GlassCard style={styles.summaryCard}>
        <View style={styles.progressTrack}>
          <Animated.View
            layout={LinearTransition.springify().damping(20)}
            style={[
              styles.progressFill,
              {
                width: `${totals.due > 0 ? Math.min(100, (ledger.paid / totals.due) * 100) : 100}%`,
                backgroundColor: ledger.remaining > 0 ? colors.accent : colors.green,
              },
            ]}
          />
        </View>
        <Text style={[type.subhead, styles.summary, { color: summary.color }]}>{summary.text}</Text>
        </GlassCard>
        <PrimaryButton
          title={
            busy
              ? 'Проводим…'
              : totals.due <= 0
                ? 'Закрыть чек · 0 ₽'
                : `Провести ${formatMoney(totals.due, { kopecks: 'auto' })}`
          }
          busy={busy}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  stateText: { textAlign: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  hero: { alignItems: 'center', gap: 2, paddingVertical: space.sm },
  heroAmount: { fontSize: 52, lineHeight: 60, color: colors.label },
  staffComp: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
  staffCompText: { color: colors.label, fontWeight: '600' },

  payer: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  noticeText: { flex: 1, color: colors.label },

  section: { gap: space.sm },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  methodRow: { flexDirection: 'row', gap: 10 },
  methodTile: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: space.xs,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  methodBlocked: { opacity: 0.45 },
  methodIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  methodTitle: { color: colors.label, fontWeight: '600' },

  partRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: 58 },
  partIcon: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  partSeparator: { marginLeft: 58 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  summaryCard: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  summary: { textAlign: 'center', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
