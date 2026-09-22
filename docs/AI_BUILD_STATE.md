# AI Build State

Updated: 2026-09-22

## Current Goal

Complete the prepaid-wallet transition across SureWina and expose the new customer/agent wallet model clearly to Finance before production rollout.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Separate legacy remittance from prepaid agent UX. The user instructed development to move to the next increment on 2026-09-22, satisfying the manual acceptance gate.

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
- Historical remittance remains stored, settleable, auditable, and visibly separated from current prepaid operations.
- Remittance debt no longer suspends prepaid selling.
- This increment adds Finance wallet operations in the admin portal:
  - new `/wallets` finance registry;
  - search/filter by owner type, wallet status, customer identity, or agent identity;
  - ledger-derived available/held/total balances;
  - latest funding status on the registry;
  - `REVIEW_REQUIRED` funding visibility with owner context;
  - per-wallet detail with owner identity, ledger activity, and funding history;
  - agent wallet detail includes all-time prepaid sales, wallet usage, recognised commission, prize reimbursements, and historical remittance context;
  - existing audited freeze/unfreeze/close controls are exposed to Finance/Super admins;
  - auditors remain read-only in both the admin UI and wallet/funding mutation endpoints;
  - admin remittance navigation/copy now identifies remittance as legacy.

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
- agent UX separation of current prepaid operations and historical remittance.

Current engineering increment:
- finance wallet registry and filters;
- finance wallet owner context;
- ledger-derived wallet balances;
- wallet ledger drill-down;
- wallet funding history drill-down;
- review-required funding queue visibility;
- prepaid agent activity summary from immutable ledger journals;
- historical remittance context on agent wallet detail;
- audited wallet freeze/unfreeze/close controls;
- admin finance navigation updated to Wallets + Legacy remittance.

## Next Tasks

Only after the user accepts this increment:
1. Remove remaining dead compatibility code, especially obsolete offline-sale queue/sync infrastructure and stale remittance-first assumptions after a repository-wide review.
2. Complete controlled end-to-end rollout testing across customer, agent, worker, admin, ledger, and treasury flows.
3. Finalize production provider/treasury configuration and perform controlled small-value live payment tests before enabling live money movement.

## Known Issues

- Historical remittance settlement controls remain intentionally available until every legacy obligation is settled or otherwise resolved.
- Legacy offline sale queue records can still exist on agent devices, although they no longer auto-sync.
- Production Monnify/Flutterwave credentials and treasury values still require controlled configuration before live provider testing.
- Agent cash prize payout still depends on existing agent-payable eligibility/status rules and `AGENT_PAYOUT_MAX_NGN`.
- The wallet registry's aggregate balance cards intentionally describe the currently loaded page as "visible" balances; they are not system-wide treasury totals.

## Testing Status

Previous increment:
- agent navigation/header now centres prepaid wallet operation;
- remittance current/history pages are explicitly historical;
- wallet and commission copy no longer describe remittance as the current model;
- historical settlement actions were preserved;
- user instructed development to move on, so the increment is accepted.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state;
- confirmed no root `AGENTS.md` is present;
- inspected existing wallet admin controls, wallet funding review endpoint, wallet ledger service, treasury/admin navigation, admin permissions, and legacy remittance finance view;
- added read/query endpoints without changing ledger posting or money movement;
- wallet list balances are derived from immutable ledger entries;
- agent finance summary derives prepaid wallet debits, per-sale commission journals, and wallet prize reimbursements from ledger data;
- historical remittance outstanding remains a separate aggregate;
- reused existing audited wallet status transitions rather than adding new mutation rules;
- hardened wallet provisioning/status and funding-refresh mutations so AUDITOR tier is rejected at the API boundary, not only hidden in the UI;
- no Prisma schema or database migration is required;
- no environment change is required.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run before push;
- repository CI is configured to run Prisma generation, type-check, and build on pushes to `main`;
- local admin/API/browser acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- New agent sales are prepaid.
- Eligible agent-paid prizes reimburse the agent wallet immediately.
- Historical remittance remains an auditable legacy obligation only.
- Finance wallet views must display ledger-backed balances rather than deprecated cached agent wallet fields.
- Prepaid agent activity is reconstructed from immutable AGENT_SALE, COMMISSION, and PRIZE_PAYOUT journals.
- Wallet status controls reuse the existing audited backend state transitions.
- No historical financial records are deleted as part of finance/admin visibility work.

## Last Commit

`feat: add admin wallet finance operations` (this development cycle)
