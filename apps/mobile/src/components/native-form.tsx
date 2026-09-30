import { Button, DatePicker, HStack, Image, SecureField, Spacer, Text, TextField, useNativeState, VStack } from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  background,
  font,
  foregroundStyle,
  frame,
  keyboardType as keyboardTypeModifier,
  layoutPriority,
  lineLimit,
  multilineTextAlignment,
  onSubmit,
  shapes,
  submitLabel,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/**
 * Строки нативных форм в духе «Настроек» iOS 26: SwiftUI Form, цветные значки-плашки,
 * значение справа и шеврон у переходов, правка прямо в строке — без диалогов ради одного поля.
 * На Android те же компоненты рисует слой совместимости (src/compat/android/swift-ui).
 */

// Абсолютные цвета, а не иерархия: внутри Button иерархия считается от тона кнопки,
// и подписи строк становились фиолетовыми.
export const primary = foregroundStyle('primary');
export const secondary = foregroundStyle('secondary');
export const tertiary = foregroundStyle(colors.tertiaryLabel);
export const footnote = font({ textStyle: 'footnote' });

/** Цветная плашка со значком — как у пунктов «Настроек». */
export function RowIcon({ name, color }: { name: SFSymbol; color: ColorValue }) {
  return (
    <Image
      systemName={name}
      size={15}
      color="white"
      modifiers={[frame({ width: 30, height: 30 }), background(color, shapes.roundedRectangle({ cornerRadius: 8 }))]}
    />
  );
}

/** Подпись строки с необязательной второй строкой. */
function Titles({ title, subtitle, destructive }: { title: string; subtitle?: string; destructive?: boolean }) {
  return (
    <VStack alignment="leading" spacing={1}>
      <Text modifiers={[destructive ? foregroundStyle('red') : primary, lineLimit(1)]}>{title}</Text>
      {subtitle ? <Text modifiers={[footnote, secondary, lineLimit(2)]}>{subtitle}</Text> : null}
    </VStack>
  );
}

/**
 * Строка-переход: значок, подпись, значение и шеврон. Без `onPress` — просто строка
 * со значением (справочник для сотрудника).
 */
export function LinkRow({
  icon,
  color,
  title,
  subtitle,
  value,
  valueColor,
  destructive,
  chevron = true,
  onPress,
}: {
  icon?: SFSymbol;
  color?: ColorValue;
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: ColorValue;
  destructive?: boolean;
  chevron?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <HStack spacing={12}>
      {icon ? <RowIcon name={icon} color={color ?? '#8E8E93'} /> : null}
      <Titles title={title} subtitle={subtitle} destructive={destructive} />
      <Spacer />
      {value ? <Text modifiers={[valueColor ? foregroundStyle(valueColor as string) : secondary, lineLimit(1)]}>{value}</Text> : null}
      {onPress && chevron ? <Image systemName="chevron.right" size={13} modifiers={[tertiary, font({ weight: 'semibold' })]} /> : null}
    </HStack>
  );
  if (!onPress) return content;
  return (
    <Button
      onPress={() => {
        haptic.selection();
        onPress();
      }}>
      {content}
    </Button>
  );
}

/** Строка-действие по центру или с значком: «Добавить тариф», «Выйти». */
export function ActionRow({ title, icon, destructive, disabled, onPress }: { title: string; icon?: SFSymbol; destructive?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Button
      role={destructive ? 'destructive' : undefined}
      label={title}
      systemImage={icon}
      modifiers={disabled ? [tertiary] : undefined}
      onPress={() => {
        if (disabled) return;
        haptic.light();
        onPress();
      }}
    />
  );
}

type Keyboard = 'default' | 'numeric' | 'decimal-pad' | 'phone-pad' | 'email-address' | 'url';

/**
 * Поле прямо в строке формы: подпись слева, значение справа. Сохраняется, когда
 * человек уходит из поля или жмёт «Готово», и только если значение изменилось.
 * Начальное значение задаётся при появлении — родитель рисует строку, когда данные есть.
 */
