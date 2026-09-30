// Android: нативных вставок SwiftUI нет — RN-слой рисует эти контролы сам.
// Сигнатуры совпадают с islands.ios.tsx, чтобы index.tsx проходил проверку типов.
import type { ColorValue } from 'react-native';

export const HAS_ISLANDS = false;

type Never = (props: never) => null;
const none: Never = () => null;

export const DateIsland = none as (props: {
  selection: Date;
  displayedComponents: ('date' | 'hourAndMinute')[];
  range?: { start?: Date; end?: Date };
  onDateChange?: (date: Date) => void;
  tintColor?: ColorValue;
}) => null;
export const ColorIsland = none as (props: { selection: string | null; onSelectionChange?: (color: string) => void; supportsOpacity?: boolean }) => null;
export const ChartIsland = none as (props: Record<string, unknown> & { height: number }) => null;
