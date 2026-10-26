# SureWina Agent (Android-first development build)

Phase 1: native Android development APK with OTP sign-in, secure session restoration, live agent dashboard, refresh and sign-out. Mobile ticket selling, wallet top-ups and prize payment are **not enabled yet**.

## Build an Android development APK

From the repository root on Windows:

```powershell
cd C:\dev\surewina
git pull origin main
pnpm install --no-frozen-lockfile
pnpm --filter @surewina/mobile-agent type-check
pnpm --filter @surewina/mobile-agent test
pnpm --filter @surewina/api exec jest --runInBand agent-mobile-auth.spec.ts
```

The app's postinstall hook builds `@surewina/types` and `@surewina/api-client`, which are workspace dependencies required by Metro and EAS. A fresh `pnpm install` generates an updated `pnpm-lock.yaml` for the new mobile dependencies. The repo lockfile still needs to be committed before any frozen-lockfile CI workflow can build reliably.

For physical phone testing, create `apps/mobile-agent/.env` from `.env.example` and set `EXPO_PUBLIC_API_URL` to a reachable backend URL ending in `/v1`. For a local API use the PC's LAN address, for example `http://192.168.1.100:4000/v1` (replace the IP). Do **not** use localhost or put secrets in `EXPO_PUBLIC_` variables. **During development, Metro reads this file when serving JavaScript to the installed dev-client APK; the native APK can be built before the API server starts.**

Then:

```powershell
cd apps\mobile-agent
npx eas-cli login
npx eas-cli build --platform android --profile development
```

If EAS asks to create/link an Expo project or Android credentials, complete the prompts. Install the resulting `.apk` on your Android phone. It contains **expo-dev-client**, not Expo Go. This is a developer build, not a release-style standalone APK.

## Running it after installation

A development APK needs Metro to load its JavaScript. From the workspace root on your PC:

```powershell
pnpm --filter @surewina/mobile-agent exec expo start --dev-client --lan
```

Open the installed SureWina Agent app and connect to the running Metro development server on the same network. If LAN discovery fails, use `--tunnel` instead of `--lan` where supported. Reloads to JS/TS screens do not require rebuilding the APK; adding native dependencies or changing native configuration **does** require a new APK.

To test live auth/dashboard, run the existing SureWina API, PostgreSQL and Redis and use a registered non-suspended test agent. Test OTP, app restart and session recovery, refresh rotation, loading/error states, network interruption, and sign-out. No financial transactions are required for this phase.

## Other useful checks

```powershell
pnpm --filter @surewina/api type-check
pnpm --filter @surewina/api build
pnpm --filter web-agent build
```

The GitHub integration environment could not perform a full Expo/EAS build or regenerate `pnpm-lock.yaml`; validate install, TypeScript, Metro and native APK on Windows before accepting this phase. Keep the production pipeline disabled and do not activate payment rails.
