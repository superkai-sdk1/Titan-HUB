#!/usr/bin/env bash
# Полный режим киоска: назначить Titan Home владельцем устройства (Device Owner).
#
#   npm run kiosk:owner             — первое подключённое устройство
#   npm run kiosk:owner -- <SERIAL> — конкретное (список: adb devices)
#
# Что даёт: экран закрепляется без вопросов, «Домой» всегда ведёт в Titan Home,
# шторка уведомлений и экран блокировки отключены, экран не гаснет на зарядке.
#
# Условия Android: на планшете НЕ должно быть аккаунтов (Google и др.) — проще всего
# сразу после сброса к заводским настройкам, пропустив вход в Google. Titan Home
# должен быть уже установлен (npm run android:device).
#
# Вернуть планшет в обычный режим: панель сотрудника → «Снять режим владельца
# устройства» (только после этого Titan Home можно удалить).
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(adb devices | awk '$2 == "device" { print $1; exit }')
fi
[ -n "$DEVICE" ] || { echo "Планшет не подключён (adb devices пуст)"; exit 1; }

PKG=ru.titan.home
ADMIN="$PKG/expo.modules.titankiosk.KioskAdminReceiver"

if ! adb -s "$DEVICE" shell pm path "$PKG" >/dev/null 2>&1; then
  echo "Titan Home не установлен на $DEVICE — сначала npm run android:device"
  exit 1
fi

ACCOUNTS=$(adb -s "$DEVICE" shell dumpsys account 2>/dev/null | grep -c "Account {" || true)
if [ "${ACCOUNTS:-0}" != "0" ]; then
  echo "На планшете есть аккаунты ($ACCOUNTS) — Android не даст назначить владельца устройства."
  echo "Удалите их в Настройки → Аккаунты или сбросьте планшет и пропустите вход в Google."
  exit 1
fi

echo "› Назначаю Titan Home владельцем устройства на $DEVICE"
adb -s "$DEVICE" shell dpm set-device-owner "$ADMIN"
adb -s "$DEVICE" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "✓ Готово: Titan Home закрепится на экране сам"
