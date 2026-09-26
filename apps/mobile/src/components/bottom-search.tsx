import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/glass';
import { ClearButton } from '@/components/clear-button';
import { TAB_BAR_GAP, useTabBarClearance } from '@/lib/tab-bar';
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
  const tabBar = useTabBarClearance();
  // Android: плавающая панель вкладок не входит в safe area — поиск стоит над ней.
  const base = tabBar > 0 ? tabBar + TAB_BAR_GAP : insets.bottom + space.sm;
  return base + SEARCH_HEIGHT + space.lg;
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
  const tabBar = useTabBarClearance();
  const bottom = tabBar > 0 ? tabBar + TAB_BAR_GAP : insets.bottom + space.sm;

  return (
    // С клавиатурой капсула садится прямо на неё: offset возвращает отступ, который занят снизу.
    <KeyboardStickyView offset={{ closed: 0, opened: bottom - space.sm }} style={[styles.sticky, { bottom }]}>
      <View pointerEvents="box-none">
        <GlassView style={[styles.field, Platform.OS === 'android' && styles.fieldAndroid]}>
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
  // Android: стекла нет, полупрозрачная капсула сливалась со строками списка под ней —
  // непрозрачная, с тенью, как панель вкладок.
  fieldAndroid: { backgroundColor: colors.floating, elevation: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
  input: { flex: 1, color: colors.label, height: SEARCH_HEIGHT },
});
