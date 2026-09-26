// Android-двойники компонентов @expo/ui/swift-ui.
//
// На Android нативных вью SwiftUI нет: `requireNativeView('ExpoUI', 'PickerView')`
// и остальные падают. Здесь те же 23 компонента собраны на React Native — так, чтобы
// 43 экрана, написанных под SwiftUI, работали без правок. Выбор даты и времени отдан
// нативным диалогам Material из @expo/ui/jetpack-compose, остальное — RN-примитивы,
// стилизованные под сгруппированные списки iOS, чтобы вёрстка экранов не разъехалась.
import { Children, createContext, isValidElement, useContext, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch,
  Text as RNText, TextInput, View,
  type ColorValue, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';

import { colors, radius, space } from '@/lib/theme';

import { SymbolView } from '../symbols';
import { resolve, type ViewModifier } from './modifiers';

type Mods = { modifiers?: ViewModifier[] };
type WithChildren = { children?: ReactNode };

const TintContext = createContext<ColorValue>(colors.accent);

/**
 * Пункт меню сперва выполняет своё действие, потом закрывает меню. Раньше меню
 * закрывалось по касанию (onTouchStart) — модалка исчезала раньше, чем кнопка получала
 * нажатие, и пункт «Мероприятие / Миникап» не срабатывал вовсе.
 */
const MenuCloseContext = createContext<(() => void) | null>(null);

/** Оттенок берётся из seedColor ближайшего Host, если компонент не задал свой. */
function useTint(own?: ColorValue): ColorValue {
  const inherited = useContext(TintContext);
  return own ?? inherited;
}

// ——— контейнеры ———

export type HostProps = Mods & WithChildren & {
  style?: StyleProp<ViewStyle>;
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  useViewportSizeMeasurement?: boolean;
  seedColor?: ColorValue;
  colorScheme?: 'light' | 'dark';
  layoutDirection?: 'leftToRight' | 'rightToLeft';
  ignoreSafeArea?: 'all' | 'container' | 'keyboard';
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  onLayoutContent?: (event: { nativeEvent: { width: number; height: number } }) => void;
};

/** В SwiftUI Host — мост в UIHostingController; на Android достаточно обычной вьюхи. */
export function Host({ style, children, seedColor, pointerEvents, modifiers }: HostProps) {
  const m = resolve(modifiers);
  const content = <View style={[style, m.style]} pointerEvents={pointerEvents}>{children}</View>;
  return seedColor ? <TintContext.Provider value={seedColor}>{content}</TintContext.Provider> : content;
}

export function VStack({ children, spacing, alignment, modifiers, style }: Mods & WithChildren & { spacing?: number; alignment?: string; style?: StyleProp<ViewStyle> }) {
  const align = alignment === 'leading' ? 'flex-start' : alignment === 'trailing' ? 'flex-end' : 'center';
  // flexShrink: в строке (HStack) столбец текста должен переноситься, а не вылезать за карточку.
  return <View style={[{ gap: spacing, alignItems: align, flexShrink: 1 }, resolve(modifiers).style, style]}>{children}</View>;
}

export function HStack({ children, spacing, alignment, modifiers, style }: Mods & WithChildren & { spacing?: number; alignment?: string; style?: StyleProp<ViewStyle> }) {
  const align = alignment === 'top' ? 'flex-start' : alignment === 'bottom' ? 'flex-end' : 'center';
  return <View style={[{ flexDirection: 'row', gap: spacing, alignItems: align }, resolve(modifiers).style, style]}>{children}</View>;
}

export function Spacer({ modifiers }: Mods) {
  return <View style={[styles.spacer, resolve(modifiers).style]} />;
}

// ——— текст и иконки ———

export function Text({ children, modifiers, style }: Mods & WithChildren & { style?: StyleProp<TextStyle> }) {
  const m = resolve(modifiers);
  return <RNText style={[styles.text, m.text, style]}>{children}</RNText>;
}

/** SwiftUI Image(systemName:) — SF Symbol; на Android его рисует наш SymbolView. */
export function Image({ systemName, size = 17, color, modifiers, onPress }: Mods & { systemName?: string; size?: number; color?: ColorValue; onPress?: () => void }) {
  const m = resolve(modifiers);
  const inner = <SymbolView name={systemName ?? ''} size={size} tintColor={color ?? m.text.color ?? colors.label} />;
  // frame + background из модификаторов образуют «плашку» вокруг иконки — как в SwiftUI.
  const framed = Object.keys(m.style).length > 0 ? <View style={[styles.center, m.style]}>{inner}</View> : inner;
  // В SwiftUI Image принимает onPress — например, иконка уведомления открывает чек.
  if (!onPress) return framed;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {framed}
    </Pressable>
  );
}

