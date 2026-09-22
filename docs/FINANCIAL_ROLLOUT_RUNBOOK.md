# SureWina Financial Rollout Runbook

This runbook is the acceptance gate for the prepaid-wallet financial model.

It is deliberately split into:

1. **read-only invariant checks** — safe to run repeatedly;
2. **sandbox/local business-flow checks** — may create test financial records but must not use live money;
3. **production preflight** — read-only configuration/database gate;
4. **small-value live verification** — performed only after production credentials and treasury data are intentionally configured.

The rollout checker never initializes provider payments, sends payouts, synchronizes settlements, or changes financial records.

---

## 1. Build gate

From the repository root:

```powershell
git pull origin main

pnpm --filter @surewina/api prisma:generate
pnpm type-check
pnpm build
```

Do not continue if type-check or build fails.

---

## 2. Read-only financial invariant gate

Run:

```powershell
pnpm --filter @surewina/api rollout:check
```

Optional machine-readable output:

```powershell
pnpm --filter @surewina/api rollout:check -- --json
```

The command checks:

- required system ledger accounts;
- every ledger transaction balances and its stored totals match its entries;
- wallet owner/account wiring;
- no negative available or held wallet balances;
- material payment transactions have collection-ledger linkage;
- credited wallet funding has the expected wallet credit and PSP-clearing debit;
- completed wallet purchases have captured holds and matching ticket counts;
- no persisted pending wallet purchases / unresolved wallet-purchase holds;
- prepaid agent sale math: wallet debit + commission = gross sale;
- agent-paid prize reimbursement equals the net prize value;
- successful bank prize payouts settle Prize Payable into payout clearing;
- no agent remains suspended solely for `UNSETTLED_REMITTANCE`;
- open reconciliation issues;
- Financial Suspense balance;
- treasury registry / ledger mappings;
- Phase 8 migration state;
- historical remittance counts and outstanding value.

### Pass criteria

A pre-live run must report:

```text
Blockers: 0
Ready: YES
```

`REVIEW` items are not database corruption, but Finance must understand them before production. Typical review items:

- wallet funding in `REVIEW_REQUIRED`;
- old PENDING/PROCESSING funding;
- non-critical reconciliation issues;
- a Phase 8 migration that has not been finalized in the current database.

For a zero-exception gate:

```powershell
pnpm --filter @surewina/api rollout:check -- --strict-review
```

---

## 3. Controlled sandbox/local business-flow matrix

Use dedicated test customer and agent accounts. Do not use real customer funds.

Record, for every test:

- timestamp;
- user/agent identifier;
- provider/reference;
- wallet balance before;
- expected wallet delta;
- wallet balance after;
- ledger transaction id;
- ticket or claim id;
- PASS/FAIL.

### 3.0 Local prepaid-core setup

When Monnify/Flutterwave sandbox credentials are not yet configured, use the local-only smoke seeder to create controlled wallet balance for browser testing. This does **not** create a WalletFunding row and does **not** claim that a provider payment succeeded.

First list suitable existing accounts and open draws:

```cmd
pnpm --filter @surewina/api rollout:smoke candidates
```

If there is no ACTIVE draw, create a local-only scheduled smoke draw:

```cmd
pnpm --filter @surewina/api rollout:smoke create-draw --price=500
```

This creates a `TEST-ROLLOUT-*` draw in `SCHEDULED` state with a future cutoff/schedule. It does not force it ACTIVE.

Start the real Engine in a separate terminal:

```cmd
pnpm --filter @surewina/engine dev
```

The Engine must:
- commit the RNG seed using its normal sealed-seed path;
- transition the draw from `SCHEDULED` to `ACTIVE`.

Then rerun:

```cmd
pnpm --filter @surewina/api rollout:smoke candidates
```

and confirm the test draw appears in `activeDraws` with a committed seed visible in `rolloutDraws`.

After the functional tests, cancel the smoke draw before leaving the environment:

```cmd
pnpm --filter @surewina/api rollout:smoke cancel-draw --draw-code=<TEST_ROLLOUT_DRAW_CODE>
```

Then seed one customer wallet:

```cmd
pnpm --filter @surewina/api rollout:smoke fund-customer --phone=<CUSTOMER_PHONE> --amount=5000
```

And one active agent wallet:

