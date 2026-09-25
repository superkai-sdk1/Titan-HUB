import { useEffect, useState } from 'react';

/** Текущее время, обновляемое раз в `intervalMs` — для таймеров и живой аренды. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
