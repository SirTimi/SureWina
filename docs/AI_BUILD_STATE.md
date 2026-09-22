# AI Build State

Updated: 2026-09-22

## Current Goal

Move SureWina to ledger-backed customer and agent wallets, with agents operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Agent-paid prize wallet reimbursement. The user reported the increment green on 2026-09-22, satisfying the manual acceptance gate.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Bank prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet`.
- Agent wallet UI is available at `/wallet`.
- Signed-in customers can buy tickets from their wallet or continue with Paystack.
- New agent ticket sales are prepaid:
  - customer pays the gross cash amount;
  - agent retains configured commission;
  - SureWina's net share is debited immediately from the agent wallet;
  - prepaid sales do not create new remittance debt.
- New eligible agent-paid prizes are reimbursed immediately to the agent wallet and do not feed new remittance accounting.
- Historical remittance records remain stored, visible, settleable, and auditable.
- This increment retires debt-based agent suspension:
  - historical remittances can still become `LATE`;
  - an overdue remittance no longer changes an agent from `ACTIVE` to `SUSPENDED`;
  - no remittance lockout SMS is sent;
  - existing agents suspended specifically for `UNSETTLED_REMITTANCE` are automatically reactivated;
  - reactivation is guarded by the exact legacy suspension reason and is audited;
  - manual/compliance suspensions and terminated agents remain unaffected.
- Agent dashboard keeps historical debt visible but no longer disables prepaid selling because of remittance.
- OTP sign-in also self-heals the retired debt-only suspension if the Worker has not performed cleanup yet.

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
- immediate wallet reimbursement for eligible agent-paid prizes.

Current engineering increment:
- remove automatic `UNSETTLED_REMITTANCE` suspension;
- preserve remittance due dates and `LATE` status;
- audit newly late historical remittances without blocking selling;
- reactivate only legacy debt-suspended agents;
- retain manual/compliance suspension controls;
- remove remittance lockout SMS copy;
- remove agent-dashboard debt lock state;
- keep historical remittance settlement links and warnings without threatening selling lockout;
- add OTP-path recovery for legacy debt suspension when Worker cleanup has not yet run.

## Next Tasks

Only after the user accepts this increment:
1. Update agent/remittance UX so historical remittance is clearly presented as legacy debt rather than an active operating model.
2. Update admin finance views for customer/agent wallet balances, funding history, wallet activity, prize reimbursements, and prepaid agent operations.
3. Remove remaining obsolete remittance-first UX and dead offline-sale sync paths after compatibility review.
4. Complete controlled end-to-end rollout testing.

## Known Issues

- Legacy remittance pages still contain operational controls because historical obligations remain settleable; broader legacy UX cleanup is the next increment.
- Legacy offline sale queue entries remain stored locally and do not auto-sync.
- Production Monnify/Flutterwave credentials and treasury values still need controlled configuration before live provider testing.
- Agent cash prize payout still depends on the existing agent-payable eligibility/status rules and configured `AGENT_PAYOUT_MAX_NGN`.

## Testing Status

Previous increment:
- eligible agent-paid cash prizes moved from Agent Receivable offsets to immediate Agent Available wallet reimbursement;
- new wallet-reimbursed payouts were excluded from remittance sweep;
- legacy receivable-backed payouts remained auditable;
- user reported the increment green on 2026-09-22.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state;
- searched all repository references to `UNSETTLED_REMITTANCE`, debt-lock state, remittance suspension, and agent status enforcement;
- confirmed the Worker is the only automatic producer of the debt suspension reason;
- confirmed agent authentication independently blocks legitimate `SUSPENDED` and `TERMINATED` statuses;
- preserved those manual/compliance/termination protections;
- changed the deadline Worker to mark historical debt `LATE` without changing agent status;
- added guarded cleanup for existing debt-only suspensions with immutable audit logs;
- added guarded OTP-path recovery so legacy debt suspension does not strand an agent if the Worker is unavailable;
- updated dashboard/API client state so remittance debt no longer disables the Sell button;
- updated SMS text so it requests settlement without claiming selling will be locked;
- no Prisma schema or database migration is required.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run from this session before push;
- repository CI is configured to run Prisma generation, type-check, and build on pushes to `main`;
- local worker/API/browser acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- New agent sales are prepaid.
- New eligible agent-paid prizes are reimbursed immediately to the agent wallet.
- Historical remittance is an auditable legacy obligation, not an authorization boundary for prepaid selling.
- `PENDING` remittances may become `LATE`, but `LATE` does not suspend selling.
- `UNSETTLED_REMITTANCE` is a retired suspension reason used only to identify and safely reactivate legacy debt-suspended agents.
- Manual/compliance suspensions remain valid and continue to block agent authentication.
- Historical remittance settlement is preserved until the legacy-debt cleanup/UX work is separately accepted.

## Last Commit

`feat: retire remittance debt suspension` (this development cycle)
