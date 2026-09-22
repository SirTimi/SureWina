# AI Build State

Updated: 2026-09-22

## Current Goal

Move SureWina to ledger-backed customer and agent wallets, with agents operating on a prepaid wallet model instead of accumulating new remittance debt.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Prepaid agent ticket sales. The user reported the increment green on 2026-09-22, satisfying the manual acceptance gate.

## Current Implementation

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Prize payouts to bank use Monnify or Flutterwave.
- Ledger-backed wallets support both CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet`.
- Agent wallet UI is available at `/wallet`.
- Signed-in customers can buy tickets from their wallet or continue with Paystack.
- New agent ticket sales are prepaid:
  - customer pays the gross cash amount;
  - agent retains configured commission;
  - SureWina's net share is debited immediately from the agent wallet;
  - prepaid sales do not create new remittance debt.
- This increment converts NEW eligible agent-paid cash prizes to immediate wallet reimbursement:
  - the agent physically pays the winner the validated net cash prize;
  - Prize Payable is debited;
  - Agent Available Wallet is credited for the same net amount;
  - the reimbursement journal is linked through `PrizeClaim.agentPayoutLedgerTxnId`;
  - no Agent Receivable is touched.
- New wallet-reimbursed prize payouts are excluded from remittance sweep.
- Legacy agent-paid prizes that used Agent Receivable remain part of historical remittance accounting.
- Agent daily-record reconciliation distinguishes legacy remittance payouts from wallet-reimbursed payouts.
- The prize-payment UI reports the wallet reimbursement and resulting wallet balance immediately.
- Intraday remittance accrual is now neutralized; new sales and prize payouts settle against the wallet in real time.

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
- prepaid agent ticket sales with immediate commission recognition.

Current engineering increment:
- direct agent-wallet reimbursement for eligible agent-paid prizes;
- net prize amount used as the actual cash/reimbursement amount;
- wallet balance returned after prize payment;
- remittance sweep restricted to legacy receivable-backed prize payouts;
- daily finance record identifies wallet reimbursement vs legacy remittance settlement;
- remittance-page wallet copy updated for top-ups/reimbursements;
- obsolete intraday remittance amount set to zero while retaining the API field for compatibility.

## Next Tasks

Only after the user accepts this increment:
1. Retire `UNSETTLED_REMITTANCE` automatic suspension for post-cutover operations while preserving historical obligations and audit history.
2. Update agent/remittance UX so historical debt is clearly separated from prepaid operations.
3. Update admin finance views for agent/customer wallet balances, funding history, wallet activity, and prepaid agent operations.
4. Remove remaining obsolete remittance-first UX and dead offline-sale sync paths after compatibility review.
5. Complete controlled end-to-end rollout testing.

## Known Issues

- Historical positive remittances can still trigger `UNSETTLED_REMITTANCE` suspension; retirement of debt-based suspension is the next controlled increment.
- Legacy offline sale queue entries remain stored locally and do not auto-sync.
- Remittance pages still exist because historical obligations must remain settleable/auditable.
- Production Monnify/Flutterwave credentials and treasury values still need controlled configuration before live provider testing.
- Agent cash prize payout still depends on the existing agent-payable eligibility/status rules and configured `AGENT_PAYOUT_MAX_NGN`.

## Testing Status

Previous increment:
- new agent ticket sales became prepaid wallet transactions;
- commission became per-sale ledger accounting;
- new prepaid sales stopped creating remittance debt;
- offline speculative sales were disabled;
- user reported the increment green on 2026-09-22.

Current increment engineering review:
- inspected latest `main`, recent commits, and current project state;
- inspected agent prize lookup/payment service, prize accrual/payout ledger accounting, wallet credit behavior, remittance sweep, daily agent records, dashboard state, agent prize UI, and shared API-client response types;
- confirmed AgentOpsModule already imports WalletModule, so no module wiring change is required;
- confirmed no Prisma schema or database migration is required;
- confirmed Phase 8 agent-prize migration applies only to pre-cutover legacy records and does not reinterpret new wallet-reimbursement journals;
- preserved legacy receivable-backed prize accounting for historical remittances;
- retained immutable `agentPayoutLedgerTxnId` as the accounting link for both historical and prepaid-era agent payouts.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check` and `pnpm build` cannot be run from this session before push;
- repository CI is configured to run Prisma generation, type-check, and build on pushes to `main`;
- local browser/device/database acceptance remains required from the user.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- New agent sales are prepaid.
- New eligible agent-paid prizes are reimbursed immediately to the agent wallet.
- Agent prize reimbursement journal:
  - DEBIT `SYS:PRIZE:PAYABLE`;
  - CREDIT agent `AGENT_AVAILABLE` wallet account.
- Reimbursement amount is the claim's net prize value.
- New wallet-reimbursed payouts must never create or reduce new remittance debt.
- Legacy prize payouts remain identifiable by Agent Receivable participation.
- Historical remittances remain auditable and settleable until their dedicated retirement/cleanup steps.

## Last Commit

`feat: reimburse agent prize payouts to wallet` (this development cycle)