export function Label({ title, systemImage, modifiers }: Mods & { title?: string; systemImage?: string }) {
  const m = resolve(modifiers);
  return (
    <View style={[styles.row, m.style]}>
      {systemImage ? <SymbolView name={systemImage} size={17} tintColor={m.text.color ?? colors.accent} /> : null}
      <RNText style={[styles.text, m.text]}>{title}</RNText>
    </View>
  );
}

// ——— управление ———

export function Button({ label, systemImage, onPress, modifiers, children, role }: Mods & WithChildren & { label?: string; systemImage?: string; onPress?: () => void; role?: string }) {
  const m = resolve(modifiers);
  const tint = useTint(m.tint);
  const closeMenu = useContext(MenuCloseContext);
  const destructive = role === 'destructive';
  const color = destructive ? colors.red : (m.text.color ?? tint);
  const large = m.controlSize === 'large' || m.controlSize === 'extraLarge';
  // «Стеклянные» стили iOS 26 на Android — их ближайшие Material-аналоги: залитая и тональная кнопки.
  const filled = m.buttonStyle === 'borderedProminent' || m.buttonStyle === 'glassProminent';
  const tonal = m.buttonStyle === 'bordered' || m.buttonStyle === 'glass';
  return (
    <Pressable
      onPress={() => {
        closeMenu?.();
        onPress?.();
      }}
      disabled={m.disabled}
      style={({ pressed }) => [
        styles.button,
        closeMenu && styles.menuItem,
        large && styles.buttonLarge,
        (filled || tonal) && styles.buttonPill,
        tonal && { backgroundColor: colors.fill },
        filled && { backgroundColor: tint as string },
        m.style,
        (pressed || m.disabled) && styles.pressed,
      ]}>
      {systemImage ? <SymbolView name={systemImage} size={large ? 19 : 17} tintColor={filled ? '#FFFFFF' : color} /> : null}
      {label ? <RNText style={[styles.text, { color: filled ? '#FFFFFF' : color }, large && styles.textLarge, m.text]}>{label}</RNText> : null}
      {children}
    </Pressable>
  );
}

export function Toggle({ label, isOn, onIsOnChange, modifiers, children }: Mods & WithChildren & { label?: string; isOn?: boolean; onIsOnChange?: (on: boolean) => void }) {
  const m = resolve(modifiers);
  const tint = useTint(m.tint) as string;
  return (
    <View style={[styles.listRow, m.style]}>
      <View style={styles.rowLabel}>
        {label ? <RNText style={[styles.text, m.text]}>{label}</RNText> : children}
      </View>
      <Switch value={!!isOn} onValueChange={onIsOnChange} disabled={m.disabled} trackColor={{ true: tint, false: colors.fill }} thumbColor="#FFFFFF" />
    </View>
  );
}

/** Собирает варианты выбора из детей: `<Text modifiers={[tag(value)]}>Подпись</Text>`. */
function readOptions(children: ReactNode): { value: unknown; label: ReactNode }[] {
  return Children.toArray(children)
    .filter((child): child is ReactElement<Mods & WithChildren> => isValidElement(child))
    .map((child) => ({ value: resolve(child.props.modifiers).tag, label: child.props.children }));
}

