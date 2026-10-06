import { DatePicker, Host, Picker, Text as SwiftText, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { AddressField } from '@/components/address-field';
import { GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { FormField, FormSection } from '@/components/form-parts';
import {
  packagePrice,
  createEvent,
  defaultEventStart,
  eventErrorMessage,
  fromDateTime,
  toDateString,
  toTimeString,
  updateEvent,
  useCustomers,
  useEvent,
  useEventRates,
  useStaffList,
  type EventBillingMode,
  type EventInput,
  type EventRow,
  type EventType,
} from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { pushEventToCalendar } from '@/lib/calendar-sync';
import { useDevicePrefs } from '@/lib/device-prefs';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { cleanPhone, pickContact } from '@/lib/phone-book';
import { useSpaces } from '@/lib/pos-api';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type, useAccentHex } from '@/lib/theme';

/**
 * Создание и правка мероприятия — «Titan клуб» или выезд, как форма веб-кассы.
 * Шторка из стекла: группы полей — стеклянные карточки, дата и время — системные пикеры.
 */
export default function EventEditSheet() {
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

  return <EventForm initial={event.data} onDone={() => router.back()} />;
}

function EventForm({ initial, onDone }: { initial: EventRow | undefined; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const spaces = useSpaces();
  const staff = useStaffList();
  const rates = useEventRates();

  const [kind, setKind] = useState<EventType>(initial?.type ?? 'titan');
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? '');
  const [pickedCustomer, setPickedCustomer] = useState(false);
  const [address, setAddress] = useState(initial?.type === 'exit' ? (initial.location ?? '') : '');
  const [spaceId, setSpaceId] = useState<string | null>(initial?.spaceId ?? null);
  const [responsibleId, setResponsibleId] = useState<string | null>(initial?.responsibleStaffId ?? null);
  const [start, setStart] = useState<Date>(initial ? fromDateTime(initial.date, initial.startTime) : defaultEventStart());
  const [hasEnd, setHasEnd] = useState(!!initial?.endTime);
  const [end, setEnd] = useState<Date>(
    initial?.endTime ? fromDateTime(initial.date, initial.endTime) : new Date(start.getTime() + 2 * 3_600_000),
  );
  const [billing, setBilling] = useState<EventBillingMode>(initial?.billingMode ?? 'amount');
  const [amountText, setAmountText] = useState(initial?.fixedAmount ? String(toNumber(initial.fixedAmount)) : '');
  const [hours, setHours] = useState<number>(initial?.plannedHours ?? 2);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [busy, setBusy] = useState(false);

  const customers = useCustomers(pickedCustomer ? '' : customerName);
  const suggestions = (customers.data ?? []).filter((c) => c.name && c.name.toLowerCase() !== customerName.trim().toLowerCase()).slice(0, 4);
  const rateList = rates.data?.length ? rates.data : [1, 2, 3, 4, 5, 6].map((h) => ({ hours: h, price: '0' }));
  const hourlyBase = packagePrice(hours, rates.data);
  // «По ставке зоны» — только для мероприятия в клубе: у выезда зоны нет.
  const billingModes: EventBillingMode[] = kind === 'titan' ? ['amount', 'hourly', 'rental'] : ['amount', 'hourly'];
  const mode: EventBillingMode = billing === 'rental' && kind !== 'titan' ? 'amount' : billing;
  const rentalSpace = (spaces.data ?? []).find((s) => s.id === spaceId) ?? null;
  const staffAvailable = (staff.data ?? []).length > 0;

  /** Имя и телефон заказчика из адресной книги — системный выбор, без доступа ко всей книге. */
  const fromContacts = () => {
    haptic.light();
    void pickContact().then((contact) => {
      if (!contact) return;
      if (contact.name) {
        setCustomerName(contact.name);
        setPickedCustomer(false);
      }
      if (contact.phone) setCustomerPhone(cleanPhone(contact.phone));
      haptic.success();
    });
  };

  const save = async () => {
    const name = customerName.trim();
    const place = address.trim();
    if (kind === 'exit' && staffAvailable && !responsibleId) return Alert.alert('Для выезда укажите ответственного');
    if (kind === 'titan' && !name) return Alert.alert('Укажите имя заказчика');
    if (kind === 'exit' && !place) return Alert.alert('Укажите адрес выезда');
    if (mode === 'rental' && !spaceId) return Alert.alert('Выберите зону', 'Чек посчитает аренду по ставке выбранной зоны.');

    const input: EventInput = {
      type: kind,
      title: kind === 'titan' ? name : place,
      location: kind === 'exit' ? place : null,
      spaceId: kind === 'titan' ? spaceId : null,
      date: toDateString(start),
      startTime: toTimeString(start),
      endTime: hasEnd ? toTimeString(end) : null,
      paymentType: 'fixed',
      billingMode: mode,
      fixedAmount: mode === 'amount' ? (parseAmount(amountText) ?? 0) : null,
      plannedHours: mode === 'hourly' ? hours : null,
      comment: comment.trim() || null,
      responsibleStaffId: responsibleId,
      customerName: name || null,
      customerPhone: customerPhone.trim() || null,
    };

    haptic.medium();
    setBusy(true);
    try {
      const saved = initial ? await updateEvent(initial.id, input) : await createEvent(input);
      // Календарь телефона обновляем сразу — не дожидаясь общей синхронизации.
      if (useDevicePrefs.getState().calendarSync) void pushEventToCalendar(saved);
      haptic.success();
      onDone();
    } catch (error) {
      haptic.error();
      Alert.alert('Мероприятие не сохранено', eventErrorMessage(error instanceof Error ? error.message : String(error)));
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
        <SheetHeader title={initial ? 'Мероприятие' : 'Новое мероприятие'} onClose={onDone} />

        <Host matchContents={{ vertical: true }} style={styles.stretch}>
          <Picker
            selection={kind}
            onSelectionChange={(value) => {
              haptic.selection();
              setKind(value as EventType);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('titan')]}>Titan клуб</SwiftText>
            <SwiftText modifiers={[tag('exit')]}>Выезд</SwiftText>
          </Picker>
        </Host>

        <FormSection title="ЗАКАЗЧИК" footer="Можно взять имя и телефон из контактов телефона.">
          <GlassCard style={styles.card}>
            <FormField
              icon="person"
              value={customerName}
              onChange={(text) => {
                setCustomerName(text);
                setPickedCustomer(false);
              }}
              placeholder="Имя заказчика"
              autoCapitalize="words"
            />
            <View style={sheetStyles.separator} />
            <FormField icon="phone" value={customerPhone} onChange={setCustomerPhone} placeholder="Телефон" keyboardType="phone-pad" />
            <View style={sheetStyles.separator} />
            <Pressable onPress={fromContacts} style={({ pressed }) => [styles.contactRow, pressed && sheetStyles.pressedRow]} accessibilityRole="button">
              <SymbolView name="person.crop.circle.badge.plus" size={18} tintColor={colors.accent} />
              <Text style={[type.body, styles.contactText]}>Взять из контактов</Text>
            </Pressable>
          </GlassCard>
          {suggestions.length > 0 && (
            <GlassCard style={styles.card}>
              {suggestions.map((c, index) => (
                <View key={c.id}>
                  {index > 0 && <View style={sheetStyles.separator} />}
                  <Pressable
                    style={({ pressed }) => [styles.suggestion, pressed && sheetStyles.pressedRow]}
                    onPress={() => {
                      haptic.selection();
                      setCustomerName(c.name ?? '');
                      if (c.phone) setCustomerPhone(c.phone);
                      setPickedCustomer(true);
                    }}
                    accessibilityRole="button">
                    <SymbolView name="person.crop.circle" size={18} tintColor={colors.accent} />
                    <Text style={[type.body, sheetStyles.label, styles.flex]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {c.phone && <Text style={[type.footnote, sheetStyles.secondary]}>{c.phone}</Text>}
                  </Pressable>
                </View>
              ))}
            </GlassCard>
          )}
        </FormSection>

        {kind === 'exit' ? (
          <FormSection title="АДРЕС ВЫЕЗДА">
            <GlassCard style={styles.card}>
              <AddressField value={address} onChange={setAddress} placeholder="Город, улица, дом" />
            </GlassCard>
          </FormSection>
        ) : (
          (spaces.data ?? []).length > 0 && (
            <FormSection title="ЗОНА">
              <View style={styles.chips}>
                {(spaces.data ?? []).map((s) => (
                  <GlassChip
                    key={s.id}
                    label={s.name}
                    active={spaceId === s.id}
                    onPress={() => {
                      haptic.selection();
                      setSpaceId(spaceId === s.id ? null : s.id);
                    }}
                  />
                ))}
              </View>
            </FormSection>
          )
        )}

        {staffAvailable && (
          <FormSection title={kind === 'exit' ? 'ОТВЕТСТВЕННЫЙ · ОБЯЗАТЕЛЬНО' : 'ОТВЕТСТВЕННЫЙ'}>
            <View style={styles.chips}>
              {(staff.data ?? []).map((m) => (
                <GlassChip
                  key={m.id}
                  label={m.nickname}
                  icon="person.fill"
                  active={responsibleId === m.id}
                  onPress={() => {
                    haptic.selection();
                    setResponsibleId(responsibleId === m.id ? null : m.id);
                  }}
                />
              ))}
            </View>
          </FormSection>
        )}

        <FormSection title="ДАТА И ВРЕМЯ">
          <GlassCard style={styles.card}>
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <DatePicker title="Начало" selection={start} displayedComponents={['date', 'hourAndMinute']} onDateChange={setStart} />
            </Host>
            <View style={sheetStyles.separator} />
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <Toggle
                label="Время окончания"
                isOn={hasEnd}
                onIsOnChange={(on) => {
                  haptic.selection();
                  setHasEnd(on);
                }}
                modifiers={[tint(accent)]}
              />
            </Host>
            {hasEnd && (
              <>
                <View style={sheetStyles.separator} />
                <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
                  <DatePicker title="Конец" selection={end} displayedComponents={['hourAndMinute']} onDateChange={setEnd} />
                </Host>
              </>
            )}
          </GlassCard>
        </FormSection>

        <FormSection title="ОПЛАТА">
          <Host matchContents={{ vertical: true }} style={styles.stretch}>
            <Picker
              selection={mode}
              onSelectionChange={(value) => {
                haptic.selection();
                setBilling(value as EventBillingMode);
              }}
              modifiers={[pickerStyle('segmented')]}>
              {billingModes.map((mode) => (
                <SwiftText key={mode} modifiers={[tag(mode)]}>
                  {mode === 'hourly' ? 'Пакет' : mode === 'rental' ? 'По ставке' : 'Фикс'}
                </SwiftText>
              ))}
            </Picker>
          </Host>
          {mode === 'rental' ? (
            <Text style={[type.footnote, styles.hint]}>
              {rentalSpace
                ? `При старте откроется чек аренды «${rentalSpace.name}»: ${formatMoney(toNumber(rentalSpace.hourlyRate))}/ч по факту — начатый час считается целым.`
                : 'Выберите зону выше — чек посчитает её аренду по ставке зоны, по факту.'}
            </Text>
          ) : mode === 'amount' ? (
            <GlassCard style={styles.card}>
              <FormField icon="rublesign" value={amountText} onChange={setAmountText} placeholder="Сумма, ₽" keyboardType="decimal-pad" />
            </GlassCard>
          ) : (
            <>
              <View style={styles.chips}>
                {rateList.map((r) => (
                  <GlassChip
                    key={r.hours}
                    label={`${r.hours} ч · ${formatMoney(r.price)}`}
                    active={hours === r.hours}
                    onPress={() => {
                      haptic.selection();
                      setHours(r.hours);
                    }}
                  />
                ))}
              </View>
              <Text style={[type.footnote, styles.hint]}>{`Основа чека: ${formatMoney(hourlyBase)}`}</Text>
            </>
          )}
        </FormSection>

        <FormSection title="КОММЕНТАРИЙ">
          <GlassCard style={styles.card}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Пожелания, детали брони"
              placeholderTextColor={colors.tertiaryLabel}
              selectionColor={colors.accent}
              style={[type.body, styles.multiline]}
              multiline
            />
          </GlassCard>
        </FormSection>

        <PrimaryButton title={busy ? 'Сохраняем…' : initial ? 'Сохранить' : 'Создать мероприятие'} icon="checkmark" busy={busy} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  contactText: { color: colors.accent, fontWeight: '600' },
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  stretch: { alignSelf: 'stretch' },
  card: { paddingHorizontal: space.lg },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  hint: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  multiline: { color: colors.label, minHeight: 88, paddingVertical: space.md, textAlignVertical: 'top' },
});
