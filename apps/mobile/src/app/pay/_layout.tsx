import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

/** Шторка оплаты: способы и части оплаты, отдельный шаг — QR для СБП. */
export default function PayLayout() {
  return (
    // Контент без фона — под ним системное стекло шторки iOS 26.
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.sheetBackground } }}>
      <Stack.Screen name="index" options={{ title: 'Оплата' }} />
      <Stack.Screen name="qr" options={{ title: 'Оплата по СБП' }} />
    </Stack>
  );
}
