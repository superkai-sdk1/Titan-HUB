import { DatePicker, Host, Toggle } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Text } from '@/components/text';
import { FormField, FormSection } from '@/components/form-parts';
import { GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import {
  createMinicap,
  defaultEventStart,
  eventErrorMessage,
  fromDateTime,
  toDateString,
  toTimeString,
  updateMinicap,
  useEvent,
  type EventRow,
  type MinicapInput,
} from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const layout = LinearTransition.springify().damping(24).stiffness(220);

/**
 * Миникап — турнир в клубе: название, начало, взнос и расходы турнира, как MinicapSheet
 * веб-кассы. Состав (игроки и судья) собирается уже в карточке миникапа.
 */
export default function MinicapSheet() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const router = useRouter();
  const event = useEvent(eventId);

  if (eventId && !event.data) {
    return (
      <View style={styles.loading}>
        {event.isError ? <Text style={[type.body, sheetStyles.secondary]}>{eventErrorMessage(event.error.message)}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <MinicapForm
      initial={event.data}
      onClose={() => router.back()}
      onCreated={(created) => {
        router.back();
        // Шторка уезжает — следом открывается карточка, где набирают состав.
        setTimeout(() => router.push({ pathname: '/events/[eventId]', params: { eventId: created.id } }), 420);
      }}
    />
  );
}

type Cost = { on: boolean; text: string };

const costFrom = (value: string | null | undefined): Cost => {
  const amount = toNumber(value);
  return { on: amount > 0, text: amount > 0 ? String(amount) : '' };
};

function MinicapForm({ initial, onClose, onCreated }: { initial: EventRow | undefined; onClose: () => void; onCreated: (event: EventRow) => void }) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [start, setStart] = useState<Date>(initial ? fromDateTime(initial.date, initial.startTime) : defaultEventStart());
  const [fee, setFee] = useState(toNumber(initial?.participationFee) > 0 ? String(toNumber(initial?.participationFee)) : '');
  const [prize, setPrize] = useState<Cost>(costFrom(initial?.prizeFund));
  const [lunch, setLunch] = useState<Cost>(costFrom(initial?.lunchCost));
  const [other, setOther] = useState<Cost>(costFrom(initial?.otherCost));
  const [busy, setBusy] = useState(false);

  const costOf = (cost: Cost) => (cost.on ? (parseAmount(cost.text) ?? 0) : 0);
  const costsTotal = costOf(prize) + costOf(lunch) + costOf(other);

  const save = async () => {
    const name = title.trim();
    if (!name) return Alert.alert('Укажите название миникапа');
    const feeAmount = fee.trim() ? parseAmount(fee) : 0;
    if (feeAmount === null) return Alert.alert('Проверьте стоимость участия');
    for (const [cost, label] of [
      [prize, 'призового фонда'],
      [lunch, 'обеда'],
      [other, 'иных расходов'],
    ] as const) {
      if (cost.on && cost.text.trim() && parseAmount(cost.text) === null) return Alert.alert(`Проверьте сумму ${label}`);
    }

    // Выключенный расход уходит нулём — сервер удаляет его строку из расходов клуба.
    const input: MinicapInput = {
      title: name,
      date: toDateString(start),
      startTime: toTimeString(start),
      participationFee: feeAmount,
      prizeFund: costOf(prize),
      lunchCost: costOf(lunch),
      otherCost: costOf(other),
    };

    haptic.medium();
    setBusy(true);
    try {
      if (initial) {
        await updateMinicap(initial.id, input);
        haptic.success();
        onClose();
      } else {
        const created = await createMinicap(input);
        haptic.success();
        onCreated(created);
      }
    } catch (error) {
      haptic.error();
      Alert.alert('Миникап не сохранён', eventErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS}
        showsVerticalScrollIndicator={false}>
        <SheetHeader title={initial ? 'Миникап' : 'Новый миникап'} onClose={onClose} />

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <SymbolView name="trophy.fill" size={28} tintColor="#A855F7" />
          </View>
          <Text style={[type.subhead, sheetStyles.secondary, styles.centered]}>Турнир в клубе: до 10 игроков и судья, у каждого свой счёт в кассе</Text>
        </View>

        <FormSection title="НАЗВАНИЕ">
          <GlassCard style={styles.card}>
            <FormField icon="trophy" value={title} onChange={setTitle} placeholder="Например, Кубок сентября" autoCapitalize="sentences" autoFocus={!initial} />
          </GlassCard>
        </FormSection>

        <FormSection title="КОГДА И ГДЕ">
          <GlassCard style={styles.card}>
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <DatePicker title="Начало" selection={start} displayedComponents={['date', 'hourAndMinute']} onDateChange={setStart} />
            </Host>
            <View style={sheetStyles.separator} />
            <View style={styles.staticRow}>
              <SymbolView name="mappin.and.ellipse" size={16} weight="medium" tintColor={colors.secondaryLabel} />
              <Text style={[type.body, sheetStyles.label, styles.flex]}>Локация</Text>
              <Text style={[type.body, sheetStyles.secondary]}>TITAN</Text>
            </View>
          </GlassCard>
        </FormSection>

        <FormSection title="ВЗНОС" footer="Ложится в счёт каждого игрока при старте. Судья играет без взноса.">
          <GlassCard style={styles.card}>
            <FormField icon="rublesign" value={fee} onChange={setFee} placeholder="Стоимость участия" keyboardType="decimal-pad" suffix="₽" />
          </GlassCard>
        </FormSection>

        <FormSection
          title="РАСХОДЫ ТУРНИРА"
          footer={costsTotal > 0 ? `Итого ${formatMoney(costsTotal)} — попадут в расходы клуба датой миникапа.` : 'Попадут в расходы клуба датой миникапа.'}>
          <GlassCard style={styles.card}>
            <CostRow icon="gift" label="Призовой фонд" cost={prize} onChange={setPrize} accent={accent} />
            <View style={sheetStyles.separator} />
            <CostRow icon="fork.knife" label="Обед" cost={lunch} onChange={setLunch} accent={accent} />
            <View style={sheetStyles.separator} />
            <CostRow icon="ellipsis.circle" label="Иные расходы" cost={other} onChange={setOther} accent={accent} />
          </GlassCard>
        </FormSection>

        {!initial && <Text style={[type.footnote, styles.hint]}>Игроков и судью добавите в карточке миникапа — сразу после создания.</Text>}

        <PrimaryButton title={busy ? 'Сохраняем…' : initial ? 'Сохранить' : 'Создать миникап'} icon="checkmark" busy={busy} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CostRow({ icon, label, cost, onChange, accent }: { icon: SFSymbol; label: string; cost: Cost; onChange: (cost: Cost) => void; accent: string }) {
  return (
    <Animated.View layout={layout}>
      <View style={styles.costTop}>
        <SymbolView name={icon} size={16} weight="medium" tintColor={colors.secondaryLabel} />
        <Host matchContents={{ vertical: true }} style={styles.flex} seedColor={accent}>
          <Toggle
            label={label}
            isOn={cost.on}
            onIsOnChange={(on) => {
              haptic.selection();
              onChange({ ...cost, on });
            }}
            modifiers={[tint(accent)]}
          />
        </Host>
      </View>
      {cost.on && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.costAmount}>
          <FormField icon="rublesign" value={cost.text} onChange={(text) => onChange({ ...cost, text })} placeholder={`Сумма, ${label.toLowerCase()}`} keyboardType="decimal-pad" suffix="₽" autoFocus={!cost.text} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  centered: { textAlign: 'center' },
  hero: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  card: { paddingHorizontal: space.lg },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  staticRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  costTop: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  costAmount: { paddingLeft: 28 },
  hint: { color: colors.secondaryLabel, textAlign: 'center', paddingHorizontal: space.lg },
});
