// Android-обёртка expo-symbols.
//
// Штатный SymbolView на Android умеет рисовать глиф Material Symbols, но только если
// имя пришло объектом `{ ios, android }`. В приложении иконки заданы строками SF —
// обёртка дописывает android-имя по таблице, и 71 экран остаётся без правок.
import { SymbolView as NativeSymbolView, type AndroidSymbol, type SFSymbol, type SymbolViewProps } from 'expo-symbols';
import { View } from 'react-native';

import { toMaterialSymbol } from './sf-to-material';

/** Как у expo-symbols, но `name` — любая строка: имена приходят из данных и пропсов. */
export type CompatSymbolViewProps = Omit<SymbolViewProps, 'name'> & { name: string | SymbolViewProps['name'] };

export function SymbolView({ name, fallback, size = 24, ...rest }: CompatSymbolViewProps) {
  let resolved = name as SymbolViewProps['name'];
  if (typeof name === 'string') {
    const android = toMaterialSymbol(name);
    // Без android-имени SymbolView покажет fallback — пустое место нужного размера,
    // чтобы строка не сжималась там, где иконка не нашлась.
    if (android) resolved = { ios: name as SFSymbol, android: android as AndroidSymbol };
  }
  return (
    <NativeSymbolView
      {...rest}
      size={size}
      name={resolved}
      fallback={fallback ?? <View style={{ width: size, height: size }} />}
    />
  );
}

export { unstable_getMaterialSymbolSourceAsync } from 'expo-symbols';
export type { AndroidSymbol, SFSymbol, SymbolViewProps } from 'expo-symbols';
