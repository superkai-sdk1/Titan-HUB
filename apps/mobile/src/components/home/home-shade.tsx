import { BlurView } from 'expo-blur';
import { useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { GlassView } from '@/components/glass';
import { Text } from '@/components/text';
import { connectHa, disconnectHa, reconnectHa, useHa } from '@/lib/home-assistant';
import { homeSummary, turnOffZones } from '@/lib/home-control';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { useSmartHome, useSmartHomeToken, zoneDevices, zoneEntityIds, type Zone } from '@/lib/smart-home-api';
import { colors, space, type } from '@/lib/theme';

import { IS_IOS } from './home-surface';
import { ZoneSection } from './home-tiles';

/**
 * Шторка «Свет и климат» на главной кассы: язычок под строкой состояния показывает, что
 * горит, а потянув его вниз (или коснувшись), кассир открывает все помещения клуба со
 * светом и кондиционерами. Сворачивается движением вверх за ручку внизу, касанием фона,
 * кнопкой «Назад» на Android и сама — при уходе с кассы.
 *
 * iOS — как Пункт управления: экран размывается, плитки Liquid Glass. Android — как
 * шторка быстрых настроек: затемнение и плотная панель с тональными плитками.
 */

/**
 * Размытие iOS меняет силу, а не прозрачность: UIVisualEffectView под полупрозрачным
 * родителем рисуется без размытия, пока прозрачность не вернётся к 1.
 */
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const BLUR_INTENSITY = 70;

/** Сколько места язычок занимает под строкой состояния — касса сдвигает шапку на столько. */
export const HANDLE_SPACE = 40;
const HANDLE_HEIGHT = 30;
const MAX_COLUMN = 680;
const SPRING = { damping: 28, stiffness: 280, mass: 1 } as const;
/** Скорость пальца (pt/с), при которой шторка доезжает сама, даже если вытянута чуть-чуть. */
const FLING = 450;

export type HomeShadeModel = { ready: boolean; zones: Zone[]; url: string | null; token: string | null };

/**
 * Есть ли что показывать: Home Assistant подключён в «Интеграциях» и хотя бы в одном
 * помещении выбраны устройства. Иначе касса выглядит как раньше, без язычка.
 */
export function useHomeShade(): HomeShadeModel {
  const role = useSession((s) => s.user?.role);
  const allowed = role === 'owner' || role === 'staff';
  const config = useSmartHome(allowed);
  const token = useSmartHomeToken();
  const data = config.data;
  const zones = useMemo(() => (data?.zones ?? []).filter((zone) => zoneDevices(zone).length > 0), [data]);
  const url = data?.url ?? null;
  return { ready: allowed && !!data?.hasToken && !!url && !!token && zones.length > 0, zones, url, token };
}

/** Что горит — на язычке, чтобы видеть, не открывая шторку. */
function HandleSummary({ zones }: { zones: Zone[] }) {
  const status = useHa((s) => s.status);
  const entities = useHa((s) => s.entities);
  const summary = homeSummary(zones, entities);

  let content: ReactNode;
  if (status === 'connecting' && Object.keys(entities).length === 0) {
    content = (
      <>
        <ActivityIndicator size="small" />
        <Text style={[type.footnote, styles.handleText]}>Свет и климат</Text>
      </>
    );
  } else if (status === 'offline' || status === 'auth_failed') {
    content = (
      <>
        <SymbolView name="wifi.slash" size={13} weight="semibold" tintColor={colors.orange} />
        <Text style={[type.footnote, styles.handleText]}>Дом не на связи</Text>
      </>
    );
  } else if (!summary.anyOn) {
    content = (
      <>
        <SymbolView name="lightbulb" size={14} weight="semibold" tintColor={colors.secondaryLabel} />
        <Text style={[type.footnote, styles.handleText]}>Свет и климат</Text>
      </>
    );
  } else {
    content = (
      <>
        {summary.lightsOn > 0 && (
          <>
            <SymbolView name="lightbulb.fill" size={14} tintColor={colors.yellow} />
            <Text style={[type.footnote, styles.handleText, styles.count]}>{summary.lightsOn}</Text>
          </>
        )}
        {summary.climatesOn > 0 && (
          <>
            <SymbolView name="snowflake" size={13} weight="semibold" tintColor={colors.cyan} />
            <Text style={[type.footnote, styles.handleText, styles.count]}>{summary.climatesOn}</Text>
          </>
        )}
      </>
    );
  }

  return (
    <View style={styles.handleRow}>
      {content}
      <SymbolView name="chevron.down" size={11} weight="bold" tintColor={colors.tertiaryLabel} />
    </View>
  );
}

function Notice({ icon, tone, text, spinner, children }: { icon?: SFSymbol; tone?: ColorValue; text: string; spinner?: boolean; children?: ReactNode }) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      {spinner ? <ActivityIndicator size="small" /> : icon ? <SymbolView name={icon} size={14} weight="semibold" tintColor={tone} /> : null}
      <Text style={[type.footnote, styles.noticeText]}>{text}</Text>
      {children}
    </View>
  );
}

