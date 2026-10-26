# SureWina Agent (Android-first)

First mobile development increment: OTP sign-in, session restoration, live agent dashboard, refresh and sign-out. Sales, wallet top-up, prize payment and commissions are **not active** in this mobile increment.

## Setup (Windows / phone on same Wi-Fi)

1. From the repository root run `pnpm install --no-frozen-lockfile` to resolve the new Expo workspace and refresh the lockfile. The GitHub-only coding environment cannot regenerate the dependency lockfile from npm.
2. Build shared packages: `pnpm --filter @surewina/types build` then `pnpm --filter @surewina/api-client build`.
3. Copy `apps/mobile-agent/.env.example` to `apps/mobile-agent/.env`. Set `EXPO_PUBLIC_API_URL` to the reachable API URL ending with `/v1` (your PC's LAN IP for a local API). Never use `localhost` for testing on a phone.
4. Start the existing PostgreSQL, Redis and SureWina API. The agent must already be registered and not suspended.
5. Run `pnpm --filter @surewina/mobile-agent start`, then open Expo Go on Android and scan the development QR code. Expo Go is suitable for this initial test.
6. Optional native APK after Expo tooling and credentials are set up: `cd apps/mobile-agent && npx eas-cli build --platform android --profile preview`. This step requires external Expo build services; no APK is generated in this commit.

## Tests

- `pnpm --filter @surewina/mobile-agent test`
- `pnpm --filter @surewina/mobile-agent type-check`
- `pnpm --filter @surewina/api exec jest --runInBand agent-mobile-auth.spec.ts`
- `pnpm --filter @surewina/api type-check`
- `pnpm --filter @surewina/api build`
- `pnpm --filter web-agent build`

If you update the lockfile locally after install, commit the generated `pnpm-lock.yaml` in the next accepted increment. Until then, fresh CI installs that use `--frozen-lockfile` will reject the new workspace. No production pipeline should be activated.

OTP debug codes are only visible in a non-production API configuration. Agent sessions are stored in Expo SecureStore. On connectivity loss, the app shows Retry rather than signing the agent out. The server validates session state for protected agent requests. Nothing here enables payment rails or modifies ticket/ledger operations.
