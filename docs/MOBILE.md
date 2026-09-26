# Мобильное приложение

Нативное приложение Titan HUB для iOS и Android на Expo SDK 57 (React Native 0.86). Не WebView и не обёртка над PWA: интерфейс собран из нативных компонентов, данные берутся из того же REST API, что и веб.

- **Код:** `apps/mobile`
- **iOS:** `ru.titan.hub`, команда Apple `G99YH9UK8C`, распространение через TestFlight
- **Android:** `ru.titanpos.hub`, сборка APK для arm64-v8a

Приложение ставит зависимости собственным `npm` и **исключено из pnpm-воркспейса** (`pnpm-workspace.yaml`), иначе серверные Docker-сборки тянули бы React Native, который не нужен ни API, ни ботам.

---

## Состав

Касса, «Управление», мероприятия, аналитика и Tai. Не входят: кошелёк резидента, планшет-киоск, суперадминка и публичная запись — они остаются в вебе.

```
apps/mobile/
├── src/
│   ├── app/            # экраны и маршруты (expo-router)
│   ├── components/     # общие компоненты интерфейса
│   ├── compat/android/ # слой совместимости с iOS-only модулями
│   └── lib/            # API, состояние, тема, форматирование
├── plugins/            # config-плагины Expo
├── scripts/
│   ├── install-device.sh     # сборка Release и установка на iPhone/iPad
│   ├── install-android.sh    # сборка APK и установка на Android
│   └── upload-testflight.sh  # архив и загрузка билда в App Store Connect
└── app.json            # конфигурация Expo: обе платформы, плагины, иконки
```

Нативные папки `ios/` и `android/` не хранятся в git — они генерируются из `app.json` и плагинов командой `npx expo prebuild`. Скрипты вызывают её сами, когда конфигурация новее сгенерированного проекта.

---

## Сборка и запуск

```bash
cd apps/mobile
npm install

npm run ios:device        # собрать Release и поставить на подключённый iPhone/iPad
npm run android:device    # собрать APK и поставить на подключённый Android
npm run ios:testflight    # собрать архив и загрузить билд в TestFlight
npm run typecheck         # проверка типов
npm run lint              # линтер
```

### Требования

| Платформа | Что нужно |
|---|---|
| iOS | Xcode 27+, учётная запись Apple Developer в команде `G99YH9UK8C` |
| Android | JDK 17, Android SDK (build-tools 36, platform 36), NDK `27.1.12297006`, CMake 3.22.1 |

### Сетевые особенности

Две переменные уже прописаны в скриптах, но их стоит знать:

- `ENTERPRISE_REPOSITORY=https://mirrors.huaweicloud.com/repository/maven` — артефакты React Native и Hermes идут через зеркало: `repo.reactnative.dev` из России практически не отвечает.
- `EXPO_USE_PRECOMPILED_MODULES=0` — модули Expo собираются из исходников. Предсобранный `ExpoContacts` слинкован со Swift Testing, которого нет на устройстве, и приложение падает ещё до запуска JS.

Для Android та же проблема решается зеркалом Maven: `install-android.sh` добавляет его первым в список репозиториев `android/build.gradle`, потому что Maven Central отдаёт `react-android` (176 МБ) редиректом на недоступный хост.

---

## Публикация в TestFlight

Нужен ключ App Store Connect API с ролью **Admin** (App Manager не хватает: он не может регистрировать идентификаторы).

1. App Store Connect → Users and Access → Integrations → **Team Keys** → создать ключ.
2. Скачанный `AuthKey_XXXXXXXXXX.p8` положить в `~/.appstoreconnect/private_keys/`.
3. Создать `apps/mobile/scripts/.asc-env` (файл в `.gitignore`):

```bash
export ASC_KEY_ID=XXXXXXXXXX
export ASC_ISSUER_ID=00000000-0000-0000-0000-000000000000
```

4. `npm run ios:testflight` — скрипт поднимет номер сборки, соберёт архив, экспортирует IPA, прогонит валидацию Apple и загрузит билд.

Xcode 27 не умеет интерактивный вход из командной строки, поэтому подпись и загрузка идут только через этот ключ. Он даёт полный доступ к учётной записи разработчика — хранить как пароль.

Запись приложения в App Store Connect создаётся **вручную**: API не поддерживает создание приложений ни при каких правах.