/** Строка под заголовком — только когда что-то не так: нет связи, токен, отказ команды. */
function StatusLine() {
  const status = useHa((s) => s.status);
  const failure = useHa((s) => s.failure);
  if (failure) return <Notice icon="exclamationmark.triangle" tone={colors.red} text={failure} />;
  if (status === 'connecting') return <Notice spinner text="Подключаемся к Home Assistant…" />;
  if (status === 'auth_failed') {
    return <Notice icon="exclamationmark.triangle" tone={colors.red} text="Home Assistant не принял токен — владелец обновит его в «Интеграциях»." />;
  }
  if (status === 'offline') {
    return (
      <Notice icon="wifi.slash" tone={colors.orange} text="Нет связи с домом. Телефон должен быть в Wi‑Fi клуба.">
        <Pressable hitSlop={8} onPress={reconnectHa} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
          <Text style={[type.footnote, styles.retry]}>Повторить</Text>
        </Pressable>
      </Notice>
    );
  }
  return null;
}

export function HomeShade({ home, bandWidth }: { home: HomeShadeModel; bandWidth: number }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [shown, setShown] = useState(false);
  const progress = useSharedValue(0);
  const panelHeight = useSharedValue(window.height * 0.6);
  const dragStart = useSharedValue(0);
  const entities = useHa((s) => s.entities);
  const anyOn = homeSummary(home.zones, entities).anyOn;

  // Связь с Home Assistant живёт, пока на кассе есть шторка.
  const idsKey = zoneEntityIds(home.zones).join(',');
  useEffect(() => {
    if (!home.url || !home.token) return;
    connectHa({ url: home.url, token: home.token, entityIds: idsKey ? idsKey.split(',') : [] });
  }, [home.url, home.token, idsKey]);
  useEffect(() => () => disconnectHa(), []);

  const settled = (open: boolean) => {
    if (open) haptic.light();
    else setShown(false);
  };

  const animateTo = (open: boolean, velocity = 0) => {
    'worklet';
    progress.set(
      withSpring(open ? 1 : 0, { ...SPRING, velocity }, (finished) => {
        if (finished) runOnJS(settled)(open);
      }),
    );
  };

  const open = () => {
    setShown(true);
    animateTo(true);
  };
  const close = () => animateTo(false);

  // Ушли с кассы — шторка не ждёт там открытой.
  const navigation = useNavigation();
  const collapseNow = useEffectEvent(() => {
    progress.set(0);
    setShown(false);
  });
  useEffect(() => navigation.addListener('blur', () => collapseNow()), [navigation]);

  const onBack = useEffectEvent(() => {
    close();
    return true;
  });
  useEffect(() => {
    if (!shown) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [shown]);

  const clamp = (value: number) => {
    'worklet';
    return Math.min(1, Math.max(0, value));
  };

  const openPan = Gesture.Pan()
    .activeOffsetY(6)
    .failOffsetX([-24, 24])
    .onStart(() => {
      dragStart.set(progress.get());
      runOnJS(setShown)(true);
    })
    .onUpdate((e) => {
      progress.set(clamp(dragStart.get() + e.translationY / Math.max(1, panelHeight.get())));
    })
    .onEnd((e) => {
      const toOpen = e.velocityY > FLING || (e.velocityY > -FLING && progress.get() > 0.3);
      animateTo(toOpen, e.velocityY / Math.max(1, panelHeight.get()));
    });
  const handleGesture = Gesture.Exclusive(
    openPan,
    Gesture.Tap().onEnd(() => {
      runOnJS(open)();
    }),
  );

  const closePan = () =>
    Gesture.Pan()
      .activeOffsetY(-6)
      .failOffsetX([-24, 24])
      .onStart(() => {
        dragStart.set(progress.get());
      })
      .onUpdate((e) => {
        progress.set(clamp(dragStart.get() + e.translationY / Math.max(1, panelHeight.get())));
      })
      .onEnd((e) => {
        const toOpen = !(e.velocityY < -FLING || (e.velocityY < FLING && progress.get() < 0.7));
        animateTo(toOpen, e.velocityY / Math.max(1, panelHeight.get()));
      });
  const headerGesture = closePan();
  const grabberGesture = Gesture.Exclusive(
    closePan(),
    Gesture.Tap().onEnd(() => {
      animateTo(false);
    }),
  );

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (progress.get() - 1) * (panelHeight.get() + 24) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const blurProps = useAnimatedProps(() => ({ intensity: progress.get() * BLUR_INTENSITY }));
  const handleStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.get() * 3),
    transform: [{ translateY: progress.get() * 16 }],
  }));

  const columnWidth = Math.min(MAX_COLUMN, window.width - insets.left - insets.right - space.lg * 2);
  // Заголовок, строка статуса и ручка — остальное место под помещения, дальше прокрутка.
  const chrome = insets.top + space.sm + 64 + 40;
  const scrollMax = Math.max(220, window.height * 0.88 - chrome);

  const offAll = () => {
    haptic.warning();
    Alert.alert('Выключить всё?', 'Свет и кондиционеры во всех помещениях.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выключить', style: 'destructive', onPress: () => void turnOffZones(home.zones) },
    ]);
  };

  return (
    <>
      {/* Язычок под строкой состояния: тянуть вниз или коснуться. */}
      <GestureDetector gesture={handleGesture}>
        <Animated.View
          style={[styles.band, { top: insets.top, width: bandWidth }, handleStyle]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Свет и климат"
          accessibilityHint="Открывает управление светом и кондиционерами"
          onAccessibilityTap={open}>
          {IS_IOS ? (
            <GlassView isInteractive glassEffectStyle="regular" style={styles.handle}>
              <HandleSummary zones={home.zones} />
            </GlassView>
          ) : (
            <View style={[styles.handle, styles.handleAndroid]}>
              <HandleSummary zones={home.zones} />
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Фон под шторкой: живёт, только пока её тянут или она открыта, — и перекрывает язычок. */}
      {shown && (
        <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
          {IS_IOS ? (
            <AnimatedBlurView tint="systemThinMaterial" animatedProps={blurProps} style={StyleSheet.absoluteFill} />
          ) : (
            <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Свернуть свет и климат" />
        </View>
      )}

      <Animated.View
        style={[styles.panel, !IS_IOS && styles.panelAndroid, { paddingTop: insets.top + space.sm }, panelStyle]}
        pointerEvents={shown ? 'box-none' : 'none'}
        onLayout={(e) => panelHeight.set(e.nativeEvent.layout.height)}>
        <View style={[styles.column, { width: columnWidth }]}>
          <GestureDetector gesture={headerGesture}>
            <View style={styles.header}>
              <Text style={[type.title2, styles.title]} accessibilityRole="header" numberOfLines={1}>
                Свет и климат
              </Text>
              {anyOn && (
                <Pressable
                  onPress={offAll}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Выключить всё"
                  android_ripple={{ color: 'rgba(127,127,127,0.2)' }}
                  style={({ pressed }) => [styles.offAll, IS_IOS && pressed && styles.pressed]}>
                  <SymbolView name="power" size={13} weight="bold" tintColor={colors.red} />
                  <Text style={[type.footnote, styles.offAllText]}>Выключить всё</Text>
                </Pressable>
              )}
            </View>
          </GestureDetector>
          <StatusLine />
          <ScrollView style={[styles.scroll, { maxHeight: scrollMax }]} contentContainerStyle={styles.zones} showsVerticalScrollIndicator={false}>
            {home.zones.map((zone) => (
              <ZoneSection key={zone.id} zone={zone} width={columnWidth} />
            ))}
          </ScrollView>
          <GestureDetector gesture={grabberGesture}>
            <View style={styles.grabberArea} accessible accessibilityRole="button" accessibilityLabel="Свернуть" onAccessibilityTap={close}>
              <View style={styles.grabber} />
            </View>
          </GestureDetector>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, height: HANDLE_SPACE, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  handle: { height: HANDLE_HEIGHT, borderRadius: HANDLE_HEIGHT / 2, paddingHorizontal: 14, justifyContent: 'center', overflow: 'hidden' },
  handleAndroid: { backgroundColor: colors.floating, elevation: 3 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  handleText: { color: colors.label, fontWeight: '600' },
  count: { fontVariant: ['tabular-nums'], marginRight: 2 },

  backdrop: { zIndex: 25 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  panelAndroid: {
    backgroundColor: colors.floating,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    elevation: 12,
  },
  column: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: 4 },
  title: { flex: 1, color: colors.label },
  offAll: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 34, borderRadius: 17, backgroundColor: colors.fill, overflow: 'hidden' },
  offAllText: { color: colors.red, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  noticeText: { flex: 1, color: colors.secondaryLabel },
  retry: { color: colors.accent, fontWeight: '600' },
  scroll: { flexGrow: 0, flexShrink: 0 },
  zones: { gap: space.xl, paddingTop: space.xs, paddingBottom: space.sm },
  grabberArea: { height: 36, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: colors.tertiaryLabel },
  pressed: { opacity: 0.55 },
});
