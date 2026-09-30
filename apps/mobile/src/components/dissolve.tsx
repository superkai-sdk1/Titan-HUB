import { Atlas, Canvas, rect, useRSXformBuffer, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Easing, runOnJS, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Распыление карточки — как удаление сообщения в Telegram. Снимок карточки режется на
 * мелкие «пылинки»; они волной слева направо срываются, улетают вверх-вправо и тают.
 * Рисует Skia (Atlas — один вызов отрисовки на все пылинки), анимация на UI-потоке.
 */

export type DissolveFrame = { x: number; y: number; width: number; height: number };

/** Размер пылинки, pt. Мельче — красивее, но больше спрайтов (карточка ≈ 3–4 тыс.). */
const TILE = 3;
/** Запас холста вокруг карточки: пылинки улетают за её края. */
const MARGIN = 80;
const DURATION = 700;
/** Доля времени на «волну»: правый край срывается позже левого. */
const WAVE = 0.45;

/** Детерминированный «шум» 0…1: рендер обязан быть чистым, Math.random тут нельзя. */
function noise(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function Dissolve({ image, frame, onDone }: { image: SkImage; frame: DissolveFrame; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const cols = Math.max(1, Math.ceil(frame.width / TILE));
  const rows = Math.max(1, Math.ceil(frame.height / TILE));
  const count = cols * rows;
  // Снимок в пикселях экрана: сколько пикселей картинки в одном pt.
  const pxPerPt = image.width() / Math.max(1, frame.width);

  const sprites = useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      out.push(rect(col * TILE * pxPerPt, row * TILE * pxPerPt, TILE * pxPerPt, TILE * pxPerPt));
    }
    return out;
  }, [count, cols, pxPerPt]);

  // Случайность пылинок считаем один раз: задержка (волна + разброс), разлёт, подъём.
  const seeds = useMemo(() => {
    const delay: number[] = [];
    const vx: number[] = [];
    const vy: number[] = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      delay.push((col / cols) * WAVE + noise(i) * 0.12);
      vx.push(18 + noise(i + 0.31) * 70);
      vy.push(20 + noise(i + 0.67) * 80);
    }
    return { delay, vx, vy };
  }, [count, cols]);

  const progress = useSharedValue(0);
  // Родитель передаёт новый onDone на каждом рендере — анимация из-за этого не перезапускается.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const finish = () => onDoneRef.current();
    progress.set(
      withTiming(1, { duration: reduceMotion ? 1 : DURATION, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(finish)();
      }),
    );
  }, [progress, reduceMotion]);

  const transforms = useRSXformBuffer(count, (val, i) => {
    'worklet';
    const col = i % cols;
    const row = Math.floor(i / cols);
    const t = Math.min(1, Math.max(0, (progress.value - seeds.delay[i]) / (1 - WAVE - 0.12)));
    const eased = t * t;
    // Пылинка уменьшается до нуля — так она «тает», без отдельной прозрачности.
    const size = (1 - t) / pxPerPt;
    const x = MARGIN + col * TILE + seeds.vx[i] * eased + (TILE * t) / 2;
    const y = MARGIN + row * TILE - seeds.vy[i] * eased + (TILE * t) / 2;
    val.set(size, 0, x, y);
  });

  return (
    <Canvas
      pointerEvents="none"
      style={[
        styles.canvas,
        { left: frame.x - MARGIN, top: frame.y - MARGIN, width: frame.width + MARGIN * 2, height: frame.height + MARGIN * 2 },
      ]}>
      <Atlas image={image} sprites={sprites} transforms={transforms} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute' },
});
