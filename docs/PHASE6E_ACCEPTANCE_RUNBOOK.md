# SureWina Phase 6E — financial acceptance and controlled-live sign-off

**Current status: PENDING EXTERNAL EVIDENCE.** The committed register and CI tests
are not proof of a live-bank settlement, and do not permit enabling a money rail.

## Separate financial decisions

**Paystack prize payouts** use the locked beneficiary from approved customer
identity verification, Paystack's authorized transfer balance, signed callbacks,
independent status lookup, and the Prize Payable ledger. This is not a CBA debit.

**Witmango CBA customer cashouts** debit a customer savings account at Fineract
and require independently funded settlement from CBA custody to Paystack's
merchant transfer balance. Neither the supplied API examples nor the local
reserve-hold implementation establishes that funding link.

Approve these rails separately. No Paystack acceptance authorizes CBA withdrawals.
Keep `WITMANGO_MONETARY_ENABLED=false`,
`WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED=false`, and
`PAYSTACK_TRANSFERS_ENABLED=false` until the **specific rail's** contractual
and organizational approvals have been granted.

## Evidence capture

The canonical list of **23 mandatory scenarios** is maintained in
`apps/api/src/rollout/phase6e-acceptance.ts`. The public, default-PENDING register:
`docs/phase6e-acceptance.template.json`. Use the offline command:

```powershell
cd C:\dev\surewina
git pull origin main
pnpm --filter @surewina/api acceptance:check
pnpm --filter @surewina/api acceptance:check -- --json
```

Expected until the external acceptance exercise: 0 documented passes,
12 Paystack prize scenarios pending, 11 CBA cashout scenarios pending;
`releaseAuthorized: false`, exit code 1. This **is the correct result**.

For authorized evidence collection, copy the template to a restricted local
`docs/phase6e-acceptance.local.json` file, which is gitignored, or store it
outside the repository. Never commit real provider response bodies, names,
account numbers, BVNs, passwords, tokens, or bank statements. Save original
provider and ledger artifacts in an access-controlled immutable evidence store.

Each scenario starts with `outcome: PENDING`. For a genuinely observed PASS,
the entry must include:

```json
{
  "id": "PP-01",
  "environment": "SANDBOX",
  "outcome": "PASS",
  "evidenceSha256": "64-lowercase-hex-chars-from-your-private-evidence-artifact",
  "observedAt": "2026-10-25T11:00:00.000Z",
  "performedBy": "tester-id",
  "reviewedAt": "2026-10-25T12:00:00.000Z",
  "reviewedBy": "independent-finance-reviewer-id"
}
```

The above uses an explanatory placeholder: replace it with an actual 64-character
SHA-256 of an **independently stored** artifact. The reviewing person must differ
from the performing person. The validator does **not** hash/read the evidence
files and cannot independently authenticate the claimed identities. A PASS
without valid metadata remains INVALID. The validator checks only structure
and documented review assertions.

```powershell
pnpm --filter @surewina/api acceptance:check -- --file="C:\secure\phase6e-evidence.json"
```

`--json` generates a machine-readable coverage report; its
`releaseAuthorized` value is **always false** even if all claimed PASS rows
are complete. Exit 0 only means evidence metadata is complete, not approved.

## Provider and custody sign-off (CBA: NOT YET SUPPORTED)

Get contractual documentation and an authorized sandbox with the CBA provider
covering an immutable upstream debit reference, unambiguous lookup after a lost
response, provider-side available/held balance restrictions, compensating
deposits with unique references, fee policies, and a **reconciled transfer of
cash actually funding Paystack**. Test concurrent customer spending and
unresolved/duplicate debits. Account resolution and matching amount/date
alone cannot prove that a particular CBA withdrawal happened.

Do not build an automatic external debit, restore, hold release or Paystack
transfer dispatcher until this evidence is accepted by Treasury and Finance.

## Paystack prize-payout sandbox exercise

With authorized test beneficiaries and sandbox merchant access, record
provider reference, expected/actual amount, bank fingerprint (never full
NUBAN), journal IDs, settled or reversed result, before/after balances,
fees, withheld tax and callback provenance. Exercise wrong BVN/ownership,
locked beneficiary replacement, pending/UNKNOWN, confirmed success, failure,
reversal, duplicate signed webhook, retry refusal, timeout and crash recovery.

A Paystack initiation response or signed webhook is not settlement evidence;
Finance must independently retrieve the actual transfer status, then reconcile
ledger movement and custody position. Do not execute live money during sandbox
sign-off.

## Operational authorization — before any real-money pilot

1. Security/Compliance approves identity and money-handling controls.
2. Witmango and Paystack provide applicable written provider terms,
   authenticated debit/recovery/custody proof, and transfer eligibility.
3. Treasury documents available merchant cash, fees, safeguarding and bank
   statement reconciliation. A configured API key is never sufficient.
4. Finance performs independent inspection of the immutable evidence bundle,
   including reconciled provider IDs and release of any unresolved holds.
5. Operations documents alerts, fraud limits, incident response and a tested
   emergency feature shutdown/reconciliation procedure.
6. Authorized officers approve the **scope-specific** small-value pilot,
   recipient, limit, transaction count, window and stop criteria in a separate
   audited change record. No self-service toggle provides this approval.
7. After explicitly authorized real transfers, reconcile provider statement,
   Paystack balance, internal liability journals, fees and tax with a second
   independent reviewer; stop further money movement on any mismatch.
8. Only after post-pilot reconciliation may Finance and management issue a
   separate controlled-live release decision. Customer CBA cashouts still
   require their own provider contract and proof.

## Verifying the current system safely

```powershell
pnpm --filter @surewina/api exec jest --runInBand
pnpm --filter @surewina/api rollout:check -- --strict-review
pnpm --filter @surewina/api acceptance:check
```

A green code test or local prelive status never overrides the external
acceptance requirement. Do not run `rollout:smoke` on a real financial
customer database. Production financial configuration is separately audited
with `rollout:check -- --production --strict-review` on the intended
deployment environment; it remains blocked for unapproved Paystack transfers
and CBA customer cashouts.

**No provider transactions, financial journal updates, database migrations,
or secrets are created or changed by the new Phase 6E acceptance command.**
