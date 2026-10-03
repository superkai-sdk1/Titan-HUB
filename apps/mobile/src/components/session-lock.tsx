import { BlurView } from 'expo-blur';
import * as LocalAuthentication from 'expo-local-authentication';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PinDots, PinPad, type PinKey } from '@/components/pin-pad';
import { api, ApiError } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { unregisterStaffDevice } from '@/lib/staff-push';
import { colors, space, type } from '@/lib/theme';
import type { LoginResponse } from '@/lib/types';

const PIN_LENGTH = 4;

/** Через сколько в фоне касса снова просит Face ID или PIN — как 30 минут простоя в вебе. */
const LOCK_AFTER_MS = 30 * 60 * 1000;

/**
 * Защита сессии:
 * - в переключателе приложений содержимое скрыто размытием;
 * - при холодном старте и после долгого фона — Face ID, запасной путь — вход по PIN.
 */
export function SessionLock() {
  const token = useSession((s) => s.token);
  const locked = useSession((s) => s.locked);
  const [obscured, setObscured] = useState(AppState.currentState !== 'active');
  const backgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);
  const autoPrompted = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setObscured(false);
        if (backgroundAt.current && Date.now() - backgroundAt.current > LOCK_AFTER_MS) {
          autoPrompted.current = false;
          useSession.getState().lock();
        }
        backgroundAt.current = null;
      } else {
        // Системный запрос Face ID тоже делает приложение неактивным — его не прячем.
        if (!prompting.current) setObscured(true);
        if (state === 'background' && backgroundAt.current === null) backgroundAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  // Есть ли вообще Face ID / отпечаток. Без них кнопка «Разблокировать» молча ничего
  // не делала — на Android без настроенного отпечатка касса открывалась только выходом.
  const [biometrics, setBiometrics] = useState<boolean | null>(null);
  useEffect(() => {
    void (async () => {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      setBiometrics(ok);
    })().catch(() => setBiometrics(false));
  }, []);

  const unlockWithBiometrics = async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const available =
        (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!available) return;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Разблокировать Titan HUB',
        cancelLabel: 'Отмена',
        fallbackLabel: 'Ввести код телефона',
      });
      if (result.success) {
        haptic.success();
        useSession.getState().unlock();
      }
    } finally {
      prompting.current = false;
    }
  };

  useEffect(() => {
    if (locked && !obscured && !autoPrompted.current) {
      autoPrompted.current = true;
      void unlockWithBiometrics();
    }
    if (!locked) autoPrompted.current = false;
  }, [locked, obscured]);

  if (!token || (!locked && !obscured)) return null;

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
      {/* На Android размытие слабее и тинт systemMaterial не применяется — сквозь него
          читаются ники и суммы открытых чеков. Блокировка обязана скрывать кассу, поэтому
          там сплошная подложка вместо стекла. */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={100} tint="systemMaterial" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      )}
      {locked && <LockedContent biometrics={biometrics === true} onBiometrics={() => void unlockWithBiometrics()} />}
    </Animated.View>
  );
}

/**
 * Экран блокировки: Face ID / отпечаток (если настроены) и PIN того же сотрудника прямо
 * здесь. Раньше «Войти по PIN» выходило из кассы целиком, и после каждого холодного старта
 * приходилось входить заново.
 */
function LockedContent({ biometrics, onBiometrics }: { biometrics: boolean; onBiometrics: () => void }) {
  const user = useSession((s) => s.user);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const verify = async (code: string) => {
    setBusy(true);
    try {
      // userId — проверяем PIN именно этого сотрудника, а не любого в клубе.
      const res = await api.post<LoginResponse>('/auth/login/pin', { pin: code, userId: user?.id }, { auth: false });
      haptic.success();
      await useSession.getState().signIn(res.token, res.user);
    } catch (error) {
      haptic.error();
      setPin('');
      if (error instanceof ApiError && error.status === 401) setShakeKey((k) => k + 1);
      else Alert.alert('Не удалось разблокировать', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (key: PinKey) => {
    if (busy) return;
    if (key === 'delete') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) void verify(next);
  };

  return (
    <View style={styles.content}>
      <SymbolView name="lock.fill" size={36} tintColor={colors.secondaryLabel} />
      <Text style={[type.title3, styles.title]}>Касса заблокирована</Text>
      <Text style={[type.subhead, styles.secondaryText]}>{user?.nickname ? `${user.nickname}, введите PIN` : 'Введите PIN'}</Text>
      <PinDots length={PIN_LENGTH} filled={busy ? PIN_LENGTH : pin.length} shakeKey={shakeKey} />
      <PinPad onKey={onKey} disabled={busy} canDelete={pin.length > 0} />
      <View style={styles.links}>
        {biometrics && (
          <Pressable style={styles.primary} onPress={onBiometrics} accessibilityRole="button">
            {/* На Android разблокировка — отпечатком: значок лица там вводит в заблуждение. */}
            <SymbolView name={Platform.OS === 'ios' ? 'faceid' : 'touchid'} size={20} tintColor={colors.accent} />
            <Text style={[type.headline, styles.primaryText]}>{Platform.OS === 'ios' ? 'Face ID' : 'Отпечаток'}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => void unregisterStaffDevice().finally(() => useSession.getState().signOut())} hitSlop={12} accessibilityRole="button">
          <Text style={[type.body, styles.secondaryText]}>Другой сотрудник</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  links: { flexDirection: 'row', alignItems: 'center', gap: space.xl, marginTop: space.sm },
  title: { color: colors.label },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: 999,
    backgroundColor: colors.fill,
    marginTop: space.sm,
  },
  primaryText: { color: colors.accent },
  secondaryText: { color: colors.secondaryLabel },
});
