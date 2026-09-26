import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef } from 'react';
import { Platform, type TextInput } from 'react-native';

/** Выезд шторки Android длится ~300 мс; запасной таймер — на случай, если конца перехода не будет. */
const FALLBACK_MS = 450;

/**
 * autoFocus для полей в шторках: `const focus = useAutoFocus(); <TextInput {...focus} />`.
 *
 * Android: клавиатура, поднятая одновременно с выездом шторки, сбивала анимацию —
 * react-native-screens посреди выезда пересчитывал положение шторки над клавиатурой,
 * и шторка «прыгала». Там фокус ставится, когда шторка доехала (`transitionEnd` экрана),
 * а дальше она плавно поднимается вместе с клавиатурой. Поле, появившееся позже (шаг
 * внутри уже открытой шторки), фокусируется запасным таймером — за это время успевает
 * доиграть и перестройка высоты шторки.
 *
 * На iOS — обычный autoFocus: там системная шторка сама согласует выезд с клавиатурой.
 */
export function useAutoFocus(enabled = true) {
  const ref = useRef<TextInput>(null);
  // Контекст, а не useNavigation(): поле может оказаться и вне навигатора — тогда просто таймер.
  const navigation = useContext(NavigationContext);
  const deferred = Platform.OS === 'android' && enabled;

  useEffect(() => {
    if (!deferred) return;
    let unsubscribe: (() => void) | undefined;
    // Один раз: возврат на экран из следующей шторки — тоже transitionEnd, но фокус там не нужен.
    const focus = () => {
      clearTimeout(timer);
      unsubscribe?.();
      ref.current?.focus();
    };
    const timer = setTimeout(focus, FALLBACK_MS);
    unsubscribe = navigation?.addListener('transitionEnd' as never, ((event: { data?: { closing?: boolean } }) => {
      if (!event.data?.closing) focus();
    }) as never);
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [deferred, navigation]);

  return { ref, autoFocus: Platform.OS === 'android' ? false : enabled };
}
