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
