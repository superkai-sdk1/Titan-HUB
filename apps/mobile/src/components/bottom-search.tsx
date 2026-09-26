import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClearButton } from '@/components/clear-button';
import { colors, space, type } from '@/lib/theme';

/** Высота капсулы поиска — на неё же делается запас в конце списка. */
export const SEARCH_HEIGHT = 48;

/**
 * Сколько оставить под поиском в конце списка. `insets.bottom` внутри вкладки уже
 * включает высоту таб-бара (UIKit добавляет её в safe area экрана), поэтому сверх неё
 * нужен только просвет.
 */
export function useSearchClearance(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + space.sm + SEARCH_HEIGHT + space.lg;
}

/**
 * Строка поиска у нижнего края: над таб-баром, под большим пальцем. С открытой
 * клавиатурой поднимается вместе с ней (`KeyboardStickyView` сдвигает на высоту
 * клавиатуры, offset возвращает нижнюю safe area, чтобы капсула села прямо над ней).
 *
 * Капсула парит над списком, поэтому списку нужен запас `useSearchClearance()`
 * и `automaticallyAdjustKeyboardInsets`, иначе клавиатура закроет последние строки.
 */
export function BottomSearch({
  value,
  onChange,
  placeholder,
  autoCapitalize = 'none',
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={[styles.sticky, { bottom: insets.bottom + space.sm }]}>
      <View pointerEvents="box-none">
        <GlassView style={styles.field}>
          <SymbolView name="magnifyingglass" size={16} weight="medium" tintColor={colors.secondaryLabel} />
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={colors.tertiaryLabel}
            selectionColor={colors.accent}
            style={[type.body, styles.input]}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel={placeholder}
          />
          <ClearButton visible={value.length > 0} onPress={() => onChange('')} />
        </GlassView>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: space.lg, right: space.lg },
  field: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: SEARCH_HEIGHT, paddingHorizontal: space.lg, borderRadius: SEARCH_HEIGHT / 2 },
  input: { flex: 1, color: colors.label, height: SEARCH_HEIGHT },
});
