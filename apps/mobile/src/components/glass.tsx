import { GlassView as ExpoGlassView, type GlassViewProps } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Дольше любой анимации появления в приложении (FadeIn — 300 мс, карточки кассы — 220 мс). */
const SETTLE_MS = 450;

/**
 * GlassView, который не остаётся «пустым».
 *
 * Стекло iOS 26 (UIGlassEffect) не прорисовывается, если в момент применения эффекта
 * кто-то из родителей прозрачен: карточка появляется с анимацией FadeIn, переход-зум
 * на время прячет исходную карточку. Тогда стекло так и остаётся без фона и границ —
 * видно только содержимое. Эффект заново создаётся, только когда меняется его
 * параметр, поэтому после появления (и по `refreshKey`) переключаем `isInteractive`
 * туда и обратно: модуль сбрасывает эффект и применяет его, уже при полной видимости.
 *
 * На Android стекла нет (плоская поверхность из src/compat) — там обёртка ничего не делает.
 */
export function GlassView({ isInteractive = false, refreshKey, ...rest }: GlassViewProps & { refreshKey?: string | number }) {
  const [settled, setSettled] = useState(Platform.OS !== 'ios');

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const reset = setTimeout(() => setSettled(false), 0);
    const settle = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => {
      clearTimeout(reset);
      clearTimeout(settle);
    };
  }, [refreshKey]);

  return <ExpoGlassView {...rest} isInteractive={settled ? isInteractive : !isInteractive} />;
}
