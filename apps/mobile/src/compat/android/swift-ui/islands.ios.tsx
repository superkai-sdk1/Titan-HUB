// Нативные вставки SwiftUI для iOS внутри RN-слоя форм.
//
// Формы на iOS рисует тот же RN-слой, что и на Android (см. index.tsx): SwiftUI Form с
// десятками строк строился по 110–220 мс на каждый переход, и анимации дёргались. Даже
// одна вставка SwiftUI (свой UIHostingController) стоит 50–100 мс, поэтому их осталось
// три, и ни одна не строится в момент перехода:
//  - календарь и колесо времени — только в открытой панели выбора даты;
//  - Swift Charts — после въезда экрана (график ниже края и появляется с анимацией);
//  - выбор цвета — после въезда экрана (один экран, редактор категории).
//
// Файл импортирует настоящий @expo/ui/swift-ui — на Android этот модуль падает уже при
// загрузке, поэтому там подключается заглушка islands.tsx.
import { Chart as SwiftChart, ColorPicker as SwiftColorPicker, DatePicker as SwiftDatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, environment, labelsHidden } from '@expo/ui/swift-ui/modifiers';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

export const HAS_ISLANDS = true;

/** Календарь (дата, дата и время) или колесо (только время) — для панели выбора даты. */
export function DateIsland({ selection, displayedComponents, range, onDateChange, tintColor }: {
  selection: Date;
  displayedComponents: ('date' | 'hourAndMinute')[];
  range?: { start?: Date; end?: Date };
  onDateChange?: (date: Date) => void;
  tintColor?: ColorValue;
}) {
  const wheel = !displayedComponents.includes('date');
  // Высота задана явно: в модальной панели автоподбор высоты Host не срабатывал и колесо
  // обрезалось. Календарь со временем выше календаря на строку времени.
  const height = wheel ? 216 : displayedComponents.includes('hourAndMinute') ? 400 : 340;
  return (
    <Host style={{ alignSelf: 'stretch', height }} seedColor={tintColor}>
      <SwiftDatePicker
        selection={selection}
        displayedComponents={displayedComponents}
        range={range}
        onDateChange={onDateChange}
        // Русская локаль независимо от региона телефона: 24 часа и русские месяцы, как в плашках.
        modifiers={[datePickerStyle(wheel ? 'wheel' : 'graphical'), labelsHidden(), environment('locale', 'ru_RU')]}
      />
    </Host>
  );
}

export function ColorIsland({ selection, onSelectionChange, supportsOpacity }: {
  selection: string | null;
  onSelectionChange?: (color: string) => void;
  supportsOpacity?: boolean;
}) {
  return (
    <Host matchContents>
      <SwiftColorPicker selection={selection} onSelectionChange={onSelectionChange} supportsOpacity={supportsOpacity} modifiers={[labelsHidden()]} />
    </Host>
  );
}

type ChartProps = ComponentProps<typeof SwiftChart>;

/** Swift Charts в Host нужной высоты: высота берётся из frame(height:) экрана. */
export function ChartIsland({ height, ...props }: Omit<ChartProps, 'modifiers'> & { height: number }) {
  return (
    <Host style={{ height, alignSelf: 'stretch' }}>
      <SwiftChart {...props} />
    </Host>
  );
}
