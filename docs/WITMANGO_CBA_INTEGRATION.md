# Witmango CBA wallet integration for SureWina

**Status: Phase CBA-1 coded (disabled by default); no monetary integration or production activation.**

Sources: `Witmango_Wallet_API_Developer_Guide.pdf` and `Witmango Wallet API.postman_collection (1).json` supplied by the CBA. The sample response bodies are examples rather than evidence of executed API requests.

## 1. What the CBA actually supplies

The Postman collection uses Apache Fineract-style NGN **savings products, clients and savings accounts** as wallets. It supports:

- GL setup: GET/POST `/v1/glaccounts`, then wallet savings-product GL references.
- Wallet product: GET/POST `/v1/savingsproducts` with `accountingRule: 2` and six configured detail GL account IDs.
- Client onboarding: POST `/v1/clients` with `savingsProductId` creates client and active savings wallet at once.
- Existing-client wallet: POST `/v1/savingsaccounts`, POST approve by externalId, then POST activate by numeric account ID.
- Wallet history/balance: GET `/v1/savingsaccounts/{numericId}` with optional `associations=transactions`, and transaction search.
- Wallet movements: POST deposit/withdrawal command on savings-account transactions; wallet-to-wallet POST `/v1/accounttransfers`.

Authentication: HTTP Basic Auth and `Fineract-Platform-TenantId` header. The sample `https://localhost:8443/fineract-provider/api` is a **development example, not SureWina's live CBA URL**.

**Not documented:** bank-transfer collection webhooks, fiat pay-in methods, outbound bank payouts, payment verification signatures, idempotency guarantees, API permissions/scopes, error contracts, callback retries or real settlement evidence. Do not treat savings-account `deposit` as a verified **external fiat top-up**; it creates a book entry at Fineract and would be unsafe to expose as direct funding.

## 2. How SureWina currently works

- SureWina's `Wallet`, `WalletHold`, immutable `LedgerTransaction` and `LedgerEntry` are its current source for available/held balances, ticket purchases, agent net-debits and prize reimbursements.
- Monnify and Flutterwave currently initiate and verify wallet funding, and participate in separate cash-prize bank payouts.
- Paystack remains the direct ticket checkout provider.
- Financial rollout checks reconcile existing wallets/holds/provider receipts. Do **not** remove any of these checks as part of connection testing.

A CBA savings account is a **different money ledger**. We need one agreed direction: either (A) CBA is authoritative for actual customer/agent wallet balances and SureWina ledger records mirrored journal movements, or (B) SureWina wallet remains authoritative and the CBA is an externally reconciled settlement ledger. **Do not run live double-entry posting to two ledgers without an explicit reconciliation/repair contract.**

## 3. Phase CBA-1 (implemented in this repository)

- `WitmangoClientService`: **read-only** connector for GL discovery, savings-product discovery, savings account NGN snapshot and inline transactions.
- `WitmangoModule`: injectable Nest module in the admin operations graph.
- `GET /v1/admin/finance/witmango/probe`: guarded by existing admin JWT and FINANCE_OFFICER role; verifies two safe GET endpoints. The response includes connectivity booleans only, never account numbers or credentials.
- Config values: `WITMANGO_ENABLED` (default `false`), `WITMANGO_BASE_URL`, `WITMANGO_TENANT_ID`, `WITMANGO_USERNAME`, `WITMANGO_PASSWORD`, `WITMANGO_TIMEOUT_MS`.
- Basic Auth credentials remain **server side**. TLS is required for non-localhost and in production. Redirects are rejected and upstream error bodies are not forwarded.
- No schema migration, customer UI, wallet auto-provisioning, funding switch, prizes switch or money-moving HTTP endpoint.
- Unit tests use mocked HTTP only. No actual CBA requests happen until explicitly enabled.

### Safe local test

From the SureWina repository root:

```cmd
git pull origin main
pnpm --filter @surewina/api exec jest test/witmango-client.spec.ts --runInBand
pnpm --filter @surewina/api type-check
pnpm --filter @surewina/api build
pnpm --filter @surewina/api rollout:check --strict-review
```

