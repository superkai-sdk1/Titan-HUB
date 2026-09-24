import { Stack } from 'expo-router';

/** Шторка смены: сводка, открытие, закрытие и кассовые операции — шагами внутри шторки. */
export default function ShiftLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Смена' }} />
      <Stack.Screen name="open" options={{ title: 'Открыть смену' }} />
      <Stack.Screen name="close" options={{ title: 'Закрыть смену' }} />
      <Stack.Screen name="cash" options={{ title: 'Касса' }} />
    </Stack>
  );
}
