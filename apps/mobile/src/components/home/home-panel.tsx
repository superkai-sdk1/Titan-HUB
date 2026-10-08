import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import { GestureDetector, GestureHandlerRootView, type ComposedGesture, type GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useAnimatedStyle, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Text } from '@/components/text';
import { reconnectHa, useHa } from '@/lib/home-assistant';
import { homeSummary, turnOffZones } from '@/lib/home-control';
import { haptic } from '@/lib/haptics';
import type { Zone } from '@/lib/smart-home-api';
import { colors, space, type } from '@/lib/theme';

import { HEM_RADIUS } from './home-hem';
import { IS_IOS } from './home-surface';
import { ZoneSection } from './home-tiles';

/**
 * Раскрытая шторка «Свет и климат». Живёт вне вкладки — поверх всего окна, в том числе
 * таб-бара и плашки смены: iOS — FullWindowOverlay (вид прямо в окне, без презентации
 * контроллера, поэтому начатое на краю шторки движение пальца не прерывается), Android —
 * прозрачный Modal поверх своей панели вкладок. У обоих свой корень жестов.
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
const MAX_COLUMN = 680;
const GRABBER_HEIGHT = 36;

/** Слой поверх всего окна. */
export function ShadeLayer({ onRequestClose, children }: { onRequestClose: () => void; children: ReactNode }) {
  if (IS_IOS) {
    return (
      <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
      </FullWindowOverlay>
    );
  }
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent hardwareAccelerated onRequestClose={onRequestClose}>
      <GestureHandlerRootView style={styles.fill}>{children}</GestureHandlerRootView>
    </Modal>
  );
}

type ShadePanelProps = {
  zones: Zone[];
  /** 0 — свёрнута, 1 — раскрыта. */
  progress: SharedValue<number>;
  /** Путь панели от свёрнутой до раскрытой, pt. */
  travel: DerivedValue<number>;
  headerGesture: GestureType | ComposedGesture;
  grabberGesture: GestureType | ComposedGesture;
  onClose: () => void;
  onPanelLayout: (height: number) => void;
};

export function ShadePanel({ zones, progress, travel, headerGesture, grabberGesture, onClose, onPanelLayout }: ShadePanelProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const entities = useHa((s) => s.entities);
  const anyOn = homeSummary(zones, entities).anyOn;
  // Высота заголовка со строкой статуса (строка появляется, только когда что-то не так).
  const [chromeHeight, setChromeHeight] = useState(52);

  const columnWidth = Math.min(MAX_COLUMN, window.width - insets.left - insets.right - space.lg * 2);
  // Шторка над таб-баром и плашкой смены — ей доступна вся высота окна до safe area.
  const scrollMax = Math.max(160, window.height - insets.bottom - space.md - (insets.top + space.sm) - chromeHeight - GRABBER_HEIGHT - space.sm * 2);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (progress.get() - 1) * travel.get() }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const blurProps = useAnimatedProps(() => ({ intensity: progress.get() * BLUR_INTENSITY }));

  const offAll = () => {
    haptic.warning();
    Alert.alert('Выключить всё?', 'Свет и кондиционеры во всех помещениях.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выключить', style: 'destructive', onPress: () => void turnOffZones(zones) },
    ]);
  };

  return (
    <>
      <View style={StyleSheet.absoluteFill}>
        {IS_IOS ? (
          <AnimatedBlurView tint="systemThinMaterial" animatedProps={blurProps} style={StyleSheet.absoluteFill} />
        ) : (
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
        )}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Свернуть свет и климат" />
      </View>

      <Animated.View
        style={[styles.panel, !IS_IOS && styles.panelAndroid, { paddingTop: insets.top + space.sm }, panelStyle]}
        // iOS: панели как таковой нет — пустое место между плитками сворачивает шторку, как
        // Пункт управления. Android: плотная панель сама держит касания.
        pointerEvents={IS_IOS ? 'box-none' : 'auto'}
        onLayout={(e) => onPanelLayout(e.nativeEvent.layout.height)}>
        <View style={[styles.column, { width: columnWidth }]}>
          <View style={styles.chrome} onLayout={(e) => setChromeHeight(e.nativeEvent.layout.height)}>
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
          </View>
          <ScrollView style={[styles.scroll, { maxHeight: scrollMax }]} contentContainerStyle={styles.zones} showsVerticalScrollIndicator={false}>
            {zones.map((zone) => (
              <ZoneSection key={zone.id} zone={zone} width={columnWidth} />
            ))}
          </ScrollView>
          <GestureDetector gesture={grabberGesture}>
            <View style={styles.grabberArea} accessible accessibilityRole="button" accessibilityLabel="Свернуть" onAccessibilityTap={onClose}>
              <View style={styles.grabber} />
            </View>
          </GestureDetector>
        </View>
      </Animated.View>
    </>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  // Тот же цвет и скругление, что у края шторки на кассе: свёрнутая панель и есть этот край.
  panelAndroid: {
    backgroundColor: colors.floating,
    borderBottomLeftRadius: HEM_RADIUS,
    borderBottomRightRadius: HEM_RADIUS,
    elevation: 12,
  },
  column: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: 4 },
  title: { flex: 1, color: colors.label },
  offAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: colors.fill,
    overflow: 'hidden',
  },
  offAllText: { color: colors.red, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  noticeText: { flex: 1, color: colors.secondaryLabel },
  retry: { color: colors.accent, fontWeight: '600' },
  scroll: { flexGrow: 0, flexShrink: 0 },
  zones: { gap: space.xl, paddingTop: space.xs, paddingBottom: space.sm },
  chrome: { gap: space.sm },
  grabberArea: { height: GRABBER_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: colors.tertiaryLabel },
  pressed: { opacity: 0.55 },
});
