# SureWina Agent Mobile Phase Plan

Android first, React Native + Expo. The existing Next.js agent portal is reference implementation; the NestJS API, PostgreSQL ledger and Redis are reused.

**Target device:** GT81EZ Android 14 POS terminal (built-in thermal printer, rear camera, NFC). Also published on Google Play, which needs Google's real-money gambling approval under the operator's licence.

**Acceptance rule:** one meaningful increment per push to `main`, status `AWAITING DEVICE TEST` until it passes on a GT81EZ.

| Phase | What | Device acceptance |
| --- | --- | --- |
| B0a | Tab navigation, home dashboard, More (profile, version, sign-out), home-screen (launcher) mode, HTTPS-only release builds, local `index.ts` entry | Sign in by real SMS, restart keeps session, sign-out, suspended agent refused, offline screen; set as Home app and reboot opens SureWina |
| B0b | Kiosk lock (device owner + lock task) with supervisor PIN unlock to Settings | Agent cannot leave the app; supervisor can reach Wi-Fi settings and return |
| B1 | Sell: product picker, quantity, customer phone, confirm, success; double-sale protection; keep screen on while selling | One controlled sale debits once; forced network drop does not duplicate |
| B2 | Receipts: built-in printer, ticket QR, sales history, reprint, share | Printed receipt QR verifies the ticket |
| B3 | Wallet: balance, history, funding account, withdrawals with PIN | Sandbox top-up arrives; wrong PIN / low balance refused |
| B4 | Prize payout: QR scan or reference, eligibility, pay once, reimbursement | Paid once; second attempt and ineligible tickets refused |
| B5 | Commission, performance, daily records | Totals match the sales made |
| B6 | Profile, announcements, push notifications | Notifications arrive on the terminal |
| B7 | App lock, forced update, over-the-air updates, crash reporting, pilot with 5 to 10 agents | Full regression on the terminal |

## Phase 1 deployment constraints

- Expo app cannot connect to desktop `localhost` from a real phone; use a trusted reachable API URL.
- Real OTP requires registered agent, Redis and SMS delivery; `debugOtp` is non-production only.
- Refresh JWTs rotate atomically and are held in device SecureStore. Agent JWT verification checks active Redis session and current agent status.
- No mobile sale or payout buttons are enabled in Phase 1; prevent accidental live-money testing.
- Validate and commit regenerated `pnpm-lock.yaml` after dependency installation. CI frozen installs will fail until this is done.
