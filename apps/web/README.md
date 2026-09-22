# @neon21/web

Neon21 frontend — Vite + React + TypeScript. Capacitor wraps the same build for Android.

## Dev

```bash
# from repo root
pnpm install
pnpm --filter @neon21/shared build
pnpm --filter @neon21/web dev
```

Requires the API on `VITE_API_URL` (default `http://localhost:4000`).

Copy `.env.example` → `.env` if needed.

## Android debug APK

Prerequisites:

- **JDK 17** (`java -version`)
- **Android SDK** with `ANDROID_HOME` set (and `platform-tools` on `PATH`)

```bash
# from repo root
pnpm apk:debug
```

Or from this package:

```bash
pnpm run apk:debug
```

The script builds the web app, runs `npx cap sync android`, then `./gradlew assembleDebug`, and prints the APK path.

Typical output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Phone ↔ API

Before building an APK, set `VITE_API_URL` in `.env` to your PC’s LAN IP (e.g. `http://192.168.1.10:4000`), not `localhost`. Phone and PC must be on the same Wi‑Fi; Docker must publish port 4000.

If the SDK is missing, `npx cap add android` / sync can still create the `android/` project; Gradle assemble will fail until `ANDROID_HOME` is configured.
