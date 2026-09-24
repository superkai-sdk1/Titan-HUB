import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { CheckAccessoryBody } from './check-accessory-body';

/** Действия открытого чека над таб-баром (iPhone). */
export function CheckAccessory({ checkId }: { checkId: string }) {
  return <CheckAccessoryBody checkId={checkId} inline={NativeTabs.BottomAccessory.usePlacement() === 'inline'} />;
}
