# AI Build State

Updated: 2026-09-22

## Current Goal

Complete the prepaid-wallet transition across SureWina so current customer/agent operations use wallet-backed accounting while legacy remittance remains clearly separated as historical debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Retire automatic remittance debt suspension. The user reported the increment green on 2026-09-22, satisfying the manual acceptance gate.

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
- Historical remittance records remain stored, visible, settleable, and auditable.
- Historical remittance can become `LATE`, but it no longer suspends or blocks prepaid selling.
- Existing legacy debt-only suspensions are automatically retired without affecting manual/compliance suspensions.
- This increment updates the agent UX to reflect the architecture:
  - top navigation calls the old flow `Legacy debt`, not `Remit`;
  - header status identifies the current operating mode as `Prepaid wallet`;
  - dashboard shortcuts and debt banners explicitly say historical/legacy;
  - wallet messaging explains that current sales settle immediately and old remittance is separate;
  - remittance current/history screens are framed as historical records;
  - bank transfer instructions only appear when a historical balance remains;
  - commission copy describes real-time prepaid commission and historical remittance records separately.

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
- retirement of `UNSETTLED_REMITTANCE` selling suspension.

Current engineering increment:
- rename agent remittance navigation to legacy debt;
- replace stale header remittance status with prepaid-wallet operating mode;
- make dashboard debt notices explicitly historical;
- remove stale wallet copy claiming current sales still use remittance;
- reframe remittance current/history pages as legacy obligations;
- hide legacy bank settlement instructions when no historical balance is due;
- keep historical wallet/bank settlement actions intact;
- update commission messaging to separate prepaid earnings from remittance-era records.

## Next Tasks

Only after the user accepts this increment:
1. Update admin/finance views for customer and agent wallet balances, funding history, wallet activity, prepaid agent sales, commission, prize reimbursements, and historical remittance separation.
2. Remove remaining dead compatibility code, especially obsolete offline-sale queue/sync infrastructure and stale remittance-first assumptions after repository-wide review.
3. Complete controlled end-to-end rollout testing.
4. Finalize production provider/treasury configuration and small-value live payment verification before enabling live money movement.

## Known Issues

- Historical remittance settlement controls remain intentionally available until every legacy obligation is settled or otherwise resolved.
- Legacy offline sale queue records can still exist on devices, although they no longer auto-sync.
- Admin/finance screens have not yet been updated to expose the full prepaid wallet model.
- Production Monnify/Flutterwave credentials and treasury values still require controlled configuration before live provider testing.
- Agent cash prize payout still depends on existing agent-payable eligibility/status rules and `AGENT_PAYOUT_MAX_NGN`.

## Testing Status

Previous increment:
- overdue historical remittance stopped suspending prepaid agents;
- exact legacy debt suspensions are automatically retired;
- manual/compliance/termination controls remain intact;
- dashboard and SMS no longer threaten a selling lockout;
- user reported the increment green on 2026-09-22.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state;
- confirmed no root `AGENTS.md` is present;
- inspected agent header/navigation, dashboard, wallet, remittance current page, remittance history, commission UI, and shared remittance API contract;
- preserved all historical settlement routes and backend records;
- did not change remittance accounting, database schema, or provider behavior;
- removed stale wording that presented remittance as the active model;
- ensured current wallet operations are described as prepaid and historical debt remains clearly separated;
- bank settlement instructions are hidden when there is no outstanding historical amount.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run from this session before push;
- repository CI is configured to run Prisma generation, type-check, and build on pushes to `main`;
- local browser/device acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- New agent sales are prepaid.
- Eligible agent-paid prizes reimburse the agent wallet immediately.
- Historical remittance remains an auditable legacy obligation only.
- Legacy debt remains settleable but does not control current selling access.
- Current agent financial UX should center Wallet; legacy remittance should be visibly historical.
- No historical financial records are deleted as part of UX cleanup.

## Last Commit

`feat: separate legacy remittance from prepaid UX` (this development cycle)
