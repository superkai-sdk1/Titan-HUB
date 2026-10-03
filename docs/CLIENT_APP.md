# Клиентское приложение Titan Resident

Приложение для клиентов клуба на iOS и Android: бонусы, депозит и долг, история операций, онлайн-оплата через СБП (депозит, долг, фонд клуба и разовые сборы) и уведомления. Expo SDK 57 (React Native 0.86), без WebView.

- **Код:** `apps/client`
- **iOS:** `ru.titan.resident` (только iPhone), команда Apple `G99YH9UK8C`, App Store Connect app id `6816426909`, TestFlight-группа «Titan Team»
- **Android:** `ru.titan.resident`
- **Сервер:** основной клуб `https://titanpos.ru` (`extra.apiUrl` в `app.json`)
- **Вход:** Telegram-бот кошелька `@titanwalletrobot`

Оформление — фирменное тёмное, как у веб-кошелька Titan Resident (`apps/wallet`): одинаково на обеих платформах, от системной темы не зависит. Приложение, как и `apps/mobile`, ставит зависимости своим `npm` и исключено из pnpm-воркспейса и Docker-контекста.

---

## Экраны

| Экран | Что делает |
| --- | --- |
| `login` | Вход через Telegram, запасной 4-значный код, демо-режим |
| `(tabs)/index` — Кошелёк | Голо-карта с бонусами, депозит и долг, быстрые действия, взносы, прогресс до «Резидента», последние операции |
| `(tabs)/history` — История | Все операции по дням, фильтр «Все / Деньги / Бонусы», догрузка |
| `(tabs)/inbox` — Входящие | Лента уведомлений; при открытии помечаются прочитанными |
| `(tabs)/profile` — Профиль | Фото, личные данные, настройки уведомлений, выход |
| `pay` | Оплата: назначение, сумма, комиссия банка 8 %, СБП, ожидание подтверждения |
| `check/[id]` | Чек: позиции, скидки, итог, способы оплаты |
| `profile-edit`, `bonus-rules` | Правка данных; правила бонусной программы |

Кнопка «+» в центре панели вкладок открывает оплату.

## Вход через бота

1. `POST /api/auth/wallet-code/start {deviceName, platform}` → `ticket`, 4-значный `code`, `deepLink` = `https://t.me/titanwalletrobot?start=login_<deepCode>` (код длинный и одноразовый, живёт 5 минут).
2. Приложение открывает Telegram (`tg://resolve…`, иначе `t.me`). Бот присылает «Вход в Titan Resident — подтвердите вход на устройстве «iPhone 16»» с кнопками **«Да, войти»** и **«Это не я»**. Подтверждение нужно, чтобы пересланная злоумышленником ссылка не дала ему доступ.
3. Приложение раз в 2 секунды и при возврате из Telegram опрашивает `GET /api/auth/wallet-code/status?ticket=` → `ok` (JWT на 30 дней) / `rejected` / `expired` (тогда код тихо перевыпускается).
4. Если Telegram на другом устройстве, можно отправить боту 4-значный код, как в веб-кошельке.

Сессия скользящая: раз в 3 дня приложение меняет токен на свежий через `POST /api/resident/session/refresh`. Это доступно только роли `client`.

## Серверное API (`apps/api/src/modules/resident`)

| Метод | Назначение |
| --- | --- |
| `GET /api/resident/wallet` | Сводка одним запросом: профиль, статус (из тарифов), баланс, бонусы и ближайшее сгорание, правила бонусов, прогресс, взносы, готовность онлайн-оплаты, непрочитанные, настройки |
| `GET /api/resident/feed?kind=all\|money\|bonus&cursor=` | Лента операций (transactions + bonus_history), курсор `<ISO>\|<id>` |
| `GET /api/resident/collections` | Состояние сборов клиента (та же арифметика «пула», что в ростере `/collections/:id`) |
| `GET /api/resident/notifications`, `POST …/read` | Лента уведомлений, отметка прочитанного |
| `POST/DELETE /api/resident/devices` | Push-токен устройства: iPhone — нативный токен APNs, Android — токен Expo Push |
| `PATCH /api/resident/prefs` | Push / Telegram / новости клуба |
| `POST /api/auth/me/payments {purpose, amount, collectionId?}` | Онлайн-платёж; `collectionId` — любой активный сбор, в котором клиент участвует |
| `POST /api/client-broadcasts`, `…/audience`, `GET` | Рассылки из панели (владелец — всем / по статусу / должникам / с депозитом / по опросу; сотрудник — только выбранным) |
| `GET /api/client-broadcasts/recipients` | Клиенты для выборочной отправки: есть ли приложение и привязанный Telegram |
| `GET /api/client-broadcasts/polls` | Последний опрос каждого чата: голоса по вариантам, сколько из них клиенты, «не голосовали». Аудитория `poll: {chatId, options[], notVoted}` |

