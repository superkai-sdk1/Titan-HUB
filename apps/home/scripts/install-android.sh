#!/usr/bin/env bash
# Сборка Release APK и установка Titan Home на подключённый Android-планшет.
#
#   npm run android:device             — первое подключённое устройство
#   npm run android:device -- <SERIAL> — конкретное (список: adb devices)
#
# Подпись — debug-ключ из шаблона Expo: для своих устройств этого достаточно.
# Для Google Play нужен собственный keystore, см. reactnative.dev/docs/signed-apk-android.
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-$HOME/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Нет JDK 17 в $JAVA_HOME. Поставьте Temurin 17 или задайте JAVA_HOME."
  exit 1
fi
if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "Нет Android SDK в $ANDROID_HOME. Поставьте platform-tools, platforms;android-36, build-tools;36.0.0 и NDK."
  exit 1
fi

# Нативный проект генерируется из app.json и плагинов (android/ не хранится в git).
if [ ! -f android/app/src/main/AndroidManifest.xml ] \
   || [ app.json -nt android/app/src/main/AndroidManifest.xml ] \
   || [ -n "$(find plugins -newer android/app/src/main/AndroidManifest.xml -print -quit 2>/dev/null)" ]; then
  echo "› Генерирую Android-проект"
  npx expo prebuild --platform android
fi

# Зеркало Maven первым в списке репозиториев. Прямой Central отдаёт react-android
# редиректом на repo.reactnative.dev, откуда из РФ 176 МБ не выкачать — Gradle падает
# с «Read timed out» и к следующему репозиторию уже не переходит. С зеркала артефакт
# идёт на ~6 МБ/с, а чего там нет (404) Gradle спокойно доберёт из google()/mavenCentral().
# Патч идемпотентный: android/ не хранится в git и пересоздаётся prebuild-ом.
MIRROR_URL="${ANDROID_MAVEN_MIRROR:-https://mirrors.huaweicloud.com/repository/maven}"
if ! grep -q "$MIRROR_URL" android/build.gradle; then
  echo "› Добавляю зеркало Maven в android/build.gradle"
  python3 - "$MIRROR_URL" <<'PYEOF'
import sys
url = sys.argv[1]
p = 'android/build.gradle'
s = open(p, encoding='utf-8').read()
old = "allprojects {\n  repositories {\n    google()"
new = ("allprojects {\n  repositories {\n"
       "    // Зеркало идёт первым: Central отдаёт react-android редиректом на\n"
       "    // repo.reactnative.dev, недоступный из РФ (см. scripts/install-android.sh).\n"
       f"    maven {{ url '{url}' }}\n"
       "    google()")
if old in s:
    open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('  зеркало добавлено')
else:
    print('  ВНИМАНИЕ: блок repositories не распознан, зеркало не добавлено')
PYEOF
fi

# Одна ABI вместо четырёх: arm64-v8a покрывает все современные устройства,
# а полный набор умножает время компиляции C++ (reanimated, worklets, screens) на четыре.
ARCHS="${ANDROID_ARCHS:-arm64-v8a}"

# react-android (176 МБ) на Maven Central лежит редиректом на repo.reactnative.dev,
# откуда из РФ он не скачивается — Gradle падает с «Read timed out». Тот же артефакт
# берём с зеркала Huawei (как ENTERPRISE_REPOSITORY для iOS) и держим в локальном
# репозитории: RN видит `react.internal.mavenLocalRepo` и исключает com.facebook.react
# из Central. Заполнить: скачать pom, module и -release.aar в
# $RN_MAVEN/com/facebook/react/react-android/<версия>/
RN_MAVEN="${RN_MAVEN:-$HOME/Library/Android/rn-maven}"
GRADLE_ARGS=(-PreactNativeArchitectures="$ARCHS")
[ -d "$RN_MAVEN" ] && GRADLE_ARGS+=(-Preact.internal.mavenLocalRepo="$RN_MAVEN")

echo "› Собираю Release для $ARCHS (лог: apps/home/android/build.log)"
mkdir -p android
if ! (cd android && ./gradlew assembleRelease "${GRADLE_ARGS[@]}" >build.log 2>&1); then
  grep -E "FAILURE|error:|What went wrong|> Task .* FAILED" android/build.log | head -20 || true
  echo "Сборка не удалась, подробности в apps/home/android/build.log"
  exit 1
fi

APK=android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || { echo "APK не найден: $APK"; exit 1; }
echo "✓ APK готов: apps/home/$APK ($(du -h "$APK" | cut -f1))"

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(adb devices | awk '$2 == "device" { print $1; exit }')
fi
if [ -z "$DEVICE" ]; then
  echo "Устройство не подключено — APK лежит по пути выше, его можно перекинуть на телефон вручную."
  exit 0
fi

echo "› Устанавливаю на $DEVICE"
adb -s "$DEVICE" install -r "$APK"
PKG=$(node -p "require('./app.json').expo.android.package")
adb -s "$DEVICE" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "✓ Titan Home установлен"
