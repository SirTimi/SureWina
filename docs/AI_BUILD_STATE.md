# AI Build State

Updated: 2026-09-21

## Current Goal

Move SureWina toward ledger-backed customer and agent wallets, with agents ultimately operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Agent wallet/top-up experience. The user reported the latest build green on 2026-09-21, satisfying the manual acceptance gate for the agent wallet UI/funding slice.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet`.
- Agent wallet UI is available at `/wallet` in the agent portal.
- Authenticated customer checkout now keeps Paystack as the default direct-payment option and adds SureWina wallet payment as an alternative.
- Wallet checkout uses the existing authenticated `POST /wallet/purchases` backend path.
- Wallet purchases remain atomic: spend-control checks, wallet hold, ticket creation, jackpot accumulation, hold capture, and completion happen inside the existing serializable transaction.
- Customer wallet balance is loaded before wallet checkout and insufficient balance is blocked in the UI while the backend remains authoritative.
- Wallet purchase retries reuse an idempotency key only when draw, quantity, and state-of-play are unchanged.
- Successful wallet purchases go directly to ticket confirmation without a hosted payment redirect.
- Agent ticket sales still use the legacy receivable/remittance model. Prepaid agent sale accounting has not started yet.

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

Accepted wallet UX:
- agent wallet funding backend;
- customer wallet/top-up UI;
- agent wallet/top-up UI.

Current engineering increment:
- typed wallet-ticket-purchase method in the shared API client;
- wallet balance/account bootstrap in the customer buy form;
- Paystack remains the default checkout path;
- wallet payment option for signed-in customers;
- insufficient-balance and inactive-wallet handling;
- top-up shortcut from checkout;
- stable idempotency for same-payload retries;
- fresh idempotency key when purchase details change;
- immediate ticket-confirmation navigation after wallet purchase;
- exact backend draw schedule passed into confirmation when available.

## Next Tasks

Only after the user accepts this increment:
1. Convert agent ticket sales to prepaid wallet accounting with atomic balance enforcement and commission recognition.
2. Credit agent wallets immediately for eligible agent-paid prizes.
3. Stop creating new remittance debt after the prepaid-agent cutover.
4. Retire `UNSETTLED_REMITTANCE` automatic suspension for post-cutover activity while preserving historical remittance records.
5. Update admin finance views for agent/customer wallet balances, funding history, and wallet activity.
6. Remove obsolete remittance-first UX after prepaid sales are accepted.
7. Complete controlled end-to-end rollout testing.

## Known Issues

- Agent sales still create agent receivables and feed the remittance worker.
- The remittance deadline worker can still suspend agents for `UNSETTLED_REMITTANCE`.
- Customer wallet checkout requires a signed-in customer; guest/direct checkout continues through Paystack.
- Agent wallet funds do not yet replace the legacy agent receivable/remittance sale model.
- Production Monnify/Flutterwave credentials and treasury values still need controlled configuration before live funding/payout testing.
- The existing confirmation page has limited jackpot-progress context for wallet purchases when no new free jackpot entry is minted; ticket issuance itself is unaffected.

## Testing Status

Latest user test:
- FAILED during `pnpm build` in `web-customer`;
- Next.js reported a JSX syntax error in `buy-form.tsx` at the signed-in wallet payment branch;
- root cause: the true branch of the `signedIn` ternary returned the wallet payment button and top-up link as sibling JSX nodes without a wrapping fragment;
- fix: wrap those sibling nodes in a React fragment with no payment logic change;
- awaiting user re-test after the fix commit.

Previous increment:
- agent wallet page, top-up initiation, callback/status verification, funding history, ledger activity, navigation, and dashboard wallet shortcut were present on latest `main`;
- user reported the build green;
- agent wallet/top-up experience is accepted.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state before changes;
- inspected customer buy form, authentication/session helpers, shared API client, wallet purchase controller/service, wallet response types, direct Paystack purchase flow, and confirmation page;
- confirmed wallet ticket purchase backend is already atomic and idempotent;
- confirmed no Prisma schema or database migration is required;
- preserved guest/direct Paystack checkout unchanged;
- reviewed replay-response shape so client code does not depend on fields omitted by an idempotent replay;
- reviewed idempotency-key reuse so retries are safe without conflicting after purchase details change.

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
- Paystack remains the default customer checkout path even for signed-in customers.
- Wallet payment is an authenticated alternative, not a replacement for direct Paystack checkout.
- Wallet purchase balance checks in the UI are advisory; backend serializable transaction/ledger checks remain authoritative.
- Wallet purchase idempotency keys are stable for same-payload retries and rotate when purchase details materially change.
- Historical remittances remain auditable; the future prepaid-agent cutover must stop only new debt generation rather than deleting history.

## Last Commit

`fix: wrap signed-in wallet payment branch` (latest fix cycle)
