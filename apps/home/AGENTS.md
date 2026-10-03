# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Приложение

Titan Home — киоск самообслуживания на Android-планшете кабинки: действующий счёт, меню и заказ (без фото), чат с администратором, оплата по QR СБП с чаевыми, оценка вечера и панель «Свет и климат» (Home Assistant). Полное описание — `docs/HOME_APP.md` в корне репозитория.

- Только Android (`platforms: ["android"]`), пакет `ru.titan.home`. Тема фирменная тёмная, как у My Titan: цвета из `src/lib/theme.ts`, иконки — MaterialCommunityIcons.
- Нативные папки `android/` не хранятся в git — генерируются `npx expo prebuild` из `app.json` и `plugins/`.
- Нативный модуль киоска — `modules/titan-kiosk` (Kotlin): закрепление экрана, владелец устройства, полный экран, «экран не гаснет», ориентация, системные настройки. Автолинкуется из `modules/`.
- Все запросы к клубу — через `src/lib/api.ts` (хост клуба + tablet-токен зоны).
- Home Assistant — **нативный** модуль `modules/titan-ha` (Kotlin, OkHttp WebSocket) + foreground-сервис `HaService`: держит связь постоянно, сам переподключается, стартует после перезагрузки, хранит адрес/токен/устройства на планшете. JS (`src/lib/home-assistant.ts`) только читает снимок и шлёт команды; семантика устройств — `src/lib/room.ts`. Не переносить соединение обратно в JS.
- Раскладка: панель «Свет и климат» справа в альбомной и снизу в книжной (`components/room-dock.tsx`, размеры `DOCK_*`). Экраны меряют свою область, а не окно (окно включает панель).
- Деньги считает сервер: итог счёта на экране — та же формула, что `apps/api/src/lib/money.ts` (`src/lib/money.ts`), сумма QR — только сервер.
- ESLint (правила React Compiler) держать чистым: без setState/`Date.now()` в рендере, таймеры и обработчики — через `useEffectEvent`/эффекты.

## Проверка

```bash
npm run typecheck && npm run lint
npx expo export --platform android
```

Сборка и установка на планшет: `npm run android:device`. Для локального стенда (http на 10.0.2.2 / 192.168.x.x) — `EXPO_PUBLIC_LOCAL_STACK=1 npm run android:device`.
