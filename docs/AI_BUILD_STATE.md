# AI Build State

Updated: 2026-10-26

## Current Goal

Deliver AGENT-MOBILE-01: an Android-first Expo agent application with real agent OTP sign-in, revocable/rotating sessions, and a live read-only dashboard, without changing ticket sales or financial rails.

## Current Status

AWAITING USER TEST

Engineering increment is staged in a single GitHub main commit. **Not accepted until physical-device/local verification.** The remote coding environment could read/write GitHub but could not clone over the public network, install Expo dependencies or execute pnpm, Metro, Jest or Android builds.

## Last Accepted Task

The previously recorded accepted backend finance and agent portal functionality remains accepted as documented in the archived state. No SureWina mobile increment has been user-accepted yet.

## Current Implementation

- Added `apps/mobile-agent`, a separate Expo/React Native workspace using SureWina blue `#013AA8`, yellow `#F9CB0B` and success-only green.
- Phone-only agent OTP sign-in, secure refresh-token persistence in Expo SecureStore, restored sessions, loading/offline/retry UX, explicit sign-out.
- Live authenticated agent profile, available ledger-backed wallet balance, today's sales/tickets/commission, selling cutoff status, historical-balance warning and recent confirmed sales.
- No active mobile money operations, ticket selling, withdrawal, receipt printing or QR scanning yet; they belong in later phases.
- Agent API now issues 15-minute access and 30-day (configurable) refresh tokens, stores hashed refresh sessions in Redis, rotates via atomic GETDEL, rejects replay and suspended agents, and revokes sessions at sign-out.
- Agent JWT guard checks its backing Redis session and current agent status for protected agent routes. Existing agent sessions without a session ID require a fresh OTP login.
- Shared agent OTP request/verify type declarations and agent web sign-in debug-code field were aligned to the backend.

## Completed

- AGENT-MOBILE-01 engineering implementation written and code-reviewed (mobile foundation + authentication + dashboard).
- Added `apps/api/test/agent-mobile-auth.spec.ts` covering OTP sign-in, refresh rotation/replay, sign-out and suspended agent rejection.
- Added pure phone-normalization tests in the mobile project.
- Existing finance/CBA work remains independently gated by `docs/PHASE6E_ACCEPTANCE_RUNBOOK.md` and `docs/PHASE6_FINANCIAL_SECURITY_ACCEPTANCE.md`.

## Next Tasks

1. User pulls current `main`, installs deps and updates pnpm lockfile locally with `pnpm install --no-frozen-lockfile`, then builds shared packages.
2. Run API mobile auth Jest test, API type-check/build and web-agent build; report any failures before proceeding.
3. Start PostgreSQL, Redis and API with a registered test agent. Supply a reachable phone-to-API URL in `apps/mobile-agent/.env`.
4. Open Expo Go on Android, verify OTP, token restoration/rotation, live dashboard, network loss/retry, logout, suspended agent behavior.
5. On user PASS: mark this cycle accepted and begin AGENT-MOBILE-02 (ticket-sale vertical slice). On FAIL: fix only this cycle and return to AWAITING USER TEST.

## Known Issues

- `pnpm-lock.yaml` has not been regenerated for the new Expo workspace because no npm registry/package-manager network was available. Fresh `--frozen-lockfile` installs will fail until the generated lockfile is committed. Local test must use `--no-frozen-lockfile` and the refreshed lockfile must be included in the next commit.
- No real APK, Metro bundle, Jest or TypeScript build has been executed in the connected GitHub-only environment; installation and physical Android device testing are still required.
- The web-agent portal retains browser localStorage refresh-token handling from the existing portal; mobile tokens use SecureStore. Web hardening should be assessed separately.
- Opening the app offline does not show financial figures from an unverified local cache; the user must retry server verification.
- Provider payout and CBA financial rails remain disabled until independent acceptance and Finance sign-off.

## Testing Status

Added automated tests:
- Phone normalization: 2/2 tests passed under Node 22.16 with --experimental-strip-types; the tested phone.ts file matched the staged Git blob SHA.
- `pnpm --filter @surewina/api exec jest --runInBand agent-mobile-auth.spec.ts`
- `pnpm --filter @surewina/mobile-agent test`

Required local validations (not run in this environment):
- `pnpm --filter @surewina/api type-check`
- `pnpm --filter @surewina/api build`
- `pnpm --filter web-agent build`
- `pnpm --filter @surewina/types build`
- `pnpm --filter @surewina/api-client build`
- `pnpm --filter @surewina/mobile-agent type-check`
- Physical Android phone Expo Go: sign-in, 401 refresh, reconnection and sign-out.

No provider sandbox payment, CBA debit, ledger write or production test executed.

## Architecture Decisions

- GitHub `main` remains the source of truth and integration branch, with no force-push or new development branch.
- API remains NestJS; Redis handles agent refresh sessions, PostgreSQL remains the ledger record, mobile is Expo/React Native.
- Use existing `@surewina/api-client` and `@surewina/types` in the mobile workspace; build those packages before Metro.
- An authenticated mobile session never authorizes a financial operation without existing server-side checks.
- First mobile increment is **read-only** after authentication; later selling/payout features require independent device acceptance.
- Physical phone acceptance, not automated checks or GitHub push, determines when a phase is complete.

## Last Commit

`feat(mobile-agent): add Android agent authentication and live dashboard` — parent at implementation start: `24d256b64df34bfde8298bc7aaf008b4cd58e330`. See `git log -1` for pushed commit SHA.

## Previous Finance Context

Prior detailed history archived in `docs/AI_BUILD_STATE_PRE_MOBILE_2026-10-19.md`. The archived status represents prior work, not the active mobile development gate.
