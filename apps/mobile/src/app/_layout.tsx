import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogHost } from '@/components/dialog-host';
import { NotificationBanner } from '@/components/notification-banner';
import { OfflineBanner } from '@/components/offline-banner';
import { SessionLock } from '@/components/session-lock';
import { CACHE_MAX_AGE, queryClient, queryPersister, subscribeAppFocus, subscribeNetwork } from '@/lib/query';
import { useRealtime } from '@/lib/realtime';
import { useDevicePrefs } from '@/lib/device-prefs';
import { useSession } from '@/lib/session';
import { colors, accentHex } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

/** Живые обновления клуба, пока есть вход. */
function Realtime() {
  useRealtime();
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  useEffect(() => {
    void useDevicePrefs.getState().hydrate();
  }, []);
  const hydrated = useSession((s) => s.hydrated);
  const club = useSession((s) => s.club);
  const token = useSession((s) => s.token);

  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);

  useEffect(() => {
    if (hydrated) void SplashScreen.hideAsync();
  }, [hydrated]);

  useEffect(() => subscribeAppFocus(), []);
  useEffect(() => subscribeNetwork(), []);

  if (!hydrated) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: scheme === 'dark' ? accentHex.dark : accentHex.light },
  };
  const signedIn = !!club && !!token;

  return (
    <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider>
    <KeyboardProvider>
    <ThemeProvider value={theme}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: CACHE_MAX_AGE }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
            <Stack.Screen
              name="shift"
              options={{
                presentation: 'formSheet',
                // Android раскладывает шторку с двумя высотами во весь рост и прячет её низ —
                // кнопка «Открыть смену» оказалась бы за экраном. Там шторка сразу полная.
                sheetAllowedDetents: Platform.OS === 'android' ? [1] : [0.6, 1],
                sheetGrabberVisible: true,
                headerShown: false,
                contentStyle: Platform.OS === 'android' ? { backgroundColor: colors.sheetBackground } : undefined,
              }}
            />
            <Stack.Screen
              name="new-check"
              options={{
                presentation: 'formSheet',
                // Высота по содержимому, как модалка веб-кассы; клавиатура поднимает шторку.
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                headerShown: false,
                // Контент без фона — под ним системное стекло шторки iOS 26.
                contentStyle: { backgroundColor: colors.sheetBackground },
              }}
            />
            <Stack.Screen
              name="pay"
              options={{ presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, headerShown: false }}
            />
            <Stack.Screen
              name="notifications"
              options={{ presentation: 'modal', headerShown: true, title: 'Уведомления' }}
            />
            {/* Tai — свой заголовок и композер внизу, поэтому системная шапка не нужна. */}
            <Stack.Screen name="tai" options={{ presentation: 'modal', headerShown: false }} />
          </Stack.Protected>
        </Stack>
        {signedIn && <Realtime />}
        {signedIn && <NotificationBanner />}
        <OfflineBanner />
        <SessionLock />
        <DialogHost />
      </PersistQueryClientProvider>
    </ThemeProvider>
    </KeyboardProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
