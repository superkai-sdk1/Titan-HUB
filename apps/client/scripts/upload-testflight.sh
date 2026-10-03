#!/usr/bin/env bash
# Сборка архива и загрузка билда в TestFlight.
#
#   npm run ios:testflight            — поднять номер сборки, собрать, загрузить
#   npm run ios:testflight -- --keep  — не трогать номер сборки (пересобрать тот же)
#
# Ключ App Store Connect API (Xcode 27 не умеет интерактивный вход из CLI):
#   ASC_KEY_ID     — идентификатор ключа, 10 символов
#   ASC_ISSUER_ID  — Issuer ID команды, UUID
#   файл ключа     — ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
# Первые два можно положить в scripts/.asc-env (файл не хранится в git).
set -euo pipefail
cd "$(dirname "$0")/.."

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
# Те же две переменные, что в install-device.sh: артефакты RN/Hermes с зеркала Maven,
# модули Expo из исходников (предсобранный ExpoContacts валит запуск на устройстве).
export ENTERPRISE_REPOSITORY="${ENTERPRISE_REPOSITORY:-https://mirrors.huaweicloud.com/repository/maven}"
export EXPO_USE_PRECOMPILED_MODULES=0

# App Store принимает сборки только ФИНАЛЬНЫМ Xcode: /Applications/Xcode.app на этом Mac —
# бета (27.1), её сборки проходят в TestFlight, но «Add for Review» их отклоняет.
# При смене версии Xcode очистить кэш ExpoModulesJSI (он собирается локально и
# привязан к компилятору): bash node_modules/expo-modules-jsi/apple/scripts/clear-caches.sh
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode-27.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode-27.app/Contents/Developer
fi
echo "› Xcode: $(xcodebuild -version | head -1) ($(xcodebuild -version | tail -1))"

[ -f scripts/.asc-env ] && . scripts/.asc-env

KEY_ID="${ASC_KEY_ID:-}"
ISSUER_ID="${ASC_ISSUER_ID:-}"
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"

if [ -z "$KEY_ID" ] || [ -z "$ISSUER_ID" ]; then
  echo "Нужны ASC_KEY_ID и ASC_ISSUER_ID (App Store Connect → Users and Access → Integrations)."
  exit 1
fi
if [ ! -f "$KEY_PATH" ]; then
  echo "Не вижу ключ: $KEY_PATH"
  echo "Скачайте AuthKey_${KEY_ID}.p8 из App Store Connect и положите туда."
  exit 1
fi

AUTH=(-authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER_ID")

# Номер сборки: App Store Connect отклоняет повторный CFBundleVersion при той же версии.
if [ "${1:-}" != "--keep" ]; then
  node -e '
    const fs = require("node:fs");
    const cfg = JSON.parse(fs.readFileSync("app.json", "utf8"));
    const next = String(Number(cfg.expo.ios.buildNumber ?? 0) + 1);
    cfg.expo.ios.buildNumber = next;
    fs.writeFileSync("app.json", JSON.stringify(cfg, null, 2) + "\n");
    console.log("› Номер сборки:", next);
  '
fi

# Нативный проект генерируется из app.json и плагинов (ios/ не хранится в git).
# Имя Xcode-проекта Expo берёт из expo.name без пробелов и знаков: «My Titan» → MyTitan.
PROJECT=$(node -p "require('./app.json').expo.name.replace(/[\\W_]+/g, '')")
if [ ! -f "ios/$PROJECT/Info.plist" ]; then
  # Проекта под текущее имя нет (первая сборка или приложение переименовали) —
  # генерируем заново: поверх старого prebuild оставил бы прежнее имя проекта.
  echo "› Генерирую iOS-проект $PROJECT с нуля"
  EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --clean
elif [ app.json -nt "ios/$PROJECT/Info.plist" ] \
   || [ -n "$(find plugins -newer "ios/$PROJECT/Info.plist" -print -quit 2>/dev/null)" ]; then
  echo "› Генерирую iOS-проект"
  npx expo prebuild --platform ios
fi

VERSION=$(node -p "require('./app.json').expo.version")
BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")
OUT=ios/build/testflight
mkdir -p "$OUT"

echo "› Собираю архив $VERSION ($BUILD) — это долго, лог: apps/client/$OUT/archive.log"
if ! xcodebuild \
  -workspace "ios/$PROJECT.xcworkspace" \
  -scheme "$PROJECT" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$OUT/$PROJECT.xcarchive" \
  -allowProvisioningUpdates \
  "${AUTH[@]}" \
  archive >"$OUT/archive.log" 2>&1; then
  grep -E "error:|Provisioning|No profiles|No signing certificate" "$OUT/archive.log" | head -20 || true
  echo "Архив не собрался, подробности в apps/client/$OUT/archive.log"
  exit 1
fi

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$(node -p "require('./app.json').expo.ios.appleTeamId")</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

echo "› Экспортирую IPA"
if ! xcodebuild -exportArchive \
  -archivePath "$OUT/$PROJECT.xcarchive" \
  -exportPath "$OUT/ipa" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -allowProvisioningUpdates \
  "${AUTH[@]}" >"$OUT/export.log" 2>&1; then
  grep -E "error:|Provisioning" "$OUT/export.log" | head -20 || true
  echo "Экспорт не удался, подробности в apps/client/$OUT/export.log"
  exit 1
fi

IPA=$(find "$OUT/ipa" -name "*.ipa" | head -1)
[ -n "$IPA" ] || { echo "IPA не найден в $OUT/ipa"; exit 1; }
echo "✓ IPA готов: apps/client/$IPA ($(du -h "$IPA" | cut -f1))"

echo "› Проверяю пакет перед загрузкой"
xcrun altool --validate-app -f "$IPA" -t ios --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID" 2>&1 | tail -5

echo "› Загружаю в App Store Connect"
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID" 2>&1 | tail -5
echo "✓ Готово. Билд $VERSION ($BUILD) появится в TestFlight после обработки (обычно 5–15 минут)."
