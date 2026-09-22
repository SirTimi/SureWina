# AI Build State

Updated: 2026-09-22

## Current Goal

Validate the completed prepaid-wallet architecture end to end, then move to production provider/treasury configuration and controlled small-value live-money verification.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Technical legacy cleanup. The user reported the build green on 2026-09-22, satisfying the manual acceptance gate.

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
- Legacy browser-side financial compatibility code has been removed:
  - no speculative offline sale queue/replay;
  - no browser shadow prize-payment ledger;
  - no remittance-era finance simulator in the agent mock store;
  - dashboard API contract explicitly separates selling, wallet, and legacy remittance.
- This increment adds a repeatable controlled-rollout gate:
  - `pnpm --filter @surewina/api rollout:check` performs read-only database/ledger validation;
  - `--json` provides machine-readable output;
  - `--strict-review` makes any Finance review item fail the gate;
  - `--production` adds production provider/callback/treasury/cutover validation;
  - the checker never initializes payments, payouts, settlements, or provider synchronization;
  - `docs/FINANCIAL_ROLLOUT_RUNBOOK.md` defines the manual sandbox/local and future live verification matrix.

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
- admin/finance wallet operations and prepaid-agent visibility;
- technical cleanup of offline sale replay and browser shadow finance state.

Current engineering increment:
- read-only ledger balance validation;
- required system-ledger-account validation;
- wallet owner/account wiring validation;
- negative wallet balance detection;
- payment collection ledger-link validation;
- wallet funding journal validation and review/stale-funding visibility;
- completed wallet-purchase hold/ticket validation;
- prepaid agent sale wallet+commission=gross validation;
- agent prize reimbursement validation;
- successful bank-prize payout journal validation;
- retired debt-suspension validation;
- open reconciliation issue gate;
- financial Suspense balance gate;
- treasury registry/ledger mapping gate;
- Phase 8 migration status gate;
- historical remittance visibility;
- stricter production configuration validation;
- manual financial rollout runbook.

## Next Tasks

Only after the user accepts this increment:
1. Run the controlled sandbox/local business-flow matrix in `docs/FINANCIAL_ROLLOUT_RUNBOOK.md` and clear all blocker/review items intended for the rollout environment.
2. Finalize production Monnify/Flutterwave/Paystack callback and treasury configuration.
3. Run `rollout:check --production --strict-review`.
4. Perform one-at-a-time small-value live-money verification with dedicated controlled accounts before enabling normal live money movement.

## Known Issues

- Historical remittance settlement controls remain intentionally available until every legacy obligation is settled or otherwise resolved.
- The worker still contains legacy remittance catch-up/deadline services because historical receivable-backed records must remain auditable.
- Exact `UNSETTLED_REMITTANCE` cleanup remains intentionally present until old debt-only suspensions are gone.
- Production Monnify/Flutterwave credentials and treasury values still require controlled configuration before live provider testing.
- Customer, Super Agent, and Training agent-portal screens still use temporary local mock data; financial operations do not depend on that mock store.
- The rollout checker is intentionally database/ledger read-only. Browser/provider behavior remains a manual controlled-flow test documented in the runbook.

## Testing Status

Previous increment:
- legacy offline sale queue/replay removed;
- queued/temporary sale-success UI removed;
- dead browser prize-payment finance ledger/wiring removed;
- agent finance mock state removed;
- dashboard contract simplified to current selling/wallet plus historical remittance;
- local build initially failed because `agent-mock.ts` used the reserved local variable name `module`;
- fix commit `5fe7acab3079fc1cfbd0562f71ff99f1838f33a6` renamed it to `trainingModule`;
- user reported the resulting build green.

Current increment engineering review:
- inspected latest `main`, recent commits, package scripts, Phase 8 migration tooling, ledger service semantics, wallet/purchase/funding schemas, agent-sale accounting, agent-prize accounting, bank-prize payout finalization, reconciliation models, treasury bootstrap, and production environment validation;
- confirmed there was no existing end-to-end financial test harness;
- designed the checker to distinguish objective BLOCKER states from REVIEW items;
- confirmed ledger `totalAmountNgn` represents total debit, so the checker verifies entry count, debit=credit, and debit=stored total;
- confirmed completed wallet purchases are atomic and therefore must not leave persisted PENDING purchases or HELD purchase holds;
- confirmed prepaid agent sales are distinguishable from legacy sales by AGENT_AVAILABLE vs AGENT_RECEIVABLE ledger participation;
- confirmed current agent prize reimbursement uses AGENT_AVAILABLE while legacy payouts remain AGENT_RECEIVABLE-backed;
- confirmed successful bank payouts debit Prize Payable and credit provider Payout Clearing;
- production mode checks configuration only and makes no external provider requests;
- production mode additionally requires NODE_ENV=production and HTTPS public callback URLs;
- no Prisma schema or database migration is required;
- no new environment variable is required.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check`, `pnpm build`, and the database rollout check cannot be executed before push;
- user local `rollout:check` after `46143e1` first failed before validation because the rollout-only module reused the full API Joi schema; commit `8fad349` decoupled the checker from full runtime env validation;
- the next local run reached `RolloutCheckService` but `PrismaService` was undefined under the standalone `tsx` Nest context because constructor metadata was not reliably available;
- fix: `RolloutCheckService` now uses explicit Nest `@Inject(PrismaService)` and `@Inject(ConfigService)` tokens, making the standalone CLI independent of implicit decorator metadata;
- normal API startup and financial runtime behavior remain unchanged;
- local validation must include build/type-check plus `pnpm --filter @surewina/api rollout:check`;
- the manual browser/provider matrix remains a separate acceptance step after the checker itself builds and runs.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- Agent sales require a live server transaction and live wallet authorization.
- New agent sales are prepaid and never feed new remittance debt.
- Eligible agent-paid prizes reimburse the agent wallet immediately.
- Historical remittance remains an auditable legacy obligation only.
- A financial rollout gate must be repeatable and read-only by default.
- Database corruption/invariant failures are BLOCKERs.
- Operational exceptions that require Finance judgment are REVIEW items.
- Production rollout uses `--production --strict-review`; it must not silently ignore any review queue.
- Provider calls and real-money actions are deliberately outside the automated rollout checker.

## Last Commit

`fix: inject rollout checker dependencies explicitly` (this development cycle)
