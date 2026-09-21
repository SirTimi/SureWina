# AI Build State

Updated: 2026-09-21

## Current Goal

Move SureWina toward ledger-backed customer and agent wallets, with agents ultimately operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

The production migration/build/service restart for the Paystack direct web-purchase restoration was reported successful. End-to-end payment-path acceptance is still pending separately.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Customer wallet funding endpoints remain available under `/wallet/funding/*`.
- This increment adds authenticated agent wallet access plus agent wallet funding through the same verified Monnify/Flutterwave funding pipeline.
- Agent wallet funding callbacks use `AGENT_WEB_BASE_URL`, keeping agent checkout returns separate from the customer site.
- Finance review output for wallet-funding mismatches now identifies whether the wallet owner is a CUSTOMER or AGENT.
- Agent ticket sales still use the legacy receivable/remittance model in this increment; prepaid sale accounting is intentionally deferred until this funding slice is accepted.

## Completed

Financial architecture foundation:
- Phase 0: architecture freeze.
- Phase 1: current money-risk fixes.
- Phase 2: immutable double-entry ledger.
- Phase 3: ledger-backed wallets.
- Phase 4: customer wallet funding.
- Phase 5: wallet ticket purchases.
- Phase 6: multi-provider prize payouts.
- Phase 7: reconciliation and treasury.
- Phase 8 migration/hardening control plane and production schema migration.

Recent collection change:
- Paystack restored as the direct web ticket-purchase collection rail.
- Paystack remains blocked for wallet funding.
- Monnify and Flutterwave remain the wallet-funding and payout rails.

Current engineering increment:
- agent wallet retrieval endpoint;
- agent wallet ledger-history endpoint;
- agent Monnify/Flutterwave funding initiation endpoint;
- agent funding status endpoint with provider verification/self-healing;
- agent funding history endpoint;
- agent-specific funding callback base configuration;
- finance review ownership metadata for agent wallet fundings.

## Next Tasks

Only after the user accepts this increment:
1. Add customer wallet/top-up UI and callback/status experience.
2. Add agent wallet/top-up UI and callback/status experience.
3. Convert agent ticket sales to prepaid wallet accounting with atomic balance enforcement and commission recognition.
4. Credit agent wallets immediately for eligible agent-paid prizes.
5. Stop creating new remittance debt after the prepaid-agent cutover.
6. Retire `UNSETTLED_REMITTANCE` automatic suspension for post-cutover activity while preserving historical remittance records.
7. Update admin finance views for agent wallet balances, funding history, and wallet activity.
8. Complete controlled rollout testing.

## Known Issues

- Agent sales still create agent receivables and feed the remittance worker. Do not treat the prepaid-agent migration as complete yet.
- The remittance deadline worker can still suspend agents for `UNSETTLED_REMITTANCE` until the later prepaid-sale cutover increment is accepted.
- Customer and agent wallet top-up UI is not implemented yet.
- `AGENT_WEB_BASE_URL` must be set to the public agent-site origin in production before agent funding is enabled there.
- The repository state document before this increment incorrectly described Paystack as legacy-only; this file now reflects the restored direct-purchase architecture.

## Testing Status

Engineering review for this increment:
- inspected latest `main` before changes;
- inspected recent commits;
- confirmed no repository-root `AGENTS.md` is present;
- inspected wallet, payment, agent-ops, environment validation, and module wiring;
- confirmed no Prisma schema change or migration is required;
- confirmed agent wallets already exist in the generic wallet model and `WalletFunding` is wallet-owner agnostic;
- confirmed the existing funding DTO restricts funding rails to Monnify or Flutterwave.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be executed before the push from this session;
- repository CI is configured to run Prisma generation, full type-check, and full build on pushes to `main`;
- local/device/API acceptance remains required from the user before this increment is marked accepted.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- Agent wallet funding reuses the existing `WalletFunding` model rather than creating a parallel funding table.
- Agent identity for wallet endpoints comes from the authenticated agent JWT; the client cannot submit an arbitrary `agentId`.
- Funding confirmation remains provider-verified and idempotent.
- Agent funding is restricted to ACTIVE agents in this increment.
- Historical remittances remain auditable; the future prepaid-agent cutover must stop only new debt generation rather than deleting history.

## Last Commit

`feat: add agent wallet funding endpoints` (this development cycle)
