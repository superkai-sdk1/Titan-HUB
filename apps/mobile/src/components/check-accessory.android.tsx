import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/lib/theme';

import { CheckAccessoryBody } from './check-accessory-body';

/** Подложка вместо системной: на Android плашку рисует сам экран. */
export function CheckAccessory({ checkId }: { checkId: string }) {
  return (
    <View style={styles.pill}>
      <CheckAccessoryBody checkId={checkId} inline={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 56,
    justifyContent: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.floating,
    paddingHorizontal: space.xs,
    elevation: 6,
  },
});
