/**
 * Системные ссылки до маршрутизации. Служебную ссылку входа на локальный стенд
 * (`titanhub://dev-login…`) обрабатывает сессия (lib/session.ts), маршрута у неё нет.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes('dev-login')) return '/';
  return path;
}
