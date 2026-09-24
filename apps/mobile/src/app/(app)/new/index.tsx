import { Redirect } from 'expo-router';

/**
 * Вкладка «Новый» не открывается как экран (она `disabled` и открывает шторку создания чека).
 * Маршрут нужен таб-бару; если сюда всё же перешли по ссылке — возвращаем в кассу.
 */
export default function NewTabFallback() {
  return <Redirect href="/pos" />;
}
