# Phase 6 — Paystack / Witmango financial security and acceptance

**Status (25 October 2026): Phase 6 has started. A clean pre-live rollout and mocked tests are not evidence of completed real-money settlement. Customer CBA wallet withdrawals remain intentionally disabled.**

## Non-negotiable release rules

1. A Nigerian bank account must be resolved by Paystack and independently verified as owned by the named customer. Account resolution alone is never ownership proof.
2. Every prize payout uses the locked, verified beneficiary snapshot. A customer-supplied destination is not trusted at initiation or retry.
3. Paystack webhook signatures must be valid. Signed webhooks are only triggers; the backend retrieves the transfer directly by immutable reference.
4. UNKNOWN and PROCESSING outcomes cannot be retried as new transfers. A failed status lookup does not prove transfer failure.
5. No local hold is released on a potentially submitted CBA debit. No SureWina liability is extinguished until independent custody, settlement, external debit, bank payout and journal evidence are all complete.
6. CBA withdrawal/deposit/compensation submission requires provider-supported reference/idempotency, loss-of-response recovery, external hold control and a reconciled path from CBA funds to Paystack transfer balance. These guarantees are **not established by the currently supplied Witmango guide**.
7. Production rollout checks must reflect the rails that are *actually live*. Do not remove Monnify and Flutterwave checks while the existing code still uses them for wallet funding and other payout flows. A Paystack/CBA-only production profile requires a verified migration and deactivation of the legacy money routes, not just new environment flags.

## Phase 6 automated matrix

| Scenario | Acceptance evidence | Current state |
| --- | --- | --- |
| Correct bank and identity | Signed, correlated Paystack identification verification and approved locked beneficiary | Unit coverage exists; sandbox pending |
| Incorrect BVN | Fail-closed / provider fails | Unit coverage exists; sandbox pending |
| Different customer bank ownership | Identity owner and fingerprint mismatch rejected | Unit coverage exists; sandbox pending |
| Bank resolved, ownership failed | Beneficiary remains unapproved/revoked | Unit coverage exists; sandbox pending |
| Tampered payout destination | Locked beneficiary/snapshot comparison rejected | Unit coverage exists; full payout E2E pending |
| Replace approved bank | Step-up authorization and fresh verification; unresolved payout locks replacement | Logic exists; E2E pending |
| Duplicate CBA reservation | Same reference replays; different reference cannot open second unresolved withdrawal | Unit tests and DB partial unique index; concurrent DB test pending |
| Duplicate signed Paystack transfer webhook | Independent verification; one payout and journal only | Phase 6 dispatch tests; transaction-level finalizer integration pending |
| CBA debit succeeded; Paystack failed | Unresolved hold maintained until provider-proof-backed one-time restoration | Blocked on Witmango contract |
| Pending Paystack transfer | No new transfer, no payout finalization | Provider tests and Phase 6 synchronization tests; sandbox pending |
| Reversed Paystack transfer | Reversal journal and safe CBA restoration | Prize-payout code exists; CBA compensation blocked |
| Worker/API crash after external request | Restore the exact attempt by immutable reference, never blind resubmit | Prize recovery code exists; CBA sandbox simulation pending |
| Two withdrawals simultaneously | DB constraint + wallet-level locks, no overspend | DB partial unique index and read-only rollout checks; concurrent database test pending |
| Signed webhook security | Exact raw request HMAC, reject missing/invalid signature | Phase 6 security test coverage; deployed ingress test pending |
| CBA-to-Paystack funding | Matched custodial movement and actual available transfer balance | Not provided by the available CBA contract |

The rollout checker now reports a separate read-only CBA withdrawal hold invariant, including unresolved holds, duplicate wallet requests, submission markers and transaction-ID mismatches. Strict review stays blocked if unresolved CBA withdrawals require Finance investigation. Passing tests does not mark unchecked rows PASS. Track sandbox evidence for each scenario (date, sanitized references, expected/actual balance, ledger, provider statuses, reconciliation, Finance reviewer).

## Commands

From the repository root:

```powershell
pnpm --filter @surewina/api prisma:generate
pnpm type-check
pnpm build
pnpm --filter @surewina/api exec jest --runInBand
pnpm --filter @surewina/api rollout:check -- --strict-review
```

The final production rollout checker still validates the currently active funding providers and remains intentionally unsuitable as proof of a Paystack/CBA-only cutover.

## External acceptance required for completion

- Witmango and Finance provide enforceable debit idempotency, external hold/restriction behavior, crash recovery, reversal/compensation and CBA-to-Paystack settlement details.
- Authorized sandbox flow covers real identity checks, account lock, prize payout success/pending/failure/reversal, ledger reconciliation and concurrency.
- Customer-wallet KYC works for customers without a prize claim; the current approved beneficiary lifecycle is claim-linked.
- The payout and funding rails chosen for production are configured and independently reconciled.
- Security review, monitoring, dispute handling and Finance sign-off are documented before real money is activated.

**Never set WITMANGO_MONETARY_ENABLED=true or PAYSTACK_TRANSFERS_ENABLED=true merely because CI is green.**
