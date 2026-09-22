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

The script builds the web app against the **production API**
(`https://api.neon21.tiberiusuciu.io` by default), runs `npx cap sync android`,
then `./gradlew assembleDebug`, and prints the APK path.

Typical output: `android/app/build/outputs/apk/debug/app-debug.apk`

Override the API only if needed (must be a public HTTPS URL, not localhost):

```bash
VITE_API_URL=https://api.neon21.tiberiusuciu.io pnpm apk:debug
```

Local `apps/web/.env` with `localhost` is ignored for APK builds — the phone
cannot reach your machine that way, and Android is intended to use prod.

### Google sign-in on Android

“Continue with Google” uses a Custom Tab, then returns via the deep link scheme
`com.neon21.app://` (e.g. `com.neon21.app://auth/callback?token=…`), not the
public website.

1. **Deploy the API first** — production must include `/auth/google/mobile`.
2. Pull client changes, then **rebuild the APK**: `pnpm apk:debug`.
