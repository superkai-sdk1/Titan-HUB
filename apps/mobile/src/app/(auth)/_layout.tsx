import { Stack } from 'expo-router';

import { useSession } from '@/lib/session';

export default function AuthLayout() {
  const club = useSession((s) => s.club);

  return (
    <Stack>
      <Stack.Protected guard={!club}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!!club}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="password" options={{ presentation: 'modal', title: 'Вход по паролю' }} />
      </Stack.Protected>
    </Stack>
  );
}
