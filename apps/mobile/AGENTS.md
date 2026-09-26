# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Приложение

Нативное приложение Titan HUB для iOS и Android: касса, «Управление», мероприятия, аналитика, Tai. Без WebView. Полное описание — в `docs/MOBILE.md` в корне репозитория.

Нативные папки `ios/` и `android/` не хранятся в git: они генерируются из `app.json` и `plugins/` командой `npx expo prebuild`. Правки в них не переживут следующую генерацию — менять нужно конфигурацию или config-плагин.

## Android: что нельзя делать по-iOS-овски

Интерфейс писался под iOS 26, поэтому на Android часть механик просто отсутствует. Грабли, на которые уже наступали:

- **Цвета берутся из ресурсов**, а не из атрибутов темы: тема Activity остаётся светлой при тёмной системе, и текст становится невидимым. Палитру задаёт `plugins/with-android-colors.js` (`values` + `values-night`); ключи `src/lib/theme.ts` и `theme.android.ts` держать одинаковыми.
- **Иконки в шапках** — только через обёртки из `src/components/toolbar.tsx`: SF Symbols в `Stack.Toolbar` expo-router на Android молча отбрасывает, кнопка остаётся невидимой.
- **`NativeTabs.BottomAccessory`** — возможность iOS 26. Компоненты плашек разделены на тело (`*-accessory-body.tsx`) и платформенные обёртки; их хук `usePlacement` вне контейнера роняет приложение.
- **Шапки разделов** — только через `glassHeader()` из `src/components/header-glass.tsx`. На Android это функция от маршрута: шапка прозрачная и размывает контент своего экрана (цель размытия регистрирует `AmbientBackdrop`), отступ под неё даёт `usePageGutter`.
- **expo-blur собирается из исходников с патчем** (`patches/expo-blur+*.patch`, `expo.autolinking.android.buildFromSource` в `package.json`): иначе BlurView кладёт «синий шум», и размытие серое и зернистое. Готовый AAR из `local-maven-repo` патч не видит.
- **Кнопки шапки на iOS** — сами `Stack.Toolbar.*` (`ToolbarMenu`/`ToolbarButton` из `toolbar.tsx` на iOS ими и являются): expo-router отбрасывает детей тулбара, чей тип не совпал, — своя обёртка-компонент молча исчезает.
- **Шторки** не должны быть с прозрачным фоном: под ними нет Liquid Glass. Фон берётся из `colors.sheetBackground`.
- **Нативные компоненты Compose** (`@expo/ui/jetpack-compose`) требуют особой границы композиции и внутри обычного дерева RN падают с `MissingHostException` — выбор даты и времени поэтому написан на RN.
- **Опции шторок** — с `...sheetOptions` из `src/lib/sheet.ts` (иначе на Android прямые углы), а стек — с `screenLayout={sheetLayout}` (`components/sheet-grabber.tsx`, ручка шторки: сам react-native-screens рисует её только на iOS).
- **`autoFocus` в шторках** — через `useAutoFocus()` из `src/lib/auto-focus.ts`: клавиатура, поднятая во время выезда шторки, сбивает анимацию, и шторка прыгает. `FormField` и поле `@expo/ui` уже так делают.
- **Шторка с двумя высотами** на Android раскладывается во весь рост и сдвигается вниз — прижатое к её низу (поиск, поле ввода) на средней высоте оказывается за экраном.
- **`Alert.prompt` на Android молча не работает**, а `Alert.alert` рисует максимум три кнопки. Использовать `promptText` / `chooseAction` из `src/lib/dialog.ts`.
- **Панель вкладок на Android — своя** (`components/floating-tab-bar.tsx`, капсула как в iOS 26), экраны прокручиваются под ней. Отступ снизу — `useTabBarClearance()` из `src/lib/tab-bar.ts` (в `usePageGutter` уже учтён). Новую шторку внутри вкладки добавлять в `SHEET_ROUTES` — иначе панель ляжет поверх её низа.
- **iOS-only пропы**: вместо `keyboardDismissMode="interactive"` — `KEYBOARD_DISMISS` из `src/lib/layout.ts`; к полям поиска с `clearButtonMode` добавлять `ClearButton`.

iOS-only модули (`@expo/ui/swift-ui`, `expo-symbols`, `expo-glass-effect`) подменяются на `src/compat/android` через `metro.config.js`. Добавляя новый такой модуль, добавляйте и замену.

## Перед коммитом

```bash
npm run typecheck && npm run lint
npx expo export --platform ios && npx expo export --platform android
```

Обе платформы должны собирать бандл: правки общих файлов легко ломают ту платформу, которую не проверяли.
