#!/usr/bin/env bash
# Сборка Release и установка Titan HUB на подключённый iPhone или iPad.
#
#   npm run ios:device            — первое подключённое устройство
#   npm run ios:device -- <UDID>  — конкретное устройство (UDID: xcrun devicectl list devices)
#
# Подпись — бесплатная команда Apple ID: Xcode сам регистрирует устройство и создаёт
# профиль (-allowProvisioningUpdates). Такая сборка работает 7 дней, потом — повторить.
set -euo pipefail
cd "$(dirname "$0")/.."

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
# Артефакты React Native и Hermes с repo.reactnative.dev из РФ почти не качаются — берём с зеркала Maven.
export ENTERPRISE_REPOSITORY="${ENTERPRISE_REPOSITORY:-https://mirrors.huaweicloud.com/repository/maven}"
# Модули Expo собираем из исходников. Предсобранный ExpoContacts 57.0.5 слинкован со
# Swift Testing, которого нет на устройстве, и приложение падает ещё до JS:
#   dyld: Library not loaded: @rpath/Testing.framework/Testing (ExpoContacts.framework)
export EXPO_USE_PRECOMPILED_MODULES=0

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun devicectl list devices 2>/dev/null | awk '
    /physical/ && / connected / {
      for (i = 1; i <= NF; i++)
        if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/ || $i ~ /^[0-9a-f]{40}$/) { print $i; exit }
    }')
fi
if [ -z "$DEVICE" ]; then
  echo "Не вижу подключённого iPhone или iPad. Подключите устройство, разблокируйте его или передайте UDID аргументом."
  exit 1
fi

# Нативный проект генерируется из app.json и плагинов (ios/ не хранится в git).
if [ ! -d ios ] || [ app.json -nt ios/TitanHUB/Info.plist ] || [ -n "$(find plugins -newer ios/TitanHUB/Info.plist -print -quit 2>/dev/null)" ]; then
  echo "› Генерирую iOS-проект"
  npx expo prebuild --platform ios
fi

mkdir -p ios/build
LOG=ios/build/device.log
echo "› Собираю Release для $DEVICE (лог: apps/mobile/$LOG)"
if ! xcodebuild \
  -workspace ios/TitanHUB.xcworkspace \
  -scheme TitanHUB \
  -configuration Release \
  -destination "id=$DEVICE" \
  -derivedDataPath ios/build \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic \
  build >"$LOG" 2>&1; then
  grep -E "error:" "$LOG" | head -20 || true
  echo "Сборка не удалась, подробности в apps/mobile/$LOG"
  exit 1
fi

echo "› Устанавливаю и запускаю"
xcrun devicectl device install app --device "$DEVICE" ios/build/Build/Products/Release-iphoneos/TitanHUB.app >/dev/null
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")
if xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1; then
  echo "✓ Titan HUB установлен и запущен"
else
  echo "✓ Titan HUB установлен. Устройство заблокировано — разблокируйте его и откройте приложение."
fi