With proper authorized **sandbox** credentials, set environment variables in your private local configuration (never commit them):

```dotenv
WITMANGO_ENABLED=true
WITMANGO_BASE_URL=https://<sandbox-host>/fineract-provider/api
WITMANGO_TENANT_ID=<authorized-tenant-id>
WITMANGO_USERNAME=<authorized-api-username>
WITMANGO_PASSWORD=<authorized-api-password>
WITMANGO_TIMEOUT_MS=10000
```

Restart the API and have an authorized Finance admin call `GET /v1/admin/finance/witmango/probe`. A successful probe demonstrates HTTP authentication and tenant reachability **only**. It does not establish that a wallet exists, that onboarding works, or that funds have settled. Set `WITMANGO_ENABLED=false` again until Phase CBA-2.

## 4. Next controlled implementation milestones

1. **Confirm architecture with the CBA**: system of record for available/held balances; custody and ownership; customer/agent wallet type; separation between stored funds and gambling ticket revenue.
2. **Confirm tenant configuration**: sandbox URL, approved credentials, office IDs, savingsProductId, six GL detail IDs, configured paymentTypeIds, legal/KYC onboarding fields and account naming.
3. **Persist external linkage**, with a unique `(ownerType, ownerId, provider)` mapping to `clientId`, `savingsAccountId`, `accountNo` and `externalId`. Do not reuse numeric IDs across tenants. Avoid putting phone numbers or client PII into unprotected external IDs.
4. **Create a safe, idempotent provisioning coordinator**: new client with wallet vs existing client three-step account lifecycle. Provisioning needs recovery after partial upstream success. No financial postings.
5. **Read-only reconciliation**: compare wallet balances and transaction history by stable external account identities, log mismatches for Finance. Keep internal ledger and holds unmodified.
6. **External transaction safety gate**: require verified CBA transaction ID and idempotency/reversal semantics, exact currency units, timeouts, concurrency and delivery contract before any deposit/withdrawal/transfer writes.
7. **Prove wallet purchase and agent-sale money flows end to end in sandbox**, including held vs available balances, out-of-order responses, duplicate retries, blocked/self-excluded accounts, refunds and disaster recovery.
8. **Design external bank-funding/payout path independently**. The supplied Fineract endpoints do not implement Monnify/Flutterwave funding/payout callbacks; switching those off based on this guide alone would strand customers and prizes.
9. **Perform approved cutover only after reconciliation is green**. Keep historic immutable ledger journals, and keep an audited rollback procedure that does not issue duplicated wallet credits/debits.

### Questions to confirm before CBA-2

- Does the CBA require the **customer/agent savings account** to be the authoritative available balance for ticket purchases, or is it a settlement/account mirror behind SureWina's current ledger?
- Is there a CBA sandbox already provisioned with GL accounts, savings product, office and payment types, or must the CBA operator set them up?
- Which independent external bank pay-in and bank-payout APIs, if any, does the CBA provide beyond these wallet endpoints?

Do not supply API passwords in chat. Configure them privately on the machine that calls the CBA.

## 5. Spending from CBA wallets (phases 6 and 7)

Status: **built and unit-tested against mocks; not run against a Witmango sandbox; not accepted.** Off by default.

### What it does

- **Customer wallet purchase.** Paid by transfer from the customer's CBA **Deposit** account, then **Winnings** if Deposit is not enough (winnings are the only withdrawable money, so they are spent last), into SureWina's sales account.
- **Agent sale.** The agent's CBA **Float** pays the **full** ticket value into the sales account. Commission is then paid from the sales account into the agent's **Earnings**, as a separate transfer. No SureWina ledger journal is written for either — the CBA writes its own accounting.

Wallets whose CBA pair is not `READY`, and every wallet while the switch is off, keep the existing ledger path unchanged.

### How it stays safe across two systems

