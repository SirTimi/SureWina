# Phase 8 — Financial Migration & Hardening Runbook

Phase 8 moves financial state created before the ledger/treasury cutover into the
new accounting architecture without deleting historical business rows.

## Safety rules

- Never run `prisma migrate reset` on an environment containing SureWina data.
- Take a database backup/snapshot before applying Phase 8 in a shared or production environment.
- Pick one exact UTC cutover timestamp and do not change it after the migration plan is created.
- New money after the cutover must use Monnify or Flutterwave collections and the Phase 2–7 ledger paths.
- PAYSTACK is legacy-only. Historical rows remain readable; new Paystack money rows are blocked at the database.
- Ledger journals are immutable. Fix a bad migration through a corrective/reversal journal, never by editing posted entries.
- Do not mark a migration run FINALIZED while it has PENDING, FAILED, or REVIEW_REQUIRED items.

## 1. Choose the cutover

Use the exact instant when the new ledger-backed money flows became authoritative.

Example only:

```env
FINANCIAL_LEDGER_CUTOVER_AT=2026-09-20T07:00:00.000Z
```

The cutover means:

- records created before the timestamp may be Phase 8 legacy candidates;
- operational recovery services process only records at/after the timestamp;
- the migration CLI owns pre-cutover remittance history.

## 2. Pull, install, and migrate schema

```cmd
cd C:\dev\surewina
git pull origin main
pnpm install

pnpm --filter @surewina/api prisma:migrate:dev
pnpm --filter @surewina/api prisma:generate
pnpm --filter @surewina/api exec prisma migrate status --schema prisma/schema.prisma
```

For production/shared environments use the normal deployment migration command instead:

```cmd
pnpm --filter @surewina/api prisma:migrate:deploy
```

## 3. Plan only — no money changes

Before choosing the cutover, stop the API and Worker for the database being migrated so no new financial rows can cross the boundary while the plan is created.

For a local database that has never used the ledger-backed flows, capture the cutover immediately after stopping those services:

```powershell
$cutover = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$cutover
pnpm --filter @surewina/api phase8:migrate plan --cutover=$cutover --label="Phase 8 local cutover"
```

For an environment with an already-agreed historical cutover, use that exact timestamp instead:

```cmd
pnpm --filter @surewina/api phase8:migrate plan --cutover=2026-09-20T07:00:00.000Z --label="Phase 8 cutover"
```

Starting the migration CLI also idempotently bootstraps the required system ledger accounts and treasury registry. It does not call payment providers.

Save the returned `runId`.

The plan creates durable migration items for:

- legacy provider/agent collections missing collection journals;
- legacy refunds missing accrual/settlement journals;
- cash-prize accruals missing ledger journals;
- agent-paid prizes missing payout journals;
- legacy remittance commission/bank-settlement journals;
- legacy agent-wallet credits and wallet-settled remittances;
- legacy bank prize-payout summaries with no `PrizePayoutAttempt` history.

Planning does not post journals or zero legacy balances.

## 4. Inspect the plan

```cmd
pnpm --filter @surewina/api phase8:migrate status --run=<RUN_ID>
```

If the planned population is unexpectedly large or contains records outside the
intended legacy period, stop and verify the cutover timestamp before applying.

## 5. Apply in resumable batches

```cmd
pnpm --filter @surewina/api phase8:migrate apply --run=<RUN_ID> --batch=100
```

The engine applies items in dependency order:

1. payment collections;
2. refund accounting;
3. prize accruals;
4. agent-paid prize journals;
5. remittance commissions and received-bank settlements;
6. reconstructed legacy agent-wallet credits/settlements;
7. legacy bank prize-payout attempt history.

Every journal uses a deterministic Phase 8 idempotency key. Re-running an
already-applied item returns the existing financial state rather than posting
money twice.

## 6. Review exceptions

```cmd
pnpm --filter @surewina/api phase8:migrate status --run=<RUN_ID>
```

`REVIEW_REQUIRED` means the system deliberately refused to invent financial
facts. Common examples:

- stored legacy agent-wallet balance does not reconcile from remittance history;
- a received remittance has no bank transfer reference;
- a historical payout has incomplete destination identity;
- a historical payout says REVERSED without enough evidence to reconstruct both success and reversal;
- a legacy payout provider is not Monnify or Flutterwave.

Fix the underlying source/evidence first. Then requeue review items explicitly:

```cmd
pnpm --filter @surewina/api phase8:migrate retry --run=<RUN_ID> --include-review
```

For ordinary transient failures:

```cmd
pnpm --filter @surewina/api phase8:migrate retry --run=<RUN_ID>
```

## 7. Audit the cutover

```cmd
pnpm --filter @surewina/api phase8:migrate audit --run=<RUN_ID>
```

The blocking counters must be zero before finalization, including:

- legacy non-zero `Agent.walletBalanceNgn`;
- legacy successful collections without journals;
- refund accrual/settlement gaps;
- cash-prize accrual gaps;
- agent-prize payout gaps;
- remittance commission/bank/wallet journal gaps;
- bank payout summaries without attempt history;
- post-cutover Paystack payment/funding rows;
- post-cutover successful collections or credited wallet funding missing ledgers.

Open CRITICAL external reconciliation issues are reported but remain a Finance
reconciliation workflow rather than an automatic Phase 8 rewrite.

## 8. Finalize

```cmd
pnpm --filter @surewina/api phase8:migrate finalize --run=<RUN_ID>
```

Finalization is a marker only. It does not delete historical columns or old
provider evidence.

## Database hardening installed by Phase 8

- New Paystack `PaymentTransaction` and `WalletFunding` rows are rejected.
- Existing historical Paystack rows remain readable/updatable for migration/support.
- `Agent.walletBalanceNgn` cannot be incremented or set to a new non-zero value; Phase 8 may only migrate an existing balance to zero.
- Payment collection/refund ledger links are write-once.
- Wallet-funding financial identity becomes immutable after ledger posting.
- Remittance financial identity and ledger links become immutable after posting.
- Prize entitlement amounts become immutable after prize accrual.
- Agent-paid prize identity becomes immutable after its payout journal.

## Rollback philosophy

Phase 8 does not provide a destructive rollback. If an item posts a valid but
incorrect journal, use an explicit ledger reversal/corrective journal and keep
the audit history. Never edit/delete ledger entries and never reset the
database to undo a migration.