```cmd
pnpm --filter @surewina/api rollout:smoke fund-agent --agent-code=<AGENT_CODE> --amount=10000
```

The seeder:

- refuses to run when `NODE_ENV=production`;
- requires the latest Phase 8 migration run to be `FINALIZED`;
- creates/uses `TEST:ROLLOUT:CASH` as a local test asset;
- posts an immutable `ADJUSTMENT` journal with reference type `RolloutSmokeSeed`;
- is idempotent per chosen customer/agent wallet;
- never creates provider evidence;
- never touches Monnify/Flutterwave treasury settlement records.

The normal pre-live rollout checker allows these local artifacts. The production checker blocks any `TEST:ROLLOUT:*` account, `RolloutSmokeSeed` journal, or `TEST-ROLLOUT-*` draw, preventing a smoke-test database from being treated as production-ready.

Use these seeded balances only for sections 3.4, 3.5, 3.7, 3.8 and 3.9. Provider funding itself must still be tested separately with real sandbox provider flows in sections 3.2, 3.3 and 3.6.

### 3.1 Customer direct Paystack ticket purchase

Expected:

```text
Customer checkout
→ Paystack redirect
→ provider verification
→ PaymentTransaction confirmed
→ collection ledger journal
→ tickets issued
```

Verify:

- Paystack remains the direct-payment option;
- confirmed payment amount equals purchased ticket face value;
- ticket count equals requested quantity;
- collection ledger link exists;
- tickets point to the intended draw, not provider metadata.

### 3.2 Customer wallet funding — Monnify

Expected:

```text
Initiate funding
→ hosted provider flow
→ server-side verification/webhook
→ WalletFunding CREDITED
→ DR Monnify collection clearing
→ CR customer available wallet
```

Verify the wallet is credited exactly once.

### 3.3 Customer wallet funding — Flutterwave

Run the same assertions as Monnify.

For Flutterwave, verify the provider transaction id is retained and a repeated status refresh does not duplicate the credit.

### 3.4 Customer wallet ticket purchase

Record available balance before purchase.

Expected:

```text
Available wallet
→ hold
→ tickets created
→ hold captured
→ Ticket Sales Revenue
```

Verify:

- no hosted-payment redirect;
- wallet reduces by exact purchase amount;
- purchase is `COMPLETED`;
- hold is `CAPTURED`;
- ticket count matches;
- retrying the same idempotency key does not issue duplicate tickets.

### 3.5 Customer wallet insufficient balance

Attempt a purchase larger than the available wallet balance.

Expected:

- sale rejected;
- wallet unchanged;
- no ticket issued;
- no successful wallet purchase persisted.

### 3.6 Agent wallet funding

Run at least one sandbox top-up for the agent.

If both Monnify and Flutterwave are configured in the environment, test both rails before production.

Verify the amount appears in the agent available wallet and in Finance `/wallets`.

### 3.7 Prepaid agent ticket sale

Example:

```text
Gross customer cash:       NGN 5,000
Agent commission (10%):      NGN 500
Expected wallet debit:      NGN 4,500
```

Verify:

- the customer gives the gross cash amount to the agent;
- SureWina wallet debit is gross minus configured commission;
- commission journal is recognized immediately;
- gross ticket revenue equals wallet debit + commission;
- tickets are issued only after the wallet-backed transaction succeeds;
- no new remittance debt is created.

### 3.8 Agent insufficient wallet balance

Attempt an agent sale where:

```text
agent available wallet < SureWina net share
```

Expected:

- API rejects sale;
- no tickets;
- no confirmed PaymentTransaction;
- no partial ledger journal;
- no remittance debt.

### 3.9 Agent offline sale protection

On the final confirmation screen, disconnect the network.

Expected:

- sale cannot complete;
- no temporary ticket/reference is issued;
- no sale is queued for later replay;
- reconnecting performs a new live wallet check.

If the browser had an old `surewina_agent_offline_sales` localStorage key, opening the authenticated agent shell should discard it without submitting it.

### 3.10 Eligible agent-paid cash prize

Use a validated test winning claim within `AGENT_PAYOUT_MAX_NGN`.

Record agent wallet before payment.

Expected:

```text
Agent pays winner net cash prize
→ Prize Payable debited
→ agent available wallet credited
```

Verify:

- claim becomes `CASH_PAID`;
- `agentPayoutLedgerTxnId` exists;
- wallet credit equals `netPrizeValueNgn`;
- the same claim cannot be paid twice;
- no new remittance adjustment is created.

