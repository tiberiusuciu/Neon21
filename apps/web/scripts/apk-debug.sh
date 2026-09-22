#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
if [[ -z "${ANDROID_HOME:-}" && -d "${HOME}/Android/Sdk" ]]; then
  if [[ -f "$REPO_ROOT/scripts/env-android.sh" ]]; then
    # shellcheck source=/dev/null
    . "$REPO_ROOT/scripts/env-android.sh"
  else
    export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk/jdk-17}"
    export ANDROID_HOME="$HOME/Android/Sdk"
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
  fi
fi

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
