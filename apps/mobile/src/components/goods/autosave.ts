import { useEffect, useEffectEvent, useRef, useState } from 'react';

const DELAY_MS = 1200;

/**
 * Черновик документа сохраняется сам: через секунду после последней правки. Уйти из
 * редактора можно в любой момент — ничего не теряется, и не нужен диалог «Сохранить?».
 *
 * `key` — отпечаток содержимого: сменился — пора сохранять. `flush` дожидается начатого
 * сохранения и отменяет отложенное: перед проведением документа, чтобы не родился
 * лишний черновик. Возвращает время последнего удачного сохранения.
 */
export function useAutosave(key: string, enabled: boolean, save: () => Promise<void>) {
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Открытый черновик не пересохраняем, пока его не тронули.
  const initialKey = useRef(key);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const run = useEffectEvent(() => {
    timer.current = null;
    const job = save()
      .then(() => setSavedAt(new Date()))
      .catch(() => {
        // Сеть пропала — сохраним при следующей правке; проведение покажет ошибку само.
      });
    inflight.current = job;
  });

  useEffect(() => {
    if (!enabled || key === initialKey.current) return;
    timer.current = setTimeout(run, DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [key, enabled]);

  const flush = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
  };

  return { savedAt, flush };
}
