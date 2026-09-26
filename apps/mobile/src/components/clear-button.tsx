import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

/**
 * Крестик очистки поля поиска для Android. На iOS его рисует сам TextInput
 * (`clearButtonMode="while-editing"`), на Android такого пропа нет — без кнопки
 * запрос приходилось стирать клавишей по букве.
 */
export function ClearButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  if (Platform.OS === 'ios' || !visible) return null;
  return (
    <Pressable
      hitSlop={10}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Очистить">
      <SymbolView name="xmark.circle.fill" size={18} tintColor={colors.tertiaryLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 2 },
});
