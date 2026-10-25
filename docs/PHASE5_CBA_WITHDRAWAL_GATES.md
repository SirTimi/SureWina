# Phase 5 — CBA customer-wallet cash-out: implementation and activation gate

**Status (25 October 2026): guarded reservation and read-only evidence verification are coded. External money movement is NOT activated and Phase 5 is NOT financially complete.**

## Existing code
- `WitmangoWithdrawalService.reserve` authenticates a customer, requires a linked active NGN CBA savings wallet, compares external snapshot balances with SureWina balances, validates a locked Paystack-verified beneficiary, and creates an idempotent local `WalletHold` plus a `WalletWithdrawal`.
- The database prevents a second unresolved withdrawal against the same wallet. The local hold stops concurrent SureWina spending; **it does not reserve funds at Witmango**.
- `cancelUnsubmitted` is limited to never-submitted local reservations and requires external monetary operations to be disabled.
- `WitmangoWithdrawalVerificationService.inspect` independently reads Witmango savings transactions and queries the Paystack transfer by immutable reference. It compares amounts, exact external CBA transaction ID, currency, full bank-account fingerprint, bank code and suffix, and requires positive non-reversal evidence. The endpoint is Finance-only: `GET /v1/admin/finance/witmango/withdrawals/:withdrawalId/verify`.
- Read-only verification never initiates, repeats, credits, debits, marks paid, posts ledger journals, releases a hold, or restores funds. `autoFinalizePermitted` is always false.
- Prize payouts remain separate from customer CBA wallet withdrawals, although approved beneficiary and Paystack verification infrastructure can be reused.

## Why financial activation is blocked by the supplied Witmango API contract
The source Postman example sends `POST /v1/savingsaccounts/{id}/transactions?command=withdrawal` with `transactionDate`, `transactionAmount`, `paymentTypeId`, `dateFormat`, and `locale`; it includes NO documented unique client request reference, upstream idempotency guarantee, or balance reservation command.

The sample POST withdrawal response `resourceId` is only returned after the request completes. If that HTTP response is lost, a client cannot safely resend the withdrawal command. Searching savings-account transactions by similar amount and date is NOT a reliable disambiguation when unrelated debits exist.

The Fineract savings debit is **not** proof of a Nigerian interbank payout. No documented Witmango operation moves a customer's CBA debit into a SureWina-controlled, withdrawable Paystack transfer balance. Paystack's merchant balance must be sufficient and properly backed by reconciled CBA-to-Paystack settlement.

## External contract required before enabling CBA debit
Witmango and SureWina Finance must approve and test, in an authorized sandbox:
1. An idempotent external debit reference or equivalent unique attempt metadata, with a provider-confirmed resolution endpoint for uncertain responses (including server crashes).
2. A genuine CBA hold/reservation mechanism, or an agreed withdrawal-only control that prevents external concurrent spending and establishes available/held balances.
3. Proof of a stable Fineract transaction ID, currency, account/tenant identity, reversal state, and transaction amount that remains accessible after a timeout.
4. A one-time compensation/deposit mechanism for conclusively reversed or failed downstream payouts, with reference uniqueness and automated duplicate protection.
5. A contractual settlement pathway moving CBA-held money to the Paystack payout balance, including reconciliation, roles, limits, fee funding, cut-off windows, and refunds if transfer initiation is rejected.
6. Separation of duties for finance authorization and finance reconciliation, plus dispute, fraud, AML and anti-double-spend controls appropriate to an operator handling customer funds.

## Required workflow after contracts are supplied
`RESERVED` -> persist external submit marker -> issue **one** CBA debit -> recover exact CBA ID -> verify not reversed -> record Paystack funds availability/settlement -> persist transfer submit marker -> initiate **one** stable-reference Paystack transfer -> verify outcome independently -> journal wallet withdrawal + clear held liability after success.

