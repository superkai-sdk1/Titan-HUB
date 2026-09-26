import { Stack } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Шторка не доходит до статус-бара, но шапка Android всё равно добавляла над собой отступ
 * его высоты — выходила пустая белая полоса. Отступ шапки native-stack берёт из
 * `statusBarTranslucent`: false — без отступа (окно при edge-to-edge не меняется).
 */
const SHEET_HEADER = Platform.OS === 'android' ? { statusBarTranslucent: false } : {};

/** Шторка смены: сводка, открытие, закрытие и кассовые операции — шагами внутри шторки. */
export default function ShiftLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', ...SHEET_HEADER }}>
      <Stack.Screen name="index" options={{ title: 'Смена' }} />
      <Stack.Screen name="open" options={{ title: 'Открыть смену' }} />
      <Stack.Screen name="close" options={{ title: 'Закрыть смену' }} />
      <Stack.Screen name="cash" options={{ title: 'Касса' }} />
    </Stack>
  );
}
