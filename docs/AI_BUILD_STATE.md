# AI Build State

Updated: 2026-09-22

## Current Goal

Move SureWina to ledger-backed customer and agent wallets, with agents operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Customer wallet payment at checkout. The user moved development forward after the JSX build fix, so the customer wallet-checkout increment is treated as accepted.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet`.
- Agent wallet UI is available at `/wallet` in the agent portal.
- Signed-in customers can buy tickets from their wallet or continue with Paystack.
- This increment converts NEW agent ticket sales to prepaid wallet settlement:
  - customer still pays the agent the gross cash amount;
  - agent commission is retained immediately;
  - only SureWina's net share is debited from the agent wallet;
  - full ticket revenue is recognized across the wallet collection and commission journals;
  - insufficient wallet balance aborts the entire sale before tickets are committed.
- New prepaid agent sales no longer qualify for remittance sweep because their collection ledger uses AGENT_AVAILABLE rather than AGENT_RECEIVABLE.
- Historical receivable-backed agent sales remain eligible for legacy remittance creation and settlement.
- Offline speculative ticket issuance is disabled for prepaid agent sales because wallet funds must be checked atomically online.
- Historical offline queue entries remain stored on-device and are no longer auto-synced.
- Agent commission totals now combine historical remittance commission with prepaid per-sale commission ledger entries.

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
- agent wallet/top-up UI;
- customer wallet payment at checkout.

Current engineering increment:
- prepaid agent sale accounting;
- atomic agent-wallet balance enforcement;
- per-sale commission recognition;
- legacy/new sale separation in remittance sweep;
- online-only final sale confirmation;
- agent sale confirmation shows real commission rate and wallet charge;
- dashboard replaces "owed today" with wallet usage;
- commission total includes prepaid commission ledger entries;
- legacy remittance daily breakdown remains historical.

## Next Tasks

Only after the user accepts this increment:
1. Credit agent wallets immediately for eligible agent-paid prizes.
2. Remove prize payouts from new remittance creation once wallet reimbursement is live.
3. Retire `UNSETTLED_REMITTANCE` automatic suspension for post-cutover operations while preserving historical obligations.
4. Update admin finance views for agent/customer wallet balances, funding history, and wallet activity.
5. Remove obsolete remittance-first UX while keeping historical remittance records accessible.
6. Complete controlled end-to-end rollout testing.

## Known Issues

- Agent-paid prizes still reduce/credit through the legacy remittance path until the next increment.
- Historical positive remittances can still trigger `UNSETTLED_REMITTANCE` suspension; retirement of debt-based suspension is a later controlled step.
- Legacy offline sale queue entries are preserved locally but no longer auto-sync.
- The commission daily-breakdown table remains a historical remittance view; current prepaid commission is reflected in live period estimates and the total commission figure.
- Production Monnify/Flutterwave credentials and treasury values still need controlled configuration before live funding/payout testing.

## Testing Status

Previous increment:
- customer checkout gained wallet payment while preserving Paystack;
- an initial JSX build failure in the signed-in wallet branch was fixed in commit `9877796593b7549f9e2baec317fb4d41bb185044`;
- user then instructed development to move to the next increment, satisfying the manual acceptance gate.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state;
- confirmed no root `AGENTS.md` is present;
- inspected agent sale creation, wallet debit behavior, ledger accounts, agent commission configuration, remittance sweep, remittance settlement, agent dashboard, sale confirmation, offline queue behavior, and commission summary;
- confirmed no Prisma schema or database migration is required;
- preserved historical remittance records and settlement behavior;
- verified new/legacy sale distinction is derived from immutable ledger account purpose rather than a guessed timestamp;
- checked downstream refund and treasury/reconciliation paths for assumptions that agent collection ledger amount must equal gross;
- no such gross-equality dependency was found for agent cash.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run from this session before push;
- repository CI is configured to run Prisma generation, full type-check, and full build on pushes to `main`;
- local browser/device and database acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- New agent sales are prepaid.
- For a gross agent sale:
  - wallet debit = gross minus commission;
  - commission expense = retained commission;
  - ticket revenue = gross across the two journals.
- Agent wallet balance is the sale authorization boundary; no wallet funds means no ticket sale.
- Final agent sale confirmation must be online.
- Legacy remittance eligibility is determined by AGENT_RECEIVABLE ledger participation.
- Prepaid AGENT_AVAILABLE sales must never create new remittance debt.
- Historical remittances remain auditable and settleable until their separate retirement/cleanup step.

## Last Commit

`feat: convert agent sales to prepaid wallet settlement` (this development cycle)
