# AI Build State

Updated: 2026-09-22

## Current Goal

Finish technical cleanup after the prepaid-wallet transition, then run controlled end-to-end rollout testing before live money movement is enabled.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Admin + Finance Wallet Operations. The user instructed development to move to the next increment on 2026-09-22, satisfying the manual acceptance gate.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Bank prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet`.
- Agent wallet UI is available at `/wallet`.
- Signed-in customers can buy tickets from their wallet or continue with Paystack.
- New agent ticket sales are prepaid:
  - customer pays the gross cash amount;
  - agent retains configured commission;
  - SureWina's net share is debited immediately from the agent wallet;
  - prepaid sales do not create remittance debt.
- Eligible agent-paid prizes are reimbursed immediately to the agent wallet.
- Historical remittance remains stored, settleable, auditable, and separated from current prepaid operations.
- Finance can browse customer/agent wallets, balances, funding, ledger activity, prepaid agent activity, prize reimbursements, and funding exceptions from `/wallets`.
- This increment removes obsolete agent financial compatibility code:
  - speculative offline sales are no longer queued or replayed;
  - any old `surewina_agent_offline_sales` localStorage payload is discarded when the authenticated agent shell starts;
  - an offline sale draft may remain on-device, but completing a sale still requires a live wallet check and live API transaction;
  - the sale-complete screen has no queued/temporary-ticket state;
  - the dead browser prize-payout ledger and finance monkey-patch are removed;
  - the local agent mock contains only temporary non-finance data for Customers, Super Agent, and Training screens;
  - the dashboard contract now exposes `selling`, `wallet`, and `legacyRemittance` explicitly instead of fake `accruing.netNgn` and mixed `settlement` compatibility fields;
  - admin notifications/dashboard wording identifies remittance as historical/legacy;
  - the remittance worker remains only as a legacy catch-up path and already filters for receivable-backed sales / legacy payouts.

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

Accepted wallet UX/accounting:
- agent wallet funding backend;
- customer wallet/top-up UI;
- agent wallet/top-up UI;
- customer wallet payment at checkout;
- prepaid agent ticket sales with immediate commission recognition;
- immediate wallet reimbursement for eligible agent-paid prizes;
- retirement of `UNSETTLED_REMITTANCE` selling suspension;
- agent UX separation of current prepaid operations and historical remittance;
- admin/finance wallet operations and prepaid-agent visibility.

Current engineering increment:
- remove legacy offline-sale queue/replay;
- safely discard old offline-sale localStorage data without replay;
- remove queued-sale completion UI;
- remove dead browser prize-payout finance ledger/wiring;
- trim finance/remittance/sale simulator code out of `agent-mock.ts`;
- update remaining mock training copy to prepaid-wallet terminology;
- replace dashboard compatibility fields with explicit current-vs-legacy concepts;
- update stale admin remittance wording;
- clarify the worker remittance sweep is legacy catch-up only.

## Next Tasks

Only after the user accepts this increment:
1. Run controlled end-to-end rollout testing across customer, agent, worker, admin, ledger, wallet funding, prize payout, remittance-history, reconciliation, and treasury flows.
2. Finalize production Monnify/Flutterwave and treasury configuration, then perform controlled small-value live payment tests before enabling live money movement.

## Known Issues

- Historical remittance settlement controls remain intentionally available until every legacy obligation is settled or otherwise resolved.
- The worker still contains the legacy remittance sweep/deadline services because historical receivable-backed sales must remain catch-up capable and auditable.
- Exact `UNSETTLED_REMITTANCE` suspension cleanup remains intentionally present until old debt-only suspensions have been retired; it does not affect manual/compliance suspensions.
- Production Monnify/Flutterwave credentials and treasury values still require controlled configuration before live provider testing.
- Agent cash prize payout still depends on existing agent-payable eligibility/status rules and `AGENT_PAYOUT_MAX_NGN`.
- Customer, Super Agent, and Training agent-portal screens still use temporary local mock data; financial operations no longer depend on that mock store.

## Testing Status

Previous increment:
- Finance wallet registry/detail, ledger/funding visibility, prepaid agent summaries, and wallet controls were added;
- AUDITOR mutation access was blocked at the API boundary;
- admin remittance was separated as legacy;
- user instructed development to move on, so the increment is accepted.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state;
- confirmed no root `AGENTS.md` is present;
- traced every current consumer of the offline-sale queue before removal;
- confirmed the old queue could replay stale localStorage sales through the live prepaid sale endpoint, so replay is unsafe under wallet-backed settlement;
- confirmed current sale confirmation already blocks offline completion and preserves only the harmless sale draft;
- confirmed the worker remittance sweep already selects only legacy receivable-backed AGENT_CASH sales and legacy non-wallet-reimbursed payouts;
- confirmed remittance history/settlement services remain required for historical obligations;
- traced agent mock consumers and retained only non-finance mock functions still used by live pages;
- verified dashboard API service, shared API client, and agent UI candidate all use the same `selling` / `wallet` / `legacyRemittance` contract;
- removed stale current-model remittance wording from admin notifications/dashboard and training copy;
- no Prisma schema or database migration is required;
- no environment change is required.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run before push;
- user local build after `168f3ab` failed in `apps/web-agent/src/lib/agent-mock.ts` because the cleanup introduced a local variable named `module`, which violates Next.js `@next/next/no-assign-module-variable`;
- the regression is fixed by renaming that local binding to `trainingModule`; no behavior changes;
- existing `<img>` messages are ESLint warnings and were not the build failure;
- repository CI is configured to run Prisma generation, type-check, and build on pushes to `main`;
- local browser/device acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- Agent sales require a live server transaction and live wallet authorization; speculative offline sale replay is prohibited.
- Offline sale drafts may be preserved locally, but no ticket/customer coverage exists until the API confirms the prepaid sale.
- New agent sales are prepaid and never feed new remittance debt.
- Eligible agent-paid prizes reimburse the agent wallet immediately.
- Historical remittance remains an auditable legacy obligation only.
- Legacy remittance catch-up is determined by ledger linkage, not merely by `PaymentGateway.AGENT_CASH`.
- Browser/local mock stores must not maintain shadow financial state.

## Last Commit

`fix: avoid reserved module variable in agent mock` (this development cycle)
