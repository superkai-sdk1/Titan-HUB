import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

/**
 * Прогулка по экранам для проверки сборки в симуляторе без касаний: маршруты через запятую
 * в `EXPO_PUBLIC_LOCAL_TOUR`, пауза — `EXPO_PUBLIC_LOCAL_TOUR_MS`. Только локальный стенд
 * (`EXPO_PUBLIC_LOCAL_STACK=1`); в обычной сборке строка пустая и компонент ничего не делает.
 */
const TOUR: string = process.env.EXPO_PUBLIC_LOCAL_STACK === '1' ? (process.env.EXPO_PUBLIC_LOCAL_TOUR ?? '') : '';
const STEP_MS = Number(process.env.EXPO_PUBLIC_LOCAL_TOUR_MS ?? 5000);

export function LocalTour() {
  const router = useRouter();
  useEffect(() => {
    const routes = TOUR.split(',').map((r) => r.trim()).filter(Boolean);
    if (routes.length === 0) return;
    const timers = routes.map((route, index) =>
      setTimeout(() => {
        if (route === 'back') router.back();
        else router.navigate(route as Href);
      }, STEP_MS * (index + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, [router]);
  return null;
}
