import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput, type TextInputRef } from '@/components/text';
import { GlassView } from '@/components/glass';
import { Avatar, BalanceChips, GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { PaymentSuccess } from '@/components/payment-success';
import { ToolbarButton } from '@/components/toolbar';
import { checkTitle } from '@/lib/checks';
import { promptText } from '@/lib/dialog';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { isSplitLayout, KEYBOARD_DISMISS } from '@/lib/layout';
import {
  addTender,
  DueChangedError,
  METHODS,
  payCheck,
  paymentLedger,
  payTotals,
  round2,
  setTenderAmount,
  usePaymentDraft,
  usePaySettings,
  usePosPlayer,
  validateCertificate,
  type Certificate,
  type Ledger,
  type PaymentPart,
  type PayResult,
  type TenderMethod,
} from '@/lib/payment';
import { usePosSelection } from '@/lib/pos-selection';
import { useCheck } from '@/lib/queries';
import { parseAmount } from '@/lib/shift-api';
import { FONT_SCALE_MAX, useTextLayout } from '@/lib/text-scale';
import { colors, space, type } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

const SHEET_DISMISS_MS = 420;
const NO_PARTS: PaymentPart[] = [];
const EPS = 0.01;

/** Сетка способов — как в веб-кассе (по три в ряд). Сертификат есть только у чеков мероприятий. */
const METHOD_ROWS: TenderMethod[][] = [
  ['cash', 'card', 'transfer'],
  ['deposit', 'bonus', 'debt'],
];

type Mode = 'single' | 'split';

const money = (n: number) => formatMoney(n, { kopecks: 'auto' });
/** Сумма для поля ввода: «1350» или «1350,5» — без пробелов, чтобы правка не спотыкалась. */
const inputText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));

