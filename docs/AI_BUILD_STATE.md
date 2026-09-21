# AI Build State

Updated: 2026-09-21

## Current Goal

Move SureWina toward ledger-backed customer and agent wallets, with agents ultimately operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Customer wallet/top-up experience. The user pulled the customer-wallet increment, ran local validation, and reported the build green on 2026-09-21.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet` with balances, Monnify/Flutterwave top-up, provider-return verification, funding history, and wallet ledger activity.
- Authenticated agents already have wallet/funding backend endpoints.
- This increment adds the agent wallet experience at `/wallet`: balance, top-up initiation, provider-return verification, funding history, and ledger activity.
- Agent hosted-payment returns land on the agent portal's `/wallet/funding/callback` and then return to `/wallet` for server-side verification.
- Agent navigation and dashboard now surface the wallet directly.
- Agent ticket sales still use the legacy receivable/remittance model. Prepaid sale accounting has not started yet.

## Completed

Financial architecture foundation:
- Phase 0: architecture freeze.
- Phase 1: current money-risk fixes.
- Phase 2: immutable double-entry ledger.
- Phase 3: ledger-backed wallets.
- Phase 4: wallet funding backend.
- Phase 5: wallet ticket purchase backend.
- Phase 6: multi-provider prize payouts.
- Phase 7: reconciliation and treasury.
- Phase 8 migration/hardening control plane and production schema migration.

Recent accepted work:
- Paystack restored as the direct web ticket-purchase collection rail.
- Paystack remains blocked for wallet funding.
- Monnify and Flutterwave remain the wallet-funding and payout rails.
- Agent wallet funding backend accepted.
- Customer wallet/top-up UI accepted after local type-check/build validation.

Current engineering increment:
- typed agent wallet methods in the shared API client;
- agent wallet page;
- Monnify/Flutterwave agent top-up initiation UI;
- agent hosted-payment callback routing;
- server-side provider verification/status refresh;
- agent funding history;
- agent wallet ledger activity;
- Wallet item in agent navigation;
- always-visible wallet balance shortcut on the agent dashboard;
- top-up disabled for non-active agents to match backend policy.

## Next Tasks

Only after the user accepts this increment:
1. Wire customer wallet ticket purchase into the customer buying experience so wallet funds can be selected at checkout.
2. Convert agent ticket sales to prepaid wallet accounting with atomic balance enforcement and commission recognition.
3. Credit agent wallets immediately for eligible agent-paid prizes.
4. Stop creating new remittance debt after the prepaid-agent cutover.
5. Retire `UNSETTLED_REMITTANCE` automatic suspension for post-cutover activity while preserving historical remittance records.
6. Update admin finance views for agent/customer wallet balances, funding history, and wallet activity.
7. Remove obsolete remittance-first UX after prepaid sales are accepted.
8. Complete controlled end-to-end rollout testing.

## Known Issues

- Agent sales still create agent receivables and feed the remittance worker.
- The remittance deadline worker can still suspend agents for `UNSETTLED_REMITTANCE`.
- Customer wallet ticket purchase exists on the backend but is not yet selectable in the customer buy form.
- The agent wallet can be topped up in this increment, but those funds do not yet replace the legacy agent receivable/remittance sale model.
- `AGENT_WEB_BASE_URL` must be the public agent-site origin before live agent funding is enabled in production.
- Production Monnify/Flutterwave credentials and treasury values still need controlled configuration before live funding/payout testing.

## Testing Status

Previous increment:
- customer wallet page, top-up UI, callback/status verification, funding history, ledger activity, and navigation were pushed;
- user ran local validation and reported the build green;
- customer wallet/top-up experience is accepted.

Current increment engineering review:
- inspected latest `main` and recent commits before changes;
- inspected agent authentication/session handling, agent shell/header/navigation, dashboard wallet balance source, agent wallet backend routes, provider callback construction, and shared wallet types;
- confirmed the agent dashboard's `settlement.walletBalanceNgn` is sourced from the ledger-backed wallet available balance;
- confirmed `AGENT_WEB_BASE_URL` is present in environment validation with local default `http://localhost:3001`;
- confirmed no Prisma schema or database migration is required;
- agent funding remains provider-verified and idempotent.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run from this session before push;
- repository CI is configured to run Prisma generation, full type-check, and full build on pushes to `main`;
- local browser/device acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- Agent wallet identity comes from the authenticated agent JWT; the frontend never chooses an arbitrary agent id.
- Browser/provider callback status never credits a wallet by itself.
- Agent wallet UI belongs at `/wallet` inside the agent portal and uses `AGENT_WEB_BASE_URL` for hosted-payment return URLs.
- Remittance navigation and behavior remain intact until prepaid agent sales are implemented and accepted.
- Historical remittances remain auditable; the future prepaid-agent cutover must stop only new debt generation rather than deleting history.

## Last Commit

`feat: add agent wallet top-up experience` (this development cycle)
