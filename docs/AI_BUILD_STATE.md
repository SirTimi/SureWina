# AI Build State

Updated: 2026-09-21

## Current Goal

Move SureWina toward ledger-backed customer and agent wallets, with agents ultimately operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Agent wallet funding backend. The user pulled the TS2702 fix, ran local validation, and reported the build green on 2026-09-21.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Authenticated agents can retrieve their wallet, view ledger history, initiate Monnify/Flutterwave funding, verify funding status, and view funding history.
- This increment adds the customer wallet experience at `/dashboard/wallet`: balances, top-up initiation, provider-return verification, funding history, and ledger activity.
- Customer hosted-payment returns land on `/wallet/funding/callback`, then redirect into the authenticated wallet page. Provider-returned status is not trusted; the API verifies the payment server-side before crediting.
- The authenticated customer navigation now includes Wallet.
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
- Agent wallet funding backend accepted after local type-check/build validation.

Current engineering increment:
- typed customer wallet API-client module;
- customer wallet balance page;
- Monnify/Flutterwave top-up initiation UI;
- hosted-payment callback routing;
- server-side funding verification/status refresh;
- funding history display;
- wallet ledger activity display;
- authenticated Wallet navigation.

## Next Tasks

Only after the user accepts this increment:
1. Add the agent wallet/top-up UI and callback/status experience.
2. Wire customer wallet ticket purchase into the customer buying experience so wallet funds can be selected at checkout.
3. Convert agent ticket sales to prepaid wallet accounting with atomic balance enforcement and commission recognition.
4. Credit agent wallets immediately for eligible agent-paid prizes.
5. Stop creating new remittance debt after the prepaid-agent cutover.
6. Retire `UNSETTLED_REMITTANCE` automatic suspension for post-cutover activity while preserving historical remittance records.
7. Update admin finance views for agent/customer wallet balances, funding history, and wallet activity.
8. Remove obsolete remittance-first UX after prepaid sales are accepted.
9. Complete controlled end-to-end rollout testing.

## Known Issues

- Agent sales still create agent receivables and feed the remittance worker.
- The remittance deadline worker can still suspend agents for `UNSETTLED_REMITTANCE`.
- Agent wallet top-up UI has not been implemented yet.
- Customer wallet ticket purchase exists on the backend but is not yet selectable in the customer buy form.
- `AGENT_WEB_BASE_URL` must be set to the public agent-site origin before agent funding is enabled in production.
- Production Monnify/Flutterwave credentials and treasury values still need controlled configuration before live funding/payout testing.

## Testing Status

Previous increment:
- initial local validation failed with TS2702 in `wallet-funding.service.ts`;
- the audit-actor typing root cause was fixed;
- user re-ran local validation and reported the build green;
- agent wallet funding backend is therefore accepted.

Current increment engineering review:
- inspected latest `main` before changes;
- inspected recent commits;
- confirmed no root `AGENTS.md` is present;
- inspected customer wallet/funding controllers, wallet ledger response shape, provider callback behavior, customer route structure, authenticated navigation, and shared API client;
- no Prisma schema or database migration is required;
- customer wallet credits continue to rely on provider verification in the existing API.

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
- Customer wallet funding uses the existing `WalletFunding` model and provider-verification flow.
- Browser/provider callback status never credits a wallet by itself.
- Customer wallet UI belongs in the authenticated `/dashboard` area.
- The provider callback route stays at `/wallet/funding/callback` because the existing backend constructs that path from `PAYMENT_CALLBACK_BASE_URL`.
- Historical remittances remain auditable; the future prepaid-agent cutover must stop only new debt generation rather than deleting history.

## Last Commit

`feat: add customer wallet top-up experience` (this development cycle)