/** Купюры, которыми гость скорее всего расплатится: ближайшие круглые суммы не меньше чека. */
function cashPresets(due: number): number[] {
  const out = new Set<number>();
  for (const step of [100, 500, 1000, 5000]) {
    const v = Math.ceil(due / step) * step;
    if (v > due + EPS) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

/**
 * Оплата чека. Два режима:
 * - «Одним способом» — способ закрывает весь чек; для наличных — сколько дал гость и сдача;
 * - «Разделить» — несколько частей, сумма каждой правится прямо в строке, новый способ
 *   встаёт на остаток (а если остатка нет — забирает половину последней части).
 * СБП — только на весь чек (QR-код), подтверждённая банком часть не меняется.
 */
export default function PayScreen() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardState((state) => state.isVisible);
  // Очень крупный текст: плитки способов — по две в ряд, в три подписи не помещались.
  const { stacked } = useTextLayout();
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
  const [mode, setMode] = useState<Mode>('single');
  const [hint, setHint] = useState<string | null>(null);
  // Куда поставить курсор: seq растёт с каждым запросом, чтобы фокус срабатывал и на ту же часть.
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
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
  const ledgerFor = (nextParts: PaymentPart[], nextCertificate: Certificate | null = certificate): Ledger =>
    paymentLedger({
      parts: nextParts,
      totals,
      player: player.data,
      hasPlayer,
      settings,
      certificate: nextCertificate,
    });
  const ledger = ledgerFor(parts);
  const perRow = stacked ? 2 : 3;
  const methods = [...METHOD_ROWS.flat(), ...(data.linkedEventId ? (['certificate'] as const) : [])];
  const methodRows = Array.from({ length: Math.ceil(methods.length / perRow) }, (_, i) => methods.slice(i * perRow, (i + 1) * perRow));

  // Подтверждённая банком часть (СБП) меняться не может — показываем её списком частей.
  const hasLocked = parts.some((p) => p.locked);
  const view: Mode = hasLocked || parts.length > 1 ? 'split' : mode;
  const single = view === 'single' && parts.length === 1 ? parts[0] : null;

  const setParts = (next: PaymentPart[]) => usePaymentDraft.getState().setParts(next);

  const switchMode = (next: Mode) => {
    if (next === view) return;
    haptic.selection();
    Keyboard.dismiss();
    setHint(null);
    if (next === 'single') {
      // В «одном способе» остаётся только часть, закрывающая весь чек.
      const keep = parts.length === 1 && parts[0].amount >= totals.due - EPS ? parts : [];
      setParts(keep);
      if (!keep.length) usePaymentDraft.getState().setCertificate(null);
    }
    setMode(next);
  };

  const openQr = (surcharge8: boolean) => {
    haptic.light();
    router.push({
      pathname: '/pay/qr',
      params: {
        checkId,
        surcharge: surcharge8 ? '1' : '0',
        base: String(totals.due),
      },
    });
  };

  const askQr = () =>
    Alert.alert('Оплата по СБП', 'Гость оплатит весь чек по QR-коду в приложении банка.', [
      {
        text: `Без комиссии · ${money(totals.due)}`,
        onPress: () => openQr(false),
      },
      {
        text: `С комиссией 8% · ${formatMoney(Math.round(totals.due * 1.08))}`,
        onPress: () => openQr(true),
      },
      { text: 'Отмена', style: 'cancel' },
    ]);

  /** Способ не покрыл весь чек (лимит депозита, бонусов, сертификата) — сразу к разделению. */
  const continueSplit = (next: PaymentPart[], method: TenderMethod) => {
    const covered = next.reduce((a, p) => a + p.amount, 0);
    if (covered < totals.due - EPS) {
      setMode('split');
      setHint(`${METHODS[method].title} покрывает ${money(covered)}. Выберите, чем доплатить ${money(round2(totals.due - covered))}.`);
    }
  };

  const askCertificate = (apply: (found: Certificate) => void) =>
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
              usePaymentDraft.getState().setCertificate(found);
              apply(found);
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

  /** «Одним способом»: способ встаёт на весь чек, повторное нажатие снимает выбор. */
  const pickSingle = (method: TenderMethod) => {
    if (method === 'transfer') return askQr();
    if (single?.method === method) {
      haptic.light();
      setParts([]);
      return;
    }
    if (method === 'certificate' && !certificate) {
      askCertificate((found) => {
        const next = addTender([], 'certificate', ledgerFor([], found));
        setParts(next);
        continueSplit(next, 'certificate');
      });
      return;
    }
    const next = addTender([], method, ledgerFor([]));
    if (!next.length) {
      haptic.warning();
      return;
    }
    haptic.selection();
    setHint(null);
    setParts(next);
    continueSplit(next, method);
  };

  /** Последняя редактируемая часть, от которой можно отделить половину. */
  const donor = [...parts].reverse().find((p) => !p.locked && p.amount >= 2);

  /** «Разделить»: способ встаёт на остаток; если остатка нет — забирает половину последней части. */
  const addSplit = (method: TenderMethod) => {
    if (method === 'transfer') return askQr();
    if (method === 'certificate' && !certificate) {
      askCertificate((found) => {
        const draft = usePaymentDraft.getState();
        const next = addTender(draft.parts, 'certificate', ledgerFor(draft.parts, found));
        draft.setParts(next);
      });
      return;
    }
    let base = parts;
    if (ledger.remaining < EPS && donor && donor.method !== method) {
      const half = round2(Math.floor(donor.amount / 2));
      base = parts.map((p) => (p.id === donor.id ? { ...p, amount: round2(p.amount - half) } : p));
    }
    const next = addTender(base, method, ledgerFor(base));
    if (next === base) {
      haptic.warning();
      return;
    }
    haptic.selection();
    setHint(null);
    setParts(next);
    // Курсор — в сумму добавленной (или пополненной) части: её обычно сразу правят.
    const added = next.find((p) => p.method === method && !p.locked);
    if (added) setFocus((f) => ({ id: added.id, seq: (f?.seq ?? 0) + 1 }));
  };

  const changeAmount = (id: string, amount: number) => {
    const draft = usePaymentDraft.getState();
    draft.setParts(setTenderAmount(draft.parts, id, amount, ledgerFor(draft.parts)));
  };

  const removePart = (part: PaymentPart) => {
    haptic.light();
    usePaymentDraft.getState().remove(part.id);
  };

  /** Добить часть остатком чека (с учётом лимита способа). */
  const fillRest = (part: PaymentPart) => {
    const next = addTender(parts, part.method, ledger);
    if (next === parts) return haptic.warning();
    haptic.selection();
    setParts(next);
  };

  /** Сколько наличных дал гость (в «одном способе»). */
  const setCashGiven = (amount: number) => {
    if (!single || single.method !== 'cash') return;
    setParts([{ ...single, amount: round2(Math.max(totals.due, amount)) }]);
  };

  const canSubmit = !busy && (totals.due <= 0 || (parts.length > 0 && ledger.remaining < EPS));

  const submit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    haptic.medium();
    setBusy(true);
    try {
      const paid = await payCheck(checkId, {
        parts,
        certificate,
        expectedDue: totals.due,
      });
      haptic.success();
      usePaymentDraft.getState().clear();
      setResult(paid);
    } catch (error) {
      haptic.error();
      if (error instanceof DueChangedError) {
        await check.refetch();
        Alert.alert('Сумма чека изменилась', `Теперь к оплате ${money(error.due)}. Проверьте части оплаты.`);
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

  // В «одном способе» доступность считаем по пустой оплате: выбранный способ не блокирует остальные.
  const tileLedger = view === 'single' ? ledgerFor([]) : ledger;
  const tileState = (method: TenderMethod): { blocked: boolean; caption: string } => {
    const reason = tileLedger.blockedReason(method);
    if (view === 'split' && reason === 'Оплачено' && donor && donor.method !== method) return { blocked: false, caption: 'разделит пополам' };
    if (reason) return { blocked: true, caption: reason };
    switch (method) {
      case 'cash':
        return { blocked: false, caption: 'сдача посчитается' };
      case 'card':
        return { blocked: false, caption: 'на карту' };
      case 'transfer':
        return { blocked: false, caption: 'QR на весь чек' };
      case 'deposit':
        return {
          blocked: false,
          caption: `есть ${formatMoney(ledger.depositCap)}`,
        };
      case 'bonus':
        return {
          blocked: false,
          caption: `до ${formatMoney(ledger.bonusCap)}`,
        };
      case 'debt':
        return {
          blocked: false,
          caption: Number.isFinite(ledger.debtCap) ? `до ${formatMoney(ledger.debtCap)}` : 'на клиента',
        };
      case 'certificate':
        return {
          blocked: false,
          caption: certificate ? `остаток ${formatMoney(certificate.remaining)}` : 'по коду',
        };
    }
  };

  const partCaption = (part: PaymentPart): string => {
    if (part.locked) return 'Подтверждено банком';
    switch (part.method) {
      case 'cash':
        return ledger.change > 0 ? `сдача ${money(ledger.change)}` : 'сколько дал гость';
      case 'deposit':
        return `с депозита, есть ${formatMoney(ledger.depositCap)}`;
      case 'bonus':
        return `бонусами, до ${formatMoney(ledger.bonusCap)}`;
      case 'debt':
        return Number.isFinite(ledger.debtCap) ? `в долг, лимит ${formatMoney(ledger.debtCap)}` : 'в долг клиенту';
      case 'certificate':
        return certificate ? `сертификат ${certificate.code}` : 'сертификат';
      case 'card':
        return 'перевод на карту клуба';
      case 'transfer':
        return 'СБП';
    }
  };

  const summary =
    totals.due <= 0
      ? {
          text: totals.staffComp ? 'Списание на персонал — без оплаты' : 'Чек на 0 ₽',
          color: colors.secondaryLabel,
        }
      : !parts.length
        ? {
            text: view === 'split' ? `Распределите ${money(totals.due)} по способам` : 'Выберите способ оплаты',
            color: colors.secondaryLabel,
          }
        : ledger.remaining > 0
          ? {
              text: `Осталось распределить ${money(ledger.remaining)}`,
              color: colors.orange,
            }
          : ledger.change > 0
            ? { text: `Сдача ${money(ledger.change)}`, color: colors.green }
            : { text: 'Сумма сходится', color: colors.green };

  const methodGrid = (
    <View style={styles.methodGrid}>
      {methodRows.map((row) => (
        <View key={row.join()} style={styles.methodRow}>
          {row.map((method) => {
            const look = METHODS[method];
            const { blocked, caption } = tileState(method);
            const selected = view === 'single' ? single?.method === method : parts.some((p) => p.method === method);
            return (
              <Pressable
                key={method}
                disabled={blocked || busy}
                onPress={() => (view === 'single' ? pickSingle(method) : addSplit(method))}
                style={[styles.flex, blocked && styles.methodBlocked]}
                accessibilityRole="button"
                accessibilityState={{ disabled: blocked, selected }}
                accessibilityLabel={`${look.title}, ${caption}`}
              >
                <View style={[styles.tileRing, selected && { borderColor: look.color }]}>
                  <GlassView isInteractive={!blocked} tintColor={selected ? `${look.color}33` : undefined} style={styles.methodTile}>
                    <View
                      style={[
                        styles.methodIcon,
                        {
                          backgroundColor: selected ? look.color : `${look.color}26`,
                        },
                      ]}
                    >
                      <SymbolView name={look.symbol} size={20} weight="semibold" tintColor={selected ? 'white' : look.color} />
                    </View>
                    <Text
                      style={[type.footnote, styles.methodTitle]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      maxFontSizeMultiplier={FONT_SCALE_MAX.compact}>
                      {look.title}
                    </Text>
                    <Text
                      style={[type.caption2, sheetStyles.secondary]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                      maxFontSizeMultiplier={FONT_SCALE_MAX.compact}>
                      {caption}
                    </Text>
                    {selected && view === 'single' && (
                      <View style={[styles.tileCheck, { backgroundColor: look.color }]}>
                        <SymbolView name="checkmark" size={10} weight="bold" tintColor="white" />
                      </View>
                    )}
                  </GlassView>
                </View>
              </Pressable>
            );
          })}
          {row.length < perRow && Array.from({ length: perRow - row.length }, (_, i) => <View key={i} style={styles.flex} />)}
        </View>
      ))}
    </View>
  );

  return (
    <>
      {toolbar}
      {/* react-native-screens растягивает список шторки на всю её высоту, если находит его первым
          потомком (по цепочке первых дочерних вью). Тогда список уходил под панель «Провести», и
          на «Увеличенном» виде и с крупным текстом наличные целиком оказывались под ней. Пустая
          несхлопываемая вью первой в цепочке — список не найден, его высоту задаёт раскладка. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex} collapsable={false}>
        <View collapsable={false} />
        <ScrollView
          style={styles.flex}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={KEYBOARD_DISMISS}
        >
          <View style={styles.hero}>
            <Text style={[type.subhead, sheetStyles.secondary]} numberOfLines={1}>
              {checkTitle(data)}
            </Text>
            <Text style={[styles.heroAmount, type.amount]} numberOfLines={1} adjustsFontSizeToFit>
              {money(totals.due)}
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

          {totals.due > 0 && !hasLocked && (
            <Host matchContents={{ vertical: true }} style={styles.segment}>
              <Picker selection={view} onSelectionChange={(value) => switchMode(value as Mode)} modifiers={[pickerStyle('segmented')]}>
                <SwiftText modifiers={[tag('single')]}>Одним способом</SwiftText>
                <SwiftText modifiers={[tag('split')]}>Разделить</SwiftText>
              </Picker>
            </Host>
          )}

          {totals.due > 0 && view === 'single' && (
            <View style={styles.section}>
              {methodGrid}
              {single?.method === 'cash' && (
                <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                  <CashGiven due={totals.due} given={single.amount} onChange={setCashGiven} />
                </Animated.View>
              )}
            </View>
          )}

          {totals.due > 0 && view === 'split' && (
            <>
              {hint && (
                <Animated.View entering={FadeIn}>
                  <GlassCard tint="rgba(255,149,0,0.18)" style={styles.notice}>
                    <SymbolView name="arrow.triangle.branch" size={18} tintColor={colors.orange} />
                    <Text style={[type.footnote, styles.noticeText]}>{hint}</Text>
                  </GlassCard>
                </Animated.View>
              )}

              <View style={styles.section}>
                <Text style={[type.footnote, styles.sectionTitle]}>ЧАСТИ ОПЛАТЫ</Text>
                {parts.length === 0 ? (
                  <GlassCard style={styles.emptyParts}>
                    <SymbolView name="square.split.2x1" size={22} tintColor={colors.secondaryLabel} />
                    <Text style={[type.footnote, sheetStyles.secondary, styles.emptyText]}>
                      Нажмите способ ниже — он встанет на остаток, сумму можно сразу поправить.
                    </Text>
                  </GlassCard>
                ) : (
                  <GlassCard>
                    {parts.map((part, index) => (
                      <Animated.View key={part.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} layout={LinearTransition}>
                        {index > 0 && <View style={[sheetStyles.separator, styles.partSeparator]} />}
                        <PartRow
                          part={part}
                          caption={partCaption(part)}
                          rest={part.locked ? 0 : ledger.remaining}
                          focusSeq={focus?.id === part.id ? focus.seq : 0}
                          disabled={busy}
                          onAmount={(amount) => changeAmount(part.id, amount)}
                          onRemove={() => removePart(part)}
                          onFillRest={() => fillRest(part)}
                        />
                      </Animated.View>
                    ))}
                  </GlassCard>
                )}
              </View>

              {!hasLocked && (
                <View style={styles.section}>
                  <Text style={[type.footnote, styles.sectionTitle]}>{parts.length ? 'ДОБАВИТЬ СПОСОБ' : 'СПОСОБ ОПЛАТЫ'}</Text>
                  {methodGrid}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Панель внизу — обычный блок под списком, а не поверх него: ничего не перекрывает и поднимается с клавиатурой. */}
        <View
          style={[
            styles.footer,
            {
              paddingBottom: keyboardOpen ? space.sm : insets.bottom + space.sm,
            },
          ]}
        >
          <GlassCard style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={[type.subhead, styles.summary, { color: summary.color }]} numberOfLines={2}>
                {summary.text}
              </Text>
              {keyboardOpen && (
                <Pressable
                  onPress={() => Keyboard.dismiss()}
                  hitSlop={8}
                  style={styles.doneKey}
                  accessibilityRole="button"
                  accessibilityLabel="Скрыть клавиатуру"
                >
                  <Text style={[type.subhead, styles.doneKeyText]}>Готово</Text>
                </Pressable>
              )}
            </View>
            {totals.due > 0 && (
              <View style={styles.progressTrack}>
                <Animated.View
                  layout={LinearTransition.springify().damping(20)}
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, (ledger.paid / totals.due) * 100)}%`,
                      backgroundColor: ledger.remaining > 0 ? colors.accent : colors.green,
                    },
                  ]}
                />
              </View>
            )}
          </GlassCard>
          <PrimaryButton
            title={busy ? 'Проводим…' : totals.due <= 0 ? 'Закрыть чек · 0 ₽' : `Провести ${money(totals.due)}`}
            busy={busy}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

/** Строка части оплаты: способ, подпись, сумма прямо в поле, «+ остаток» и удаление. */
function PartRow({
  part,
  caption,
  rest,
  focusSeq,
  disabled,
  onAmount,
  onRemove,
  onFillRest,
}: {
  part: PaymentPart;
  caption: string;
  rest: number;
  /** > 0 — поставить курсор в сумму (новое значение — новый запрос). */
  focusSeq: number;
  disabled: boolean;
  onAmount: (amount: number) => void;
  onRemove: () => void;
  onFillRest: () => void;
}) {
  const look = METHODS[part.method];
  const [text, setText] = useState(inputText(part.amount));
  const focused = useRef(false);
  const input = useRef<TextInputRef>(null);

  // Сумму поменяли снаружи (остаток, лимит, деление пополам) — показываем её, если поле не в работе.
  useEffect(() => {
    if (!focused.current) setText(inputText(part.amount));
  }, [part.amount]);

  useEffect(() => {
    if (!focusSeq) return;
    const t = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [focusSeq]);

  return (
    <View style={styles.partRow}>
      <View style={[styles.partIcon, { backgroundColor: look.color }]}>
        <SymbolView name={look.symbol} size={14} weight="semibold" tintColor="white" />
      </View>
      <View style={styles.flex}>
        <Text style={[type.body, sheetStyles.label]} numberOfLines={1}>
          {look.title}
        </Text>
        <Text style={[type.caption1, sheetStyles.secondary]} numberOfLines={1}>
          {caption}
        </Text>
        {rest > EPS && !disabled && (
          <Pressable onPress={onFillRest} hitSlop={6} style={styles.restPill} accessibilityRole="button" accessibilityLabel={`Добавить остаток ${money(rest)}`}>
            <Text style={[type.caption1, styles.restPillText]}>+ остаток {money(rest)}</Text>
          </Pressable>
        )}
      </View>
      {part.locked ? (
        <Text style={[type.body, type.amount, sheetStyles.label]}>{money(part.amount)}</Text>
      ) : (
        <Pressable onPress={() => input.current?.focus()} style={styles.amountBox} accessibilityLabel={`Сумма: ${look.title}`}>
          <TextInput
            ref={input}
            value={text}
            editable={!disabled}
            keyboardType="decimal-pad"
            selectTextOnFocus
            onFocus={() => {
              focused.current = true;
            }}
            onChangeText={(next) => {
              setText(next);
              const amount = parseAmount(next);
              // Пустое поле и ноль — ещё набирают; часть уберём при выходе из поля.
              if (amount !== null && amount >= EPS) onAmount(amount);
            }}
            onBlur={() => {
              focused.current = false;
              const amount = parseAmount(text);
              if (amount === null || amount < EPS) onRemove();
              else setText(inputText(part.amount));
            }}
            style={[type.body, type.amount, styles.amountInput]}
            accessibilityLabel={`Сумма, ${look.title}`}
          />
          <Text style={[type.body, sheetStyles.secondary]}>₽</Text>
        </Pressable>
      )}
      {!part.locked && (
        <Pressable hitSlop={10} disabled={disabled} onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Убрать ${look.title}`}>
          <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.tertiaryLabel} />
        </Pressable>
      )}
    </View>
  );
}

/** Наличные одним способом: сколько дал гость (быстрые купюры или своя сумма) и сдача. */
function CashGiven({ due, given, onChange }: { due: number; given: number; onChange: (amount: number) => void }) {
  const [text, setText] = useState(inputText(given));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(inputText(given));
  }, [given]);
  const change = round2(Math.max(0, given - due));
  const presets = cashPresets(due);

  return (
    <GlassCard style={styles.cashCard}>
      <View style={styles.cashHead}>
        <Text style={[type.subhead, sheetStyles.label, styles.cashLabel]}>Получено от гостя</Text>
        <View style={styles.amountBox}>
          <TextInput
            value={text}
            keyboardType="decimal-pad"
            selectTextOnFocus
            onFocus={() => {
              focused.current = true;
            }}
            onChangeText={(next) => {
              setText(next);
              const amount = parseAmount(next);
              if (amount !== null && amount >= due) onChange(amount);
            }}
            onBlur={() => {
              focused.current = false;
              const amount = parseAmount(text);
              onChange(amount !== null && amount >= due ? amount : due);
              setText(inputText(amount !== null && amount >= due ? amount : due));
            }}
            style={[type.title3, type.amount, styles.amountInput]}
            accessibilityLabel="Сколько наличных дал гость"
          />
          <Text style={[type.title3, sheetStyles.secondary]}>₽</Text>
        </View>
      </View>
      <View style={styles.presets}>
        <Preset label="Без сдачи" active={Math.abs(given - due) < EPS} onPress={() => onChange(due)} />
        {presets.map((v) => (
          <Preset key={v} label={formatMoney(v)} active={Math.abs(given - v) < EPS} onPress={() => onChange(v)} />
        ))}
      </View>
      <View style={styles.changeRow}>
        <Text style={[type.subhead, sheetStyles.secondary]}>Сдача</Text>
        <Text style={[type.title3, type.amount, { color: change > 0 ? colors.green : colors.secondaryLabel }]}>{money(change)}</Text>
      </View>
    </GlassCard>
  );
}

