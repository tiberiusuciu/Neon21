#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "error: ANDROID_HOME is not set. Install the Android SDK and export ANDROID_HOME." >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "error: java not found. Install JDK 17 and ensure it is on PATH." >&2
  exit 1
fi

echo "==> Building web (dist/)"
pnpm run build

if [[ ! -d android ]]; then
  echo "==> Adding Capacitor Android platform"
  npx cap add android
fi

echo "==> Syncing Capacitor"
npx cap sync android

echo "==> Assembling debug APK"
(
  cd android
  chmod +x gradlew
  ./gradlew assembleDebug
)

APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  echo ""
  echo "APK ready:"
  echo "  $ROOT/$APK"
else
  echo "error: expected APK not found at $APK" >&2
  exit 1
fi
