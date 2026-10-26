# SureWina Agent Mobile Phase Plan

Android first, React Native + Expo. The existing Next.js agent portal is reference implementation; the NestJS API, PostgreSQL ledger and Redis are reused.

**Acceptance rule:** one meaningful mobile increment per commit/push to `main`, status `AWAITING USER TEST` until a real phone test passes.

| Phase | Mobile screens | Core integration | Device acceptance |
| --- | --- | --- | --- |
| 1 | Splash/loading, phone sign-in, OTP verification, live dashboard | Agent auth, /agents/auth/me, /agent/dashboard, /agent/sales | Auth, session recovery, live figures, network failures |
| 2 | Choose draw, quantity/phone, confirm sale, sale success | /draws/active, /agent/tickets/sell | One controlled prepaid sale with wallet debit and ticket refs |
| 3 | Sales history, receipt detail/share/print | /agent/sales, /agent/tickets/sale/:ref | Confirm old receipts and supported printer workflow |
| 4 | Wallet, funding initiation/status, ledger history | /agent/wallet, funding and history endpoints | Sandbox-only funding and server verification |
| 5 | Commission & earnings | /agent/commission/summary, /agent/performance | Totals match verified sales |
| 6 | QR camera, manual lookup, prize verification, payment confirmation and success | Agent prize lookup/log-payment | Ineligible and duplicate payout rejected; eligible payment logged once |
| 7 | Profile, legacy balances, historical remittance | /agents/auth/me, /agent/remittance/* | Read-only identity and old debt audit |
| 8 | Reliability, camera/device permissions, accessibility, low-network and APK QA | No new financial routes | Full end-to-end phone regression |

Later optional expansion: customers, super-agent network, training and broadcast; existing agent web screens depend on mock/incomplete backing systems and are out of mobile v1.

## Phase 1 deployment constraints

- Expo app cannot connect to desktop `localhost` from a real phone; use a trusted reachable API URL.
- Real OTP requires registered agent, Redis and SMS delivery; `debugOtp` is non-production only.
- Refresh JWTs rotate atomically and are held in device SecureStore. Agent JWT verification checks active Redis session and current agent status.
- No mobile sale or payout buttons are enabled in Phase 1; prevent accidental live-money testing.
- Validate and commit regenerated `pnpm-lock.yaml` after dependency installation. CI frozen installs will fail until this is done.