function Preset({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        Keyboard.dismiss();
        onPress();
      }}
      style={({ pressed }) => [styles.preset, active && styles.presetActive, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[type.footnote, styles.presetText, active && styles.presetTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xxl,
  },
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

  payer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
  },
  noticeText: { flex: 1, color: colors.label },
  segment: { alignSelf: 'stretch' },

  section: { gap: space.sm },
  sectionTitle: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  methodGrid: { gap: 10 },
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
  // Рамка выбранного способа — снаружи стекла: на самом UIGlassEffect граница не рисуется.
  tileRing: {
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 0,
  },
  methodBlocked: { opacity: 0.45 },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  methodTitle: { color: colors.label, fontWeight: '600' },
  tileCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyParts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  emptyText: { flex: 1 },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    minHeight: 62,
  },
  partIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partSeparator: { marginLeft: 58 },
  restPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
  restPillText: { color: colors.accent, fontWeight: '600' },
  // Подпись и поле делят строку; не влезают вместе (узкий экран, крупный текст) — поле уходит
  // на свою строку во всю ширину. Раньше поле по содержимому занимало почти всю строку,
  // и «Получено от гостя» сжималась до нуля даже на обычном iPhone.
  amountBox: {
    flexGrow: 1,
    flexBasis: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.fill,
  },
  amountInput: {
    flex: 1,
    minWidth: 56,
    padding: 0,
    textAlign: 'right',
    color: colors.label,
  },

  cashCard: { padding: space.md, gap: space.md },
  cashHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  cashLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 120, fontWeight: '600' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preset: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
  presetActive: { backgroundColor: colors.accent },
  presetText: {
    color: colors.label,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  presetTextActive: { color: 'white' },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  summaryCard: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  summary: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  doneKey: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.fill,
  },
  doneKeyText: { color: colors.accent, fontWeight: '600' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fill,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
});
