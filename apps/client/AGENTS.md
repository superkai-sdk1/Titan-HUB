# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Приложение

Titan Resident — клиентское приложение клуба (iOS + Android): бонусы, депозит/долг, история, оплата через СБП, уведомления. Полное описание — `docs/CLIENT_APP.md` в корне репозитория.

- Оформление фирменное тёмное (как веб-кошелёк `apps/wallet`) и ОДИНАКОВОЕ на обеих платформах: цвета из `src/lib/theme.ts`, без PlatformColor, SwiftUI и слоя совместимости `apps/mobile`.
- Нативные папки `ios/` и `android/` не хранятся в git — они генерируются `npx expo prebuild` из `app.json` и `plugins/`.
- Все запросы идут через `src/lib/api.ts`; в демо-режиме их обслуживает `src/lib/demo.ts`. Новый эндпоинт → добавить его и в демо, иначе демо покажет ошибку.
- Деньги не проводятся офлайн и не ставятся в очередь: оплата — только онлайн-платёж через сервер, зачисление по вебхуку банка.
- ESLint (правила React Compiler) держать чистым: shared value через `.set()`, без setState/записи в ref во время рендера, опрос и таймеры — через `useEffectEvent`.

## Перед коммитом

```bash
npm run typecheck && npm run lint
npx expo export --platform ios && npx expo export --platform android
```