Миграция `062_client_app.sql`: `app_devices`, `client_notifications`, `client_broadcasts`, колонки входа в `wallet_login_codes`, настройки `client_push_enabled` / `client_news_enabled` в `profiles`.

## Уведомления

`notifyClient()` (`modules/notifications/client.ts`) шлёт каждое событие по трём независимым каналам:
- в ленту приложения (всегда);
- push, если есть устройство и включён push: iPhone — напрямую в Apple (`modules/notifications/apns.ts`, HTTP/2 + ключ .p8), Android — через Expo Push;
- сообщением от бота кошелька, если привязан Telegram.

Автоматические события: начисление и списание бонусов, пополнение депозита, погашение и появление долга, зачисление онлайн-оплаты, статус «Резидент». Рассылки идут с `kind='news'`: клиент может их отключить.

Нажатие на push ведёт по `meta.screen`: `check` → чек, `pay` → оплата, `history`, `home`, иначе «Входящие».

## Демо-режим

Кнопка «Посмотреть демо» на экране входа. Все запросы обслуживает `src/lib/demo.ts`, сеть не нужна. Оплата «проходит» через 2–3 секунды и меняет баланс. Режим нужен:
- для проверки в App Store и Google Play: у проверяющего нет Telegram, привязанного к клубу;
- для скриншотов;
- для знакомства с приложением.

## Что нужно сделать владельцу

1. **Push на iPhone:** в `.env` сервера — ключ APNs команды G99YH9UK8C (один на все приложения команды): `APNS_KEY_P8` (base64 от файла `AuthKey_<ID>.p8` или PEM с `\n`), `APNS_KEY_ID`, `APNS_TEAM_ID`; `APNS_TOPIC` по умолчанию `ru.titan.resident`. Без ключа push на iPhone не уходят (в логе API — `[apns] … не заданы`), лента и бот работают. Сервер шлёт в боевой APNs, а токены отладочных сборок сам переадресует в песочницу.
   **Push на Android (позже):** в `apps/client` выполнить `npx eas-cli login`, `npx eas-cli init` (пропишет `extra.eas.projectId` в `app.json`) и `npx eas-cli credentials` — загрузить ключ FCM V1 из Firebase и положить `google-services.json` рядом с `app.json` (`android.googleServicesFile`). Необязательно: `EXPO_ACCESS_TOKEN` в окружение API — защищённый режим Expo Push.
2. **App Store Connect:** приложение создано и заполнено (тексты, скриншоты, рейтинг 4+, App Privacy, бесплатно во всех странах). Новые сборки — `npm run ios:testflight`; в `app.json` включён плагин `with-scene-lifecycle` (обязателен для iOS 27).
3. **Проверка App Store:** в заметках для проверяющего указать, что вход только через Telegram клуба, а полное демо открывается кнопкой «Посмотреть демо».

## Сборка

```bash
cd apps/client
npm install
npm run typecheck && npm run lint
npx expo export --platform ios && npx expo export --platform android
npm run android:device      # Release APK → эмулятор/телефон (scripts/install-android.sh)
npm run ios:testflight      # архив → App Store Connect (scripts/upload-testflight.sh)
```

Зеркала Maven и прочие сетевые обходы — те же, что у `apps/mobile` (см. `docs/MOBILE.md`).
