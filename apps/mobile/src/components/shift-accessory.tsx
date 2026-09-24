import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { ShiftAccessoryBody } from './shift-accessory-body';

/** Плашка смены над таб-баром (bottom accessory iOS 26), как мини-плеер в «Музыке». */
export function ShiftAccessory() {
  return <ShiftAccessoryBody placement={NativeTabs.BottomAccessory.usePlacement()} />;
}