For uncertain CBA debit, no second debit is allowed: retain the hold and require reconciliation. For uncertain Paystack transfer, no second bank transfer is allowed: retain the hold and query by reference. For verified failure/reversal, an external CBA restoration must be idempotent and its transaction ID independently verified before releasing an internal wallet hold. Never credit SureWina's ledger to conceal a failed or unverified CBA compensation. Payout fees and trust/clearing reconciliation must be modeled separately from prize-payout ledger postings.

No `WalletWithdrawal` should be set to `SUCCEEDED` merely because Paystack returns success: the CBA debit, external settlement funding and SureWina journal must also be verified.

## Operational software acceptance (October 25, 2026)

- A partial PostgreSQL unique index prevents any wallet from having two concurrent unresolved withdrawals, regardless of which application path writes to the table.
- Finance has a tenant-scoped, paginated, read-only `/wallets/withdrawals` admin page that lists unresolved withdrawals and invokes the existing Finance-only verification endpoint without finalizing transfers, releasing holds, or initiating debits.
- GitHub Actions validates migrations against a fresh PostgreSQL 16 service and runs the API Jest regression suite in addition to type-checking and building.
- The existing approved-bank-account workflow is **prize-claim-linked**. A customer who has never made a prize claim has no standalone verified beneficiary onboarding path. This is **not** solved by accepting a bank-name match or bypassing claim-linked identity checks. Until a separate customer identity workflow is designed, reviewed and tested, cash-out must remain disabled.
- Do not turn on customer cash-out in the public UI or activate an automatic monetary path solely because these software checks pass. A non-claim-linked, verified and authorized beneficiary lifecycle is still necessary for broad customer cash-out eligibility.
- The database index is introduced by the `20261025123000_guard_unresolved_wallet_withdrawals` migration; deploy migrations before enabling reservation testing against the target database.

## Safe local validation
From the repository root:

```cmd
pnpm --filter @surewina/api prisma:generate
pnpm --filter @surewina/api type-check
pnpm --filter @surewina/api build
pnpm --filter @surewina/api exec jest --runInBand --runTestsByPath test/witmango-withdrawal-verification.service.spec.ts
pnpm --filter @surewina/api exec jest --runInBand
git diff --check
```

Do not turn on `WITMANGO_MONETARY_ENABLED` based on passing unit tests. Before any production activation, independently audit the recorded CBA transactions, Paystack merchant transfers, wallet hold lifecycle, bank-change locks, WHT/fees, out-of-order webhooks and reconciliation reports.

## Operational settings
```dotenv
WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED=false
WITMANGO_MONETARY_ENABLED=false
PAYSTACK_TRANSFERS_ENABLED=false
```

The deployment and runtime configuration must keep these settings in their intended state even if an environment variable has been accidentally added elsewhere. Live prize payouts are a separate controlled rollout.

## Phase 5 follow-up controls (October 25, 2026)
- WalletService.releaseHoldInTransaction() posts the release journal and updates the wallet hold inside a caller-owned PostgreSQL transaction.
- The customer cancellation flow uses one serializable transaction for the user and wallet locks, withdrawal-row lock, hold release, and CANCELLED transition. Submission markers or any non-RESERVED state prevent release.
- Finance has a tenant-scoped read-only queue at GET /v1/admin/finance/witmango/withdrawals/queue. It returns safe references, masked destination and a suggested review step. This is triage, not settlement authorization.
- Additional regression tests cover concurrent-state guards, replay and a simulated hold-release failure; they do not substitute for live CBA sandbox recovery tests.

**External blocker remains:** The provided Witmango PDF and Postman collection contain no documented idempotent savings withdrawal reference, external wallet hold, guaranteed debit lookup after a lost POST response, or authenticated CBA-to-Paystack settlement funding path. Withholding automatic debit, restoration and Paystack initiation is intentional. Software-only completion cannot be claimed until Witmango and Finance supply and test those guarantees.