### 3.11 Provider/bank prize payout

For a sandbox-capable bank payout test:

Expected successful accounting:

```text
DR Prize Payable
CR provider payout clearing
```

Verify a successful `PrizePayoutAttempt` has `payoutLedgerTxnId` and the journal amount equals the attempt amount.

Do not run a live payout during this phase.

### 3.12 Historical remittance

Historical remittance is a compatibility/audit flow only.

Verify:

- old records remain visible;
- old PENDING/LATE balances can still be settled;
- a historical balance does not disable prepaid selling;
- settlement does not mutate current prepaid sale history;
- no new prepaid sale creates a remittance row.

### 3.13 Worker restart

Restart the Worker after the above test records exist.

Verify:

- prepaid sales are not swept into remittance;
- wallet-reimbursed prize payments are not swept into remittance;
- only genuinely legacy receivable-backed records are eligible for catch-up;
- no agent is suspended because of historical remittance debt.

### 3.14 Admin + Finance

In admin:

- open `/wallets`;
- inspect the test customer wallet;
- inspect the test agent wallet;
- confirm funding and ledger activity;
- confirm agent prepaid totals;
- confirm prize reimbursement;
- confirm historical remittance is displayed separately;
- freeze/unfreeze a disposable test wallet and confirm audit behavior;
- confirm an AUDITOR cannot mutate wallet state.

### 3.15 Reconciliation + treasury

Open the treasury/reconciliation admin area.

Do not synchronize a live provider unless this is an intentionally configured sandbox.

Verify:

- treasury accounts map to the expected ledger accounts;
- no CRITICAL reconciliation issue remains open;
- any non-critical issue has an explicit Finance disposition;
- clearing balances are understood and traceable to provider settlement state.

Then rerun:

```powershell
pnpm --filter @surewina/api rollout:check -- --strict-review
```

The controlled sandbox/local rollout is accepted only when it reports `Ready: YES`.

---

## 4. Production preflight — read only

After production provider and treasury values have been intentionally configured, run:

```powershell
pnpm --filter @surewina/api rollout:check -- --production --strict-review
```

Production mode additionally requires:

- `NODE_ENV=production`;
- Paystack secret;
- Monnify API/secret/contract/source-account values;
- Flutterwave secret and webhook hash;
- non-local HTTPS customer/agent callback URLs;
- production Monnify base URL (not sandbox);
- unsigned Monnify sandbox webhooks disabled;
- primary treasury bank reference/code/account-last4;
- `FINANCIAL_LEDGER_CUTOVER_AT`;
- finalized Phase 8 migration;
- required treasury identity fields.

`REFUNDS_MODE` is deliberately a review decision rather than silently forced live. Keep it controlled until refund live-testing is explicitly approved.

Do not proceed to live-money testing unless:

```text
Blockers: 0
Review items: 0
Ready: YES
```

---

## 5. Small-value live verification

This phase is intentionally separate from code rollout.

Use the smallest provider-accepted amounts and dedicated controlled accounts.

Run, one at a time:

1. Paystack direct ticket purchase.
2. Monnify customer wallet funding.
3. Flutterwave customer wallet funding.
4. Monnify or Flutterwave agent wallet funding.
5. Customer wallet purchase using the credited balance.
6. Agent prepaid sale using a controlled agent wallet.
7. Provider settlement/reconciliation observation.
8. Prize payout only after payout-specific approval.

After each money movement:

- verify provider state;
- verify internal state;
- verify immutable ledger journal;
- verify treasury/reconciliation state;
- stop immediately on any unexplained variance.

Rerun the production rollout checker after the sequence.

---

## 6. Rollback / stop conditions

Stop rollout immediately if any of the following occurs:

- ledger transaction does not balance;
- a wallet becomes negative;
- wallet funding credits twice;
- ticket issuance occurs without completed payment/wallet settlement;
- prepaid agent sale creates remittance debt;
- agent prize reimbursement credits the wrong amount/agent;
- successful prize payout has no payout ledger journal;
- CRITICAL reconciliation issue appears;
- provider amount/reference/currency disagrees with SureWina;
- treasury balance variance cannot be explained.

Do not “repair” these states manually in SQL. Preserve evidence and fix through audited application/migration paths.
