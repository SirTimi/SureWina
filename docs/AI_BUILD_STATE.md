# AI Build State

Updated: 2026-09-20

## Source of truth

- Repository: `SirTimi/SureWina`
- Active branch: `main`
- Deployment pipeline: not treated as production approval; local/device testing remains required.

## Financial architecture roadmap

| Phase | Focus | State |
|---|---|---|
| 0 | Architecture freeze | Complete |
| 1 | Current money-risk fixes | Complete |
| 2 | Immutable double-entry ledger | Complete |
| 3 | Ledger-backed wallets | Complete |
| 4 | Wallet funding | Complete |
| 5 | Wallet ticket purchases | Complete |
| 6 | Multi-provider prize payouts | Complete |
| 7 | Reconciliation & treasury | Complete |
| 8 | Migration & hardening | In progress |
| 9 | Controlled rollout | Not started |

## Active collection and payout rails

Customer collections:
- MONNIFY
- FLUTTERWAVE

Prize payouts:
- MONNIFY
- FLUTTERWAVE

PAYSTACK is retained only for historical compatibility during migration. It is
not an active customer collection or payout rail.

## Phase 7 completed state

- Provider collections journal to separate Monnify/Flutterwave clearing accounts.
- Refund obligations and provider-funded settlements are ledger-backed.
- Agent cash sales, agent-paid prizes, commissions, wallet credits, and bank remittances are ledger-backed.
- Treasury accounts map collection clearing, payout wallets, and the primary bank.
- Flutterwave settlements and Monnify settlement events feed durable settlement records.
- Transaction/balance reconciliation creates durable Finance exceptions.
- Finance treasury dashboard supports reconciliation, snapshots, settlement sync, and issue resolution.
- Daily provider transaction reconciliation and provider wallet snapshots are recoverable/idempotent.

## Phase 8 current implementation

Implemented:
- durable `FinancialMigrationRun` / `FinancialMigrationItem` control plane;
- explicit `FINANCIAL_LEDGER_CUTOVER_AT` fence;
- pre-cutover remittance recovery disabled from normal operational recovery;
- DB trigger blocks new Paystack money rows;
- DB trigger freezes legacy `Agent.walletBalanceNgn` except migration-to-zero;
- ledger-backed payment/wallet/remittance/prize financial identities are write-once;
- standalone Phase 8 CLI module that does not boot normal recovery/polling services;
- resumable migration planner/applier/retry/status/audit/finalize commands;
- backfill support for collections, refunds, prize accruals, agent prizes, remittances, agent-wallet history, and legacy bank-payout history;
- Paystack checkout driver removed from active Nest registration.

Required before Phase 8 is marked complete:
- CI Prisma/type-check/build green on latest main;
- run local migration schema changes;
- create a Phase 8 plan using an explicit cutover;
- inspect plan/status output against local data;
- apply/backfill on local database;
- audit returns zero blocking counters;
- finalize local migration run;
- smoke-test Monnify/Flutterwave purchase, refund, payout, wallet, agent remittance, and treasury reconciliation paths.
