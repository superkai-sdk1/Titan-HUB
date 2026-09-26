import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

type LayoutProps = {
  children: ReactElement;
  options: { presentation?: string; sheetGrabberVisible?: boolean };
};

/**
 * `screenLayout` стеков: «ручка» шторки на Android.
 *
 * react-native-screens рисует её только на iOS — на Android `sheetGrabberVisible`
 * игнорируется, и шторка без неё выглядела обрубленной. Ручка лежит поверх контента
 * и не сдвигает его, поэтому высота «по содержимому» не меняется.
 */
export function sheetLayout({ children, options }: LayoutProps): ReactElement {
  if (Platform.OS !== 'android' || options.presentation !== 'formSheet' || !options.sheetGrabberVisible) return children;
  return (
    <>
      {children}
      <View pointerEvents="none" style={styles.grabber} />
    </>
  );
}

const styles = StyleSheet.create({
  grabber: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.tertiaryLabel,
  },
});
