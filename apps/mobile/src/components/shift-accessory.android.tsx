import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/lib/theme';

import { ShiftAccessoryBody } from './shift-accessory-body';

/**
 * На Android нет bottom accessory: плашку рисует сам экран (см. app/(app)/_layout.tsx),
 * поэтому подложку — фон, скругление и тень — добавляем здесь, а не берём у системы.
 */
export function ShiftAccessory() {
  return (
    <View style={styles.pill}>
      <ShiftAccessoryBody placement="regular" />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.floating,
    paddingHorizontal: space.xs,
    elevation: 6,
  },
});