Every movement is a row in `cba_transfers`, written **before** it is sent and claimed once (`PENDING → SENDING → POSTED | FAILED | UNCERTAIN`).

| Step | Customer purchase | Agent sale |
|---|---|---|
| 1. Accept | All rules checked, purchase + transfers written, in one DB transaction | Float balance checked, transfer written |
| 2. Pay | Each transfer sent once | Float transfer sent once |
| 3. Issue | Tickets created in a second transaction that re-checks the draw is still open | Payment + tickets created the same way, then commission sent |

- **Refused** → nothing issued; anything already taken is transferred back (a `REVERSAL`).
- **Draw closed mid-payment, or tickets could not be issued** → the money is transferred back.
- **Uncertain** (timeout, dropped connection, 5xx, unreadable answer) → **stop**: no tickets, nothing further sent, nothing returned on a guess. Purchase becomes `REVIEW_REQUIRED`; the agent is told not to hand over tickets.
- A return that does not post → `REVIEW_REQUIRED`.
- A commission that does not post never undoes the sale; it is owed, and the rollout check `cba.transfers` blocks until it is settled.
- One CBA payment in flight per customer wallet at a time.

### Configuration

| Setting | Meaning |
|---|---|
| `WITMANGO_WALLET_SPENDING_ENABLED` | Master switch. Default `false`. |
| `WITMANGO_MONETARY_ENABLED` | Must also be `true` for anything to move. |
| `WITMANGO_OFFICE_ID` | Office for every transfer endpoint. |
| `WITMANGO_SALES_CLIENT_ID`, `WITMANGO_SALES_ACCOUNT_ID` | SureWina's own CBA client and savings account (sales in, commission out). Opened by Witmango. |

### Not built yet

- No tool yet to resolve an `UNCERTAIN` or stale `SENDING` transfer, or to retry an owed commission. They are recorded and block the rollout check; resolution is the reconciliation / retry-sweep increment.
- **UNVERIFIED:** that a transfer can be found again by the reference sent in `transferDescription`. Until proven in sandbox, uncertain transfers are never retried.
- Any balance left in a customer's or agent's **ledger** wallet is not moved to the CBA by this; once a wallet spends from the CBA, a ledger balance is stranded until a migration step moves it.

## 6. Prizes (phase 8)

Status: **built and unit-tested against mocks; not run against a sandbox; not accepted.** Off by default.

- **Customer cash prize → Winnings, by the winner's choice** (`POST /claims/:claimId/wallet`). WHT is deducted exactly as on the bank route; the net prize is transferred from the sales account. No bank KYC: the wallet was BVN-verified at opening, and money can only leave Winnings to a BVN-matched account. The claim moves to `WALLET_CREDIT_PENDING` *before* money moves, which takes it out of every other route (re-choosing, agent cash, the forfeit sweep). Refused → back to `SELECTION_MADE`; uncertain → stays pending for review, never paid twice. Switch: `WITMANGO_PRIZE_CREDITS_ENABLED`.
- **Agent pays a prize in cash** (agents on the CBA path) → reimbursed from the sales account into **Earnings**. The prize stays paid whatever happens; a reimbursement that does not post is owed and blocks `cba.transfers`. Follows `WITMANGO_WALLET_SPENDING_ENABLED`, as agent sales do.
- Anonymous agent-sold tickets have no customer wallet and stay on bank or agent cash payout.

## 7. Saved withdrawal accounts (phase 9)

Status: **built and unit-tested; Monnify call unverified in sandbox; not accepted.** Off by default (`WITHDRAWAL_ACCOUNTS_ENABLED`; also needs `MONNIFY_IDENTITY_VERIFICATION_ENABLED`).

Customer: `GET|POST /wallet/withdrawal-accounts`, `DELETE /wallet/withdrawal-accounts/:id`. Agent: same under `/agent/withdrawal-accounts`.

