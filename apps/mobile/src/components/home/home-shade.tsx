import { useNavigation } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { BackHandler, useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { connectHa, disconnectHa } from '@/lib/home-assistant';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { useSmartHome, useSmartHomeToken, zoneDevices, zoneEntityIds, type Zone } from '@/lib/smart-home-api';

import { Hem, HEM_SPACE } from './home-hem';
import { ShadeLayer, ShadePanel } from './home-panel';
import { IS_IOS } from './home-surface';

export { HEM_RADIUS, HEM_SPACE } from './home-hem';

/**
 * Шторка «Свет и климат» на главной кассы. Свёрнутая — край поднятой шторки под строкой
 * состояния (home-hem.tsx): видно, что горит. Потянув край вниз (или коснувшись), кассир
 * открывает все помещения клуба со светом и кондиционерами — шторка ложится поверх всего
 * окна, вместе с таб-баром и плашкой смены (home-panel.tsx). Сворачивается движением вверх
 * за заголовок или ручку внизу, касанием фона, кнопкой «Назад» на Android и сама — при
 * уходе с кассы.
 *
 * Здесь — то, что живёт всё время, пока касса на экране: связь с Home Assistant, общее
 * состояние шторки и жесты. Слой раскрытой шторки монтируется, только пока её тянут или
 * она открыта.
 */

const SPRING = { damping: 28, stiffness: 280, mass: 1 } as const;
/** Скорость пальца (pt/с), при которой шторка доезжает сама, даже если вытянута чуть-чуть. */
const FLING = 450;
/** iOS: свёрнутая панель прячется выше экрана с этим запасом (тень и скругления не видны). */
const HIDE_GAP = 24;

export type HomeShadeModel = { ready: boolean; zones: Zone[]; url: string | null; token: string | null };

/**
 * Есть ли что показывать: Home Assistant подключён в «Интеграциях» и хотя бы в одном
 * помещении выбраны устройства. Иначе касса выглядит как раньше, без края шторки.
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

export function HomeShade({ home, bandWidth, glassKey = 0 }: { home: HomeShadeModel; bandWidth: number; glassKey?: number }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Слой раскрытой шторки смонтирован: её тянут, она открыта или закрывается.
  const [shown, setShown] = useState(false);
  // Сколько раз шторка закрывалась — стекло края применяется заново, когда он снова виден.
  const [closings, setClosings] = useState(0);
  const progress = useSharedValue(0);
  // До замера считаем шторку высотой в экран: так она гарантированно спрятана.
  const panelHeight = useSharedValue(window.height);
  const dragStart = useSharedValue(0);
  // Открытие касанием ждёт, пока слой смонтируется и панель измерится, — иначе первый кадр
  // анимации пропадает в задержке появления окна, а путь считается по оценке высоты.
  const openPending = useSharedValue(false);

  // Android: низ плотной свёрнутой панели совпадает с краем на кассе — палец тянет сам край,
  // 1:1. iOS: панель прозрачная (размывается весь экран) и прячется выше экрана целиком.
  const hemBottom = insets.top + HEM_SPACE;
  const travel = useDerivedValue(() => (IS_IOS ? panelHeight.get() + HIDE_GAP : Math.max(1, panelHeight.get() - hemBottom)), [hemBottom]);

  // Связь с Home Assistant живёт, пока на кассе есть шторка, — не пока открыт её слой.
  const idsKey = zoneEntityIds(home.zones).join(',');
  useEffect(() => {
    if (!home.url || !home.token) return;
    connectHa({ url: home.url, token: home.token, entityIds: idsKey ? idsKey.split(',') : [] });
  }, [home.url, home.token, idsKey]);
  useEffect(() => () => disconnectHa(), []);

  const settled = (open: boolean) => {
    if (open) {
      haptic.light();
      return;
    }
    setShown(false);
    setClosings((n) => n + 1);
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
    if (shown) {
      animateTo(true);
      return;
    }
    openPending.set(true);
    setShown(true);
  };
  const close = () => animateTo(false);

  const onPanelLayout = (height: number) => {
    panelHeight.set(height);
    if (!openPending.get()) return;
    openPending.set(false);
    animateTo(true);
  };

  // Ушли с кассы — шторка не ждёт там открытой.
  const navigation = useNavigation();
  const collapseNow = useEffectEvent(() => {
    openPending.set(false);
    progress.set(0);
    if (!shown) return;
    setShown(false);
    setClosings((n) => n + 1);
  });
  useEffect(() => navigation.addListener('blur', () => collapseNow()), [navigation]);

  // «Назад» на Android ловит Modal (onRequestClose); это — на кадры, пока он появляется.
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

  // Тянут край: слой шторки монтируется в начале движения, а палец продолжает вести
  // общее значение progress — жест остаётся на крае, под пальцем.
  const openPan = Gesture.Pan()
    .activeOffsetY(6)
    .failOffsetX([-24, 24])
    .onStart(() => {
      dragStart.set(progress.get());
      runOnJS(setShown)(true);
    })
    .onUpdate((e) => {
      progress.set(clamp(dragStart.get() + e.translationY / travel.get()));
    })
    .onEnd((e) => {
      const toOpen = e.velocityY > FLING || (e.velocityY > -FLING && progress.get() > 0.3);
      animateTo(toOpen, e.velocityY / travel.get());
    });
  const hemGesture = Gesture.Exclusive(
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
        progress.set(clamp(dragStart.get() + e.translationY / travel.get()));
      })
      .onEnd((e) => {
        const toOpen = !(e.velocityY < -FLING || (e.velocityY < FLING && progress.get() < 0.7));
        animateTo(toOpen, e.velocityY / travel.get());
      });
  const headerGesture = closePan();
  const grabberGesture = Gesture.Exclusive(
    closePan(),
    Gesture.Tap().onEnd(() => {
      animateTo(false);
    }),
  );

  return (
    <>
      <Hem zones={home.zones} width={bandWidth} progress={progress} gesture={hemGesture} glassKey={`${glassKey}-${closings}`} onOpen={open} />
      {shown && (
        <ShadeLayer onRequestClose={close}>
          <ShadePanel
            zones={home.zones}
            progress={progress}
            travel={travel}
            headerGesture={headerGesture}
            grabberGesture={grabberGesture}
            onClose={close}
            onPanelLayout={onPanelLayout}
          />
        </ShadeLayer>
      )}
    </>
  );
}