export function TextRow({
  label,
  value,
  placeholder,
  keyboard = 'default',
  maxLength,
  capitalize = 'sentences',
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  keyboard?: Keyboard;
  maxLength?: number;
  capitalize?: 'never' | 'words' | 'sentences';
  onCommit: (next: string) => void;
}) {
  const text = useNativeState(value);
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const commit = () => {
    const next = draft.trim();
    if (next === committed.trim()) return;
    setCommitted(next);
    onCommit(next);
  };
  return (
    <HStack spacing={12}>
      {/* Подпись в одну строку и в приоритете: поле значения ужимается, а не переносит подпись. */}
      <Text modifiers={[primary, lineLimit(1), layoutPriority(1)]}>{label}</Text>
      <TextField
        text={text}
        placeholder={placeholder}
        maxLength={maxLength}
        onTextChange={setDraft}
        onFocusChange={(focused) => {
          if (!focused) commit();
        }}
        modifiers={[
          multilineTextAlignment('trailing'),
          keyboardTypeModifier(keyboard),
          textInputAutocapitalization(capitalize),
          submitLabel('done'),
          onSubmit(commit),
        ]}
      />
    </HStack>
  );
}

/** Поле во всю ширину строки (многострочный текст: подпись чека, приглашение к отзыву). */
export function FieldRow({
  value,
  placeholder,
  keyboard = 'default',
  maxLength,
  multiline,
  autoFocus,
  secure,
  onChange,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  keyboard?: Keyboard;
  maxLength?: number;
  multiline?: boolean;
  autoFocus?: boolean;
  /** Пароль: символы скрыты. */
  secure?: boolean;
  onChange?: (next: string) => void;
  onCommit?: (next: string) => void;
}) {
  const text = useNativeState(value);
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const commit = () => {
    if (!onCommit || draft.trim() === committed.trim()) return;
    setCommitted(draft.trim());
    onCommit(draft.trim());
  };
  if (secure) {
    return (
      <SecureField
        text={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onTextChange={(next) => {
          setDraft(next);
          onChange?.(next);
        }}
        modifiers={[submitLabel('done'), onSubmit(commit)]}
      />
    );
  }
  return (
    <TextField
      text={text}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      axis={multiline ? 'vertical' : 'horizontal'}
      onTextChange={(next) => {
        setDraft(next);
        onChange?.(next);
      }}
      onFocusChange={(focused) => {
        if (!focused) commit();
      }}
      modifiers={[keyboardTypeModifier(keyboard), ...(multiline ? [lineLimit(5)] : [submitLabel('done'), onSubmit(commit)])]}
    />
  );
}

/** «ЧЧ:ММ» ↔ дата сегодняшнего дня: DatePicker работает с датами, настройка хранится строкой. */
export function timeToDate(value: string, fallback = '10:00'): Date {
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(value) ? value : fallback).split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date;
}

export function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Время строкой «ЧЧ:ММ» — системный выбор времени прямо в строке. */
export function TimeRow({ label, value, fallback, onChange }: { label: string; value: string; fallback?: string; onChange: (next: string) => void }) {
  return (
    <DatePicker
      title={label}
      selection={timeToDate(value, fallback)}
      displayedComponents={['hourAndMinute']}
      onDateChange={(date) => {
        const next = dateToTime(date);
        if (next !== value) onChange(next);
      }}
    />
  );
}

/** Цвет из системного ColorPicker («#RRGGBB» или «#RRGGBBAA», бывает и нижний регистр) → «#RRGGBB». */
export function normalizeHex(value: string | null | undefined, fallback: string): string {
  const match = /^#?([0-9a-f]{6})/i.exec(value ?? '');
  return match ? `#${match[1].toUpperCase()}` : fallback;
}

/**
 * Поиск строкой вверху списка, как в «Настройках» iOS: лупа и поле. Значение отдаётся
 * сразу; задержку перед запросом делает экран (useDebounced).
 */
export function SearchRow({ placeholder, onChange }: { placeholder: string; onChange: (next: string) => void }) {
  const text = useNativeState('');
  return (
    <HStack spacing={8}>
      <Image systemName="magnifyingglass" size={15} modifiers={[secondary]} />
      <TextField
        text={text}
        placeholder={placeholder}
        onTextChange={onChange}
        modifiers={[autocorrectionDisabled(), textInputAutocapitalization('never'), submitLabel('search')]}
      />
    </HStack>
  );
}