1. The owner re-enters their BVN. It must match the stored fingerprint (customers) or onboarding hash (agents). If not, nothing is sent to Monnify and nothing is stored — a wrong BVN costs nothing.
2. Monnify `POST /api/v1/vas/bvn-account-match` must return `FULL_MATCH` for the same account number. Anything else is "not in your name"; the attempt is stored as `REJECTED` so it counts against the daily limit.
3. The account is stored encrypted (AES-256-GCM, bound to the wallet), fingerprinted with the platform's existing bank-account formula, and unusable until **cooling-off** ends.

| Setting | Default | Meaning |
|---|---|---|
| `WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS` | 24 | Wait before a new account can be withdrawn to. **Paul to confirm.** |
| `WITHDRAWAL_ACCOUNTS_MAX` | 3 | Saved accounts per wallet. |
| `WITHDRAWAL_ACCOUNT_ADDS_PER_DAY` | 3 | Attempts per wallet per day (each match is a paid call). |

## 8. Withdrawals (phase 10)

Status: **built and unit-tested against mocks; not run against Monnify or Witmango; not accepted.** Off by default (`WALLET_WITHDRAWALS_ENABLED`).

Customer: `GET|POST /wallet/cba-withdrawals` (separate from the legacy ledger `wallet/withdrawals`). Agent: `GET|POST /agent/withdrawals`. Finance: `GET /admin/finance/cba-withdrawals`, `POST …/:id/approve | reject | refresh`.

| Step | What happens | If refused | If uncertain |
|---|---|---|---|
| Lock | CBA transfer Winnings/Earnings → **Pending Withdrawals** | `FAILED`, nothing moved | `REVIEW_REQUIRED` |
| Approve | Only above `WITHDRAWAL_APPROVAL_THRESHOLD_NGN`; money already locked | Reject → restore | — |
| Pay | Monnify single transfer, reference `sw-wdr-<id>` fixed in advance | Restore to source | Stays `PAYOUT_PENDING`; queried by reference, **never re-sent** |
| Settle | CBA withdrawal out of Pending Withdrawals, receipt `sw-wds-<id>` | Retried later (nothing posted) | Looked up by receipt; never re-posted on a guess |
| Restore | Pending Withdrawals → source | — | `REVIEW_REQUIRED` |

- Only Winnings (customers) or Earnings (agents) can be withdrawn. Deposit and Float never.
- Destination must be a saved account past cooling-off, re-checked at the moment of paying.
- One withdrawal in flight per wallet. A repeated `requestId` returns the same withdrawal.
- A reversal reported after payment goes to review — never re-paid, never auto-restored.
- Monnify "no such transfer" within 30 minutes of submission is not treated as failure.
- The disbursement webhook routes `sw-wdr-` references here; the status is always re-queried from Monnify.
- Rollout check `cba.withdrawals` blocks on review, paid-but-unsettled, and stuck withdrawals.

| Setting | Default | Meaning |
|---|---|---|
| `WITMANGO_PENDING_WITHDRAWALS_CLIENT_ID` / `_ACCOUNT_ID` | — | SureWina's CBA account holding locked money. Opened by Witmango. |
| `WITHDRAWAL_MIN_NGN` | 100 | |
| `WITHDRAWAL_MAX_PER_REQUEST_CUSTOMER_NGN` / `_AGENT_NGN` | **0 = refused** | **Paul to set.** |
| `WITHDRAWAL_DAILY_MAX_CUSTOMER_NGN` / `_AGENT_NGN` | **0 = refused** | **Paul to set.** |
| `WITHDRAWAL_MAX_PERCENT_OF_BALANCE` | 100 | Share of the withdrawable balance per request. |
| `WITHDRAWAL_APPROVAL_THRESHOLD_NGN` | 0 = none | Above this, finance approves. **Paul to set.** |

Requires `MONNIFY_SOURCE_ACCOUNT_NUMBER`, and Monnify's **disbursement OTP switched off** for API transfers — otherwise every payout waits at `PENDING_AUTHORIZATION`. Monnify's transfer fee is charged to SureWina's Monnify wallet; the customer receives the full amount (fee bearer still for Paul to confirm).
