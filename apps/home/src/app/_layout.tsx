import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useEffectEvent, useState } from 'react';
import { AppState, BackHandler, Keyboard, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RoomDock } from '@/components/room-dock';
import { ToastHost } from '@/components/toast-host';
import { api } from '@/lib/api';
import { idleFor, markActivity } from '@/lib/activity';
import { useCart } from '@/lib/cart';
import { applyKioskWindow, usePrefs } from '@/lib/prefs';
import { queryClient } from '@/lib/queries';
import { tokenRefreshDue, useSession } from '@/lib/session';
import { useStaff } from '@/lib/staff';
import { colors } from '@/lib/theme';
import { useFlowDriver } from '@/lib/use-flow-driver';
import { useRoom, useRoomConnection } from '@/lib/use-room';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(colors.background);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" hidden />
          <Root />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const hydrated = useSession((s) => s.hydrated);
  const prefsLoaded = usePrefs((s) => s.loaded);
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const ready = hydrated && prefsLoaded && fontsLoaded;

  useEffect(() => {
    void useSession.getState().hydrate();
    void usePrefs.getState().load();
  }, []);

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    void applyKioskWindow();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void applyKioskWindow();
    });
    return () => sub.remove();
  }, [ready]);

  // «Назад» на главном экране не выпускает гостя из киоска.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => !router.canGoBack());
    return () => sub.remove();
  }, []);

  if (!ready) return null;
  return (
    <View style={{ flex: 1 }} onTouchStart={markActivity}>
      <Shell />
      <ToastHost />
    </View>
  );
}

/** Экран гостя + панель «Свет и климат»: справа в альбомной, снизу в портретной. */
function Shell() {
  const signedIn = useSession((s) => !!s.club && !!s.space && !!s.token);
  const { width, height } = useWindowDimensions();
  const landscape = width >= height;
  const { configured } = useRoom();
  const keyboard = useKeyboardVisible();
  const showDock = signedIn && configured && !(keyboard && !landscape);

  return (
    <View style={{ flex: 1, flexDirection: landscape ? 'row' : 'column' }}>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="index" />
            <Stack.Screen name="menu" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="chat" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="pay" />
            <Stack.Screen name="staff/index" />
            <Stack.Screen name="staff/room" options={{ animation: 'slide_from_right' }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="setup" />
          </Stack.Protected>
        </Stack>
      </View>
      {showDock ? <RoomDock layout={landscape ? 'side' : 'bottom'} /> : null}
      {signedIn ? <SignedInEffects /> : null}
    </View>
  );
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

const IDLE_RETURN_MS = 2 * 60_000;

/** Фоновые обязанности вошедшего планшета. */
function SignedInEffects() {
  useFlowDriver();
  useRoomConnection();
  const pathname = usePathname();

  // Гость ушёл посреди меню/чата — через 2 минуты без касаний возвращаемся на главный.
  // Экран оплаты не трогаем: гость сканирует QR телефоном и может не касаться планшета.
  const checkIdle = useEffectEvent(() => {
    if (pathname === '/' || pathname === '/pay' || idleFor() < IDLE_RETURN_MS) return;
    if (pathname === '/menu') useCart.getState().clear();
    useStaff.getState().lock();
    if (router.canDismiss()) router.dismissAll();
  });

  useEffect(() => {
    const t = setInterval(checkIdle, 15_000);
    return () => clearInterval(t);
  }, []);

  // Скользящая сессия: работающий планшет раз в 3 дня меняет токен на свежий.
  const refresh = useEffectEvent(async () => {
    if (!tokenRefreshDue()) return;
    try {
      const { token } = await api.post<{ token: string }>('/auth/tablet-refresh');
      await useSession.getState().replaceToken(token);
    } catch {
      /* продлим в следующий раз; 401 сам вернёт планшет к PIN */
    }
  });

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 6 * 3600_000);
    return () => clearInterval(t);
  }, []);

  return null;
}