---

## Слой совместимости с Android

Приложение писалось под iOS 26: контролы SwiftUI, SF Symbols, Liquid Glass, Swift Charts. Чтобы не переписывать 90 экранов, `metro.config.js` подменяет iOS-only модули на реализации из `src/compat/android` — только для платформы `android` и только для импортов вне самого слоя.

| Модуль | Чем заменён |
|---|---|
| `@expo/ui/swift-ui` | 23 компонента на React Native, 28 модификаторов переводятся в стили |
| `expo-symbols` | имена SF переводятся в Material Symbols (таблица на 173 записи) |
| `expo-glass-effect` | полупрозрачные поверхности вместо стекла |

Выбор даты и времени — собственный календарь: нативный диалог Material из `@expo/ui/jetpack-compose` требует особой границы композиции и внутри дерева React Native падает.

### Что на Android устроено иначе

- **Цвета** лежат в ресурсах Android с вариантом `values-night` (плагин `plugins/with-android-colors.js`). Брать их из атрибутов темы нельзя: тема Activity остаётся светлой при тёмной системе, и текст становится не виден. Ключи `theme.ts` и `theme.android.ts` должны совпадать.
- **Иконки в шапках** подставляются картинками: SF Symbols expo-router на Android молча отбрасывает. Для этого есть обёртки в `src/components/toolbar.tsx` — использовать их вместо `Stack.Toolbar.Menu` и соседей.
- **Плашки смены и чека** рисуются своим слоем над таб-баром: `NativeTabs.BottomAccessory` — возможность iOS 26. Их тело вынесено в `*-accessory-body.tsx`, платформенные обёртки лежат рядом.
- **Шапки экранов** непрозрачные: `headerTransparent` нужен для размытия iOS 26, а на Android отступ под него добрать некому.
- **Шторки с двумя высотами** (`sheetAllowedDetents: [0.6, 1]`) Android раскладывает на полную высоту и просто сдвигает вниз: на средней высоте нижний край содержимого — за экраном. Ничего важного к низу такой шторки не прижимать: в меню чека поиск на Android стоит сверху, чат с кабинкой открывается сразу во весь рост.
- **`Alert.prompt` на Android не существует** — вызов молча ничего не делает. Ввод текста в диалоге — только через `promptText` из `src/lib/dialog.ts`.
- **`Alert.alert` на Android показывает не больше трёх кнопок**, остальные отбрасывает. Для наборов из четырёх и больше — `chooseAction` из того же файла. Android-диалоги рисует `components/dialog-host.tsx`.
- **iOS-only пропы** не работают и молча игнорируются: `clearButtonMode` (крестик очистки — `components/clear-button.tsx`), `keyboardDismissMode="interactive"` (брать `KEYBOARD_DISMISS` из `lib/layout.ts`), `Link.Menu` (на Android те же действия по долгому нажатию).
- **Ориентация**: телефон закреплён в портрете, планшет (короткая сторона от 600 dp) поворачивается — плагин `plugins/with-android-phone-portrait.js`.
- **Чужие приложения** (Яндекс.Карты, Telegram, WhatsApp) видны `Linking.canOpenURL` только после объявления в `<queries>` манифеста — плагин `plugins/with-android-queries.js`, двойник `LSApplicationQueriesSchemes`.

### Осознанные различия

Liquid Glass заменён плоскими поверхностями; круговая диаграмма в аналитике — стековой полосой; превью по долгому нажатию (`Link.Preview`) недоступно — вместо него список быстрых действий; шрифт `ui-rounded` подменяется системным; перестановка в «Порядке категорий/позиций» — стрелками вместо перетаскивания. Планшетная раскладка кассы (сплит) включается и на Android-планшетах — по короткой стороне экрана от 600 dp (`lib/layout.ts`).

---

## Что проверять после правок

```bash
npm run typecheck && npm run lint
npx expo export --platform ios      # обе платформы должны собирать бандл
npx expo export --platform android
```

Экраны на устройстве удобно открывать по ссылке, не листая интерфейс:

```bash
adb shell am start -a android.intent.action.VIEW -d "titanhub://manage/inventory"
```

Если `adb exec-out screencap` отдаёт чёрный кадр — это системный диалог отпечатка, он защищён от снятия экрана. Дерево интерфейса при этом читается через `adb shell uiautomator dump`.
