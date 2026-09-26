import { BlurView } from 'expo-blur';
import * as LocalAuthentication from 'expo-local-authentication';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

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
      {locked && (
        <View style={styles.content}>
          <SymbolView name="lock.fill" size={44} tintColor={colors.secondaryLabel} />
          <Text style={[type.title3, styles.title]}>Касса заблокирована</Text>
          <Pressable style={styles.primary} onPress={() => void unlockWithBiometrics()} accessibilityRole="button">
            {/* На Android разблокировка — отпечатком: значок лица там вводит в заблуждение. */}
            <SymbolView name={Platform.OS === 'ios' ? 'faceid' : 'touchid'} size={22} tintColor={colors.accent} />
            <Text style={[type.headline, styles.primaryText]}>Разблокировать</Text>
          </Pressable>
          <Pressable onPress={() => void useSession.getState().signOut()} hitSlop={12} accessibilityRole="button">
            <Text style={[type.body, styles.secondaryText]}>Войти по PIN</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
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