export function Picker({ selection, onSelectionChange, options, modifiers, children, label }: Mods & WithChildren & {
  selection?: unknown;
  onSelectionChange?: (value: never) => void;
  options?: string[];
  label?: string;
}) {
  const m = resolve(modifiers);
  const tint = useTint(m.tint) as string;
  const items = options
    ? options.map((option, index) => ({ value: index, label: option }))
    : readOptions(children);
  const change = onSelectionChange as ((value: unknown) => void) | undefined;

  // Меню и колесо на телефоне одинаково неуместны — показываем выбор списком в модалке.
  const [open, setOpen] = useState(false);
  if (m.pickerStyle === 'menu' || m.pickerStyle === 'wheel') {
    const current = items.find((item) => item.value === selection);
    return (
      <>
        <Pressable style={[styles.listRow, m.style]} onPress={() => setOpen(true)} disabled={m.disabled}>
          {label ? <RNText style={[styles.text, styles.rowLabel]}>{label}</RNText> : null}
          <RNText style={[styles.text, { color: tint }]}>{current?.label ?? '—'}</RNText>
          <SymbolView name="chevron.up.chevron.down" size={13} tintColor={colors.tertiaryLabel} />
        </Pressable>
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          {items.map((item, index) => (
            <Pressable
              key={index}
              style={styles.listRow}
              onPress={() => { change?.(item.value); setOpen(false); }}>
              <RNText style={[styles.text, styles.rowLabel]}>{item.label}</RNText>
              {item.value === selection ? <SymbolView name="checkmark" size={16} tintColor={tint} /> : null}
            </Pressable>
          ))}
        </Sheet>
      </>
    );
  }

  // segmented — как UISegmentedControl: подсвеченная «таблетка» внутри дорожки.
  return (
    <View style={[styles.segments, m.style]}>
      {items.map((item, index) => {
        const active = item.value === selection;
        return (
          <Pressable
            key={index}
            disabled={m.disabled}
            onPress={() => change?.(item.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <RNText numberOfLines={1} style={[styles.segmentText, active && { color: tint, fontWeight: '600' }]}>{item.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Дни месяца, выровненные по неделям с понедельника; null — пустые клетки. */
function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type DateRange = { start?: Date; end?: Date };

/** Высота строки в колонках часов и минут — по ней прокручиваем к выбранному значению. */
const TIME_CELL = 44;

/**
 * Выбор даты и/или времени. Нативный Compose-диалог требует особой границы композиции и
 * внутри обычного дерева RN падает с MissingHostException, поэтому выбор свой.
 *
 * Раньше при `['date', 'hourAndMinute']` показывался только календарь: время начала
 * мероприятия и аренды зоны на Android поменять было нельзя. Теперь календарь и время
 * в одной шторке, а `range` ограничивает выбор, как в SwiftUI.
 */
export function DatePicker({ title, selection, displayedComponents = 'date', onDateChange, modifiers, range }: Mods & {
  title?: string;
  selection?: Date | null;
  displayedComponents?: 'date' | 'hourAndMinute' | 'dateAndTime' | ('date' | 'hourAndMinute' | 'dateAndTime')[];
  onDateChange?: (date: Date) => void;
  range?: DateRange;
}) {
  const m = resolve(modifiers);
  const tint = useTint(m.tint) as string;
  const [open, setOpen] = useState(false);
  const kinds = Array.isArray(displayedComponents) ? displayedComponents : [displayedComponents];
  const withDate = kinds.includes('date') || kinds.includes('dateAndTime');
  const withTime = kinds.includes('hourAndMinute') || kinds.includes('dateAndTime');
  const value = selection ?? new Date();
  const [shownMonth, setShownMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const time = value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const shown = !withDate
    ? time
    : withTime
      ? `${value.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${time}`
      : value.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const clamp = (date: Date) => {
    if (range?.start && date < range.start) return new Date(range.start);
    if (range?.end && date > range.end) return new Date(range.end);
    return date;
  };
  const dayDisabled = (day: number) => {
    const from = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day);
    const to = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day, 23, 59, 59, 999);
    return (!!range?.start && to < range.start) || (!!range?.end && from > range.end);
  };

  const pickDay = (day: number) => {
    const next = new Date(value);
    next.setFullYear(shownMonth.getFullYear(), shownMonth.getMonth(), day);
    onDateChange?.(clamp(next));
    if (!withTime) setOpen(false);
  };
  const pickTime = (hours: number, minutes: number) => {
    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);
    onDateChange?.(clamp(next));
  };

  // Минуты — шагом 5, плюс текущее значение, если оно между шагами (например, 18:37).
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  if (!minutes.includes(value.getMinutes())) {
    minutes.push(value.getMinutes());
    minutes.sort((a, b) => a - b);
  }

  return (
    <View style={[styles.listRow, m.style]}>
      {title ? <RNText style={[styles.text, styles.rowLabel]}>{title}</RNText> : null}
      <Pressable onPress={() => { setShownMonth(new Date(value.getFullYear(), value.getMonth(), 1)); setOpen(true); }} disabled={m.disabled} style={styles.dateValue}>
        <RNText style={[styles.text, { color: tint }]}>{shown}</RNText>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        {withDate ? (
          <View style={styles.calendar}>
            <View style={styles.calendarHead}>
              <Pressable
                hitSlop={12}
                onPress={() => setShownMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                <SymbolView name="chevron.left" size={18} tintColor={tint} />
              </Pressable>
              <RNText style={[styles.text, styles.calendarTitle]}>
                {`${MONTHS[shownMonth.getMonth()]} ${shownMonth.getFullYear()}`}
              </RNText>
              <Pressable
                hitSlop={12}
                onPress={() => setShownMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                <SymbolView name="chevron.right" size={18} tintColor={tint} />
              </Pressable>
            </View>
            <View style={styles.calendarRow}>
              {WEEKDAYS.map((day) => (
                <RNText key={day} style={styles.weekday}>{day}</RNText>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {monthGrid(shownMonth.getFullYear(), shownMonth.getMonth()).map((day, index) => {
                const chosen =
                  day != null &&
                  value.getDate() === day &&
                  value.getMonth() === shownMonth.getMonth() &&
                  value.getFullYear() === shownMonth.getFullYear();
                const off = day != null && dayDisabled(day);
                return (
                  <Pressable
                    key={index}
                    disabled={day == null || off}
                    onPress={() => day != null && pickDay(day)}
                    style={[styles.dayCell, chosen && { backgroundColor: tint }]}>
                    <RNText style={[styles.text, styles.dayText, off && styles.dayTextOff, chosen && styles.dayTextChosen]}>
                      {day ?? ''}
                    </RNText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {withTime ? (
          <View style={[styles.timeColumns, withDate && styles.timeColumnsCompact]}>
            <ScrollView
              style={styles.timeColumn}
              contentContainerStyle={styles.timeColumnContent}
              contentOffset={{ x: 0, y: Math.max(0, (value.getHours() - 1) * TIME_CELL) }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <Pressable key={hour} style={styles.timeCell} onPress={() => pickTime(hour, value.getMinutes())}>
                  <RNText style={[styles.timeText, hour === value.getHours() && { color: tint, fontWeight: '700' }]}>
                    {String(hour).padStart(2, '0')}
                  </RNText>
                </Pressable>
              ))}
            </ScrollView>
            <RNText style={styles.timeColon}>:</RNText>
            <ScrollView
              style={styles.timeColumn}
              contentContainerStyle={styles.timeColumnContent}
              contentOffset={{ x: 0, y: Math.max(0, (minutes.indexOf(value.getMinutes()) - 1) * TIME_CELL) }}>
              {minutes.map((minute) => (
                <Pressable key={minute} style={styles.timeCell} onPress={() => pickTime(value.getHours(), minute)}>
                  <RNText style={[styles.timeText, minute === value.getMinutes() && { color: tint, fontWeight: '700' }]}>
                    {String(minute).padStart(2, '0')}
                  </RNText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {withTime ? (
          <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.sheetDone, { backgroundColor: tint }, pressed && styles.pressed]}>
            <RNText style={styles.sheetDoneText}>Готово</RNText>
          </Pressable>
        ) : null}
      </Sheet>
    </View>
  );
}

type FieldProps = Mods & {
  text?: { value: string } | string;
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  allowNewlines?: boolean;
  onTextChange?: (text: string) => void;
};

function Field({ secure, ...props }: FieldProps & { secure?: boolean }) {
  const m = resolve(props.modifiers);
  const tint = useTint(m.tint) as string;
  // `text` бывает обычной строкой и наблюдаемым состоянием из useNativeState.
  const bound = typeof props.text === 'object' && props.text !== null ? props.text : null;
  const initial = bound ? bound.value : (typeof props.text === 'string' ? props.text : props.defaultValue);
  const [value, setValue] = useState(initial ?? '');
  // Обратно в наблюдаемое состояние не пишем: в SwiftUI биндинг задаёт полю начальное
  // значение, а дальше текст уходит через onTextChange — так он и используется в проекте.
  return (
    <TextInput
      style={[styles.input, m.text, m.style]}
      value={value}
      placeholder={props.placeholder}
      placeholderTextColor={colors.tertiaryLabel}
      autoFocus={props.autoFocus}
      editable={!m.disabled}
      multiline={props.multiline}
      numberOfLines={props.numberOfLines}
      secureTextEntry={secure}
      selectionColor={tint}
      keyboardType={m.keyboardType}
      autoCorrect={m.autocorrect}
      autoCapitalize={m.autocapitalize}
      returnKeyType={m.submitLabel === 'done' ? 'done' : m.submitLabel === 'search' ? 'search' : 'default'}
      onSubmitEditing={m.onSubmit}
      onChangeText={(next) => {
        setValue(next);
        props.onTextChange?.(next);
      }}
    />
  );
}

export const TextField = (props: FieldProps) => <Field {...props} />;
export const SecureField = (props: FieldProps) => <Field {...props} secure />;

export function ColorPicker({ selection, onSelectionChange, label, modifiers }: Mods & {
  selection?: string;
  supportsOpacity?: boolean;
  label?: string;
  onSelectionChange?: (color: string) => void;
}) {
  const m = resolve(modifiers);
  const [open, setOpen] = useState(false);
  // Значение уезжает на сервер строкой, поэтому палитра — фиксированные hex, а не PlatformColor.
  const palette = ['#7C5CFF', '#0A84FF', '#30B0C7', '#34C759', '#FF9F0A', '#FF453A', '#FF375F', '#5E5CE6', '#8E8E93'];
  return (
    <>
      <Pressable style={[styles.listRow, m.style]} onPress={() => setOpen(true)}>
        {label ? <RNText style={[styles.text, styles.rowLabel]}>{label}</RNText> : <View style={styles.rowLabel} />}
        <View style={[styles.swatch, { backgroundColor: selection ?? colors.accent }]} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? 'Цвет'}>
        <View style={styles.palette}>
          {palette.map((color) => (
            <Pressable key={color} onPress={() => { onSelectionChange?.(color); setOpen(false); }}>
              <View style={[styles.swatchLarge, { backgroundColor: color }, selection === color && styles.swatchActive]} />
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

// ——— списки ———

/**
 * SwiftUI Form — прокручиваемый сгруппированный список. Раньше здесь был простой View:
 * на Android шторка смены и форма входа не прокручивались, а секции липли к краям.
 */
export function Form({ children, modifiers }: Mods & WithChildren) {
  const m = resolve(modifiers);
  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={[styles.form, m.style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={m.refresh ? <Refresher onRefresh={m.refresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

/** Индикатор обновления, который сам крутится, пока идёт `refreshable`. */
function Refresher({ onRefresh, ...rest }: { onRefresh: () => Promise<void> | void }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      colors={[colors.accent]}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }}
    />
  );
}

export function Section({ title, footer, children, modifiers }: Mods & WithChildren & { title?: string; footer?: ReactNode }) {
  const m = resolve(modifiers);
  return (
    <View style={[styles.section, m.style]}>
      {title ? <RNText style={styles.sectionTitle}>{title.toUpperCase()}</RNText> : null}
      <View style={styles.card}>{separated(children)}</View>
      {footer ? <View style={styles.sectionFooter}>{typeof footer === 'string' ? <RNText style={styles.footnote}>{footer}</RNText> : footer}</View> : null}
    </View>
  );
}

type ForEachProps = WithChildren & {
  /** Как SwiftUI onMove: индексы источников и место вставки в исходном массиве. */
  onMove?: (sources: number[], destination: number) => void;
  onDelete?: (indices: number[]) => void;
};

/**
 * `List.ForEach` с перестановкой. На Android перетаскивания SwiftUI нет — строки
 * двигаются стрелками «выше / ниже». Раньше List.ForEach не существовал вовсе, и
 * экран «Порядок категорий» падал при открытии.
 */
function ForEach({ children, onMove, onDelete }: ForEachProps) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <View key={isValidElement(row) && row.key != null ? row.key : index}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <View style={styles.moveRow}>
            <View style={styles.rowLabel}>{row}</View>
            {onDelete ? (
              <Pressable hitSlop={8} onPress={() => onDelete([index])} accessibilityRole="button" accessibilityLabel="Удалить">
                <SymbolView name="minus.circle.fill" size={22} tintColor={colors.red} />
              </Pressable>
            ) : null}
            {onMove ? (
              <>
                <Pressable
                  hitSlop={6}
                  disabled={index === 0}
                  onPress={() => onMove([index], index - 1)}
                  style={({ pressed }) => [styles.moveButton, (pressed || index === 0) && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Выше">
                  <SymbolView name="chevron.up" size={16} tintColor={index === 0 ? colors.tertiaryLabel : colors.label} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  disabled={index === rows.length - 1}
                  onPress={() => onMove([index], index + 2)}
                  style={({ pressed }) => [styles.moveButton, (pressed || index === rows.length - 1) && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Ниже">
                  <SymbolView name="chevron.down" size={16} tintColor={index === rows.length - 1 ? colors.tertiaryLabel : colors.label} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function List({ children, modifiers, style }: Mods & WithChildren & { style?: StyleProp<ViewStyle> }) {
  const m = resolve(modifiers);
  const inset = m.listStyle !== 'plain';
  return (
    <ScrollView
      style={[styles.list, style]}
      contentContainerStyle={[styles.listContent, inset && styles.listInset]}
      refreshControl={m.refresh ? <Refresher onRefresh={m.refresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

List.ForEach = ForEach;

export function LabeledContent({ label, children, modifiers }: Mods & WithChildren & { label?: string }) {
  const m = resolve(modifiers);
  return (
    <View style={[styles.listRow, m.style]}>
      <RNText style={[styles.text, styles.rowLabel]}>{label}</RNText>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

export function Menu({ label, systemImage, children, modifiers }: Mods & WithChildren & { label?: string; systemImage?: string }) {
  const m = resolve(modifiers);
  const tint = useTint(m.tint) as string;
  const [open, setOpen] = useState(false);
  // glassProminent / borderedProminent + круглая форма — заметная круглая кнопка «+», как в iOS.
  const prominent = m.buttonStyle === 'glassProminent' || m.buttonStyle === 'borderedProminent';
  const round = prominent && (m.borderShape === 'circle' || m.labelStyle === 'iconOnly');
  const large = m.controlSize === 'large' || m.controlSize === 'extraLarge';
  const iconColor = prominent ? '#FFFFFF' : tint;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          round ? [styles.roundButton, large && styles.roundButtonLarge] : styles.button,
          prominent && { backgroundColor: tint },
          m.style,
          pressed && styles.pressed,
        ]}>
        {systemImage ? <SymbolView name={systemImage} size={large ? 22 : 19} tintColor={iconColor} /> : null}
        {label && !systemImage ? <RNText style={[styles.text, { color: iconColor }]}>{label}</RNText> : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <MenuCloseContext.Provider value={() => setOpen(false)}>{separated(children)}</MenuCloseContext.Provider>
      </Sheet>
    </>
  );
}

export function ProgressView({ modifiers }: Mods & { value?: number; total?: number }) {
  const m = resolve(modifiers);
  return <ActivityIndicator color={(useTint(m.tint) as string) ?? colors.accent} style={m.style} />;
}

export function ContentUnavailableView({ title, systemImage, description, modifiers }: Mods & { title?: string; systemImage?: string; description?: string }) {
  const m = resolve(modifiers);
  return (
    <View style={[styles.unavailable, m.style]}>
      {systemImage ? <SymbolView name={systemImage} size={48} tintColor={colors.tertiaryLabel} /> : null}
      {title ? <RNText style={styles.unavailableTitle}>{title}</RNText> : null}
      {description ? <RNText style={styles.unavailableText}>{description}</RNText> : null}
    </View>
  );
}

// ——— графики ———

type ChartPoint = { x: string | number; y: number; color?: ColorValue };

export function Chart({ type = 'bar', data = [], showGrid, barStyle, modifiers }: Mods & {
  type?: 'bar' | 'line' | 'pie' | 'area' | 'point';
  data?: ChartPoint[];
  animate?: boolean;
  showGrid?: boolean;
  barStyle?: { cornerRadius?: number };
  pieStyle?: { innerRadius?: number; angularInset?: number };
}) {
  const m = resolve(modifiers);
  const total = data.reduce((sum, point) => sum + Math.max(0, point.y), 0);

  // Круговую диаграмму на Android заменяет стековая полоса: те же доли и цвета,
  // а легенда на экранах аналитики уже нарисована рядом.
  if (type === 'pie') {
    return (
      <View style={[styles.stack, m.style]}>
        {data.map((point, index) => (
          <View key={index} style={{ flex: Math.max(0.0001, point.y / (total || 1)), backgroundColor: (point.color as string) ?? colors.accent }} />
        ))}
      </View>
    );
  }

  const max = data.reduce((peak, point) => Math.max(peak, point.y), 0) || 1;
  return (
    <View style={[styles.chart, m.style]}>
      {showGrid ? <View style={styles.grid}>{[0, 1, 2, 3].map((line) => <View key={line} style={styles.gridLine} />)}</View> : null}
      <View style={styles.bars}>
        {data.map((point, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              marginHorizontal: 1,
              height: `${Math.max(1, (point.y / max) * 100)}%`,
              borderRadius: barStyle?.cornerRadius ?? 3,
              backgroundColor: (point.color as string) ?? colors.accent,
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ——— состояние ———

export type ObservableState<T> = { value: T };

/** Двойник нативного биндинга SwiftUI: объект, чья запись в `.value` перерисовывает вьюху. */
export function useNativeState<T>(initialValue: T): ObservableState<T> {
  const [, bump] = useState(0);
  // Объект создаётся один раз: экраны передают его в поля как биндинг и ждут,
  // что запись в .value переживёт перерисовку.
  const [state] = useState<ObservableState<T>>(() => {
    let current = initialValue;
    return {
      get value() { return current; },
      set value(next: T) { current = next; bump((tick) => tick + 1); },
    };
  });
  return state;
}

// ——— вспомогательное ———

/** Сгруппированный список iOS: разделители между строками, но не после последней. */
function separated(children: ReactNode) {
  const items = Children.toArray(children).filter(Boolean);
  return items.map((child, index) => (
    <View key={index}>
      {index > 0 ? <View style={styles.separator} /> : null}
      {needsCellPadding(child) ? <View style={styles.cell}>{child}</View> : child}
    </View>
  ));
}

/** Строки без собственных полей (стеки, текст) — в SwiftUI их отступы даёт ячейка. */
function needsCellPadding(child: ReactNode): boolean {
  if (!isValidElement(child)) return typeof child === 'string';
  return child.type === HStack || child.type === VStack || child.type === Text || child.type === Label || child.type === ProgressView;
}

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          {title ? <RNText style={styles.sheetTitle}>{title}</RNText> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.label, fontSize: 17 },
  textLarge: { fontSize: 19 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowLabel: { flex: 1 },
  spacer: { flexGrow: 1 },

  button: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.control },
  buttonLarge: { paddingVertical: space.md, justifyContent: 'center' },
  buttonPill: { borderRadius: 999, paddingHorizontal: space.lg, justifyContent: 'center' },
  pressed: { opacity: 0.55 },

  segments: { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 7 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 14, color: colors.label },

  form: { gap: space.xl, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxxl },
  cell: { paddingHorizontal: space.lg, paddingVertical: space.md },
  menuItem: { paddingVertical: space.md, paddingHorizontal: space.lg },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  roundButtonLarge: { width: 50, height: 50, borderRadius: 25 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.lg, paddingRight: space.sm, minHeight: 52 },
  moveButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  section: { gap: space.xs },
  sectionTitle: { color: colors.secondaryLabel, fontSize: 12, letterSpacing: 0.6, marginLeft: space.lg, marginBottom: space.xs },
  sectionFooter: { marginHorizontal: space.lg, marginTop: space.xs },
  footnote: { color: colors.secondaryLabel, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: space.lg },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 48 },
  list: { flex: 1 },
  listContent: { paddingVertical: space.md, gap: space.xl },
  listInset: { paddingHorizontal: space.lg },

  input: { color: colors.label, fontSize: 17, paddingVertical: space.md, paddingHorizontal: space.lg, flex: 1 },
  dateValue: { paddingVertical: space.xs },

  calendar: { paddingHorizontal: space.lg, gap: space.sm },
  calendarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  calendarTitle: { fontWeight: '600' },
  calendarRow: { flexDirection: 'row' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.secondaryLabel, fontSize: 12 },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9999 },
  dayText: { fontSize: 16 },
  dayTextChosen: { color: '#FFFFFF', fontWeight: '700' },
  timeColumns: { flexDirection: 'row', alignItems: 'center', height: TIME_CELL * 5, paddingHorizontal: space.xxl, gap: space.md },
  timeColumnsCompact: { height: TIME_CELL * 3, marginTop: space.sm },
  timeColumn: { flex: 1, alignSelf: 'stretch' },
  timeColumnContent: { paddingVertical: space.xs },
  timeCell: { height: TIME_CELL, alignItems: 'center', justifyContent: 'center' },
  timeText: { color: colors.label, fontSize: 20, fontVariant: ['tabular-nums'] },
  timeColon: { color: colors.secondaryLabel, fontSize: 22, fontWeight: '600' },
  dayTextOff: { color: colors.tertiaryLabel },
  sheetDone: { marginHorizontal: space.lg, marginTop: space.lg, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sheetDoneText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchLarge: { width: 44, height: 44, borderRadius: 22 },
  swatchActive: { borderWidth: 3, borderColor: colors.label },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'center', paddingVertical: space.md },

  unavailable: { alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
  unavailableTitle: { color: colors.label, fontSize: 19, fontWeight: '600', textAlign: 'center' },
  unavailableText: { color: colors.secondaryLabel, fontSize: 15, textAlign: 'center' },

  chart: { flex: 1, minHeight: 120, justifyContent: 'flex-end' },
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  gridLine: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%' },
  stack: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.groupedBackground, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingVertical: space.lg, paddingBottom: space.xxxl },
  sheetTitle: { color: colors.secondaryLabel, fontSize: 13, textAlign: 'center', marginBottom: space.sm },
});
