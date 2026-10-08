# SureWina jackpot discount promotion: Phases 12–14

**Status:** acceptance plan and automated regression coverage prepared; **NOT production approved**.

The discount promotion grants a phone-bound **offer** when 10 regular DAILY_STANDARD tickets are confirmed in the same active Saturday jackpot cycle. The offer permits a **separate optional** NGN 500 jackpot ticket purchase. It is not a free ticket, and receipt of an offer is not payment or entry.

Keep `JackpotEntry` and earlier `JackpotEntrySource.ACCUMULATION` records, including their historical draw/result significance, **unchanged**.

## Phase 12 — mixed-price draw-engine invariants

Automated regression: `apps/api/test/jackpot-mixed-price-engine.spec.ts`.

The test invokes the **actual** `ExecutionService.execute` in a mocked, isolated database transaction, using its actual `deterministicWinnerIndex` implementation. It is not an alternate test-only draw algorithm.

Expected for a jackpot with **8 ACTIVE normal tickets (NGN 5,000 each)** and **2 ACTIVE promotional tickets (NGN 500 each)**:

- Ticket query selects `drawId` + `TicketStatus.ACTIVE`, ordered by `ticketRef`. No face value participates in its selection or RNG input.
- Ticket count = 10, eligible pool size = 10 if there are no additional historical `JackpotEntry` records.
- Each ticket contributes one pool index, regardless of payment method, discount, or face value.
- Seed, draw code and ordered ticket references determine the winner. Swapping which two tickets are discounted must not change the Merkle root, winner or pool size.
- Winner's matching `Ticket` is marked `WINNING`, result is recorded, draw completes, and a single winner notification is queued.
- **Historical** active `JackpotEntry` rows are still individually eligible. A pool with those 10 tickets and one historical entry has **11** positions, not 10.
- A deterministic winner-index test checks all 10 positions are reachable by varying the seed. This is a regression/sanity check, **not a mathematical or regulatory certification of RNG fairness**.

The engine should never create extra weight for a NGN 5,000 ticket and should never reduce weight for a NGN 500 ticket.

## Phase 13 — full promotion acceptance matrix

Test against a disposable local/test PostgreSQL database. Use dedicated phone/account and agent fixtures. **Never use real customer funds, send uncontrolled live SMS, or force production draws.**

| # | Scenario | Expected | Automation or manual evidence |
|---|---|---|---|
| 01 | One regular ticket | Weekly count 1, no offer | **Gap:** check exact 1-ticket purchase; existing 9-ticket unit covers sub-threshold behavior |
| 02 | Ten regular tickets at once | One AVAILABLE offer at threshold 1 | Unit: jackpot-accumulation; browser |
| 03 | Nine, then one | Exactly one offer | Unit: jackpot-accumulation |
| 04 | Five, then three, then two | Exactly one offer at 10 | **Gap:** run controlled sequence; add exact 5+3+2 unit assertion if not present |
| 05 | Twenty at once | Two offers, threshold 1 and 2 | Unit: jackpot-accumulation |
| 06 | Duplicate Paystack webhook | No duplicate ticket, weekly accumulation or offer | Unit: purchase-confirmation; real webhook sandbox replay required |
| 07 | Retry wallet with same idempotency key | One completed purchase and no duplicated offer | Wallet purchase regression; transactional integration test required |
| 08 | Agent sale crosses 10 | Offer belongs to buyer phone; offer SMS job and verified claim page | Agent entitlement and offer-notification unit tests; SMS sandbox delivery required |
| 09 | Click No thank you | Offer DECLINED with declinedAt; no ticket issued | Unit: jackpot-offers, guest-decline; browser |
| 10 | Try to reuse declined offer | Checkout rejected; never reverts to AVAILABLE | Offer lifecycle unit; browser/API negative test |
| 11 | Claim with Paystack | Transaction initializes for NGN 500; exactly one jackpot Ticket after verified payment | Promotional purchase unit; Paystack sandbox completion required |
| 12 | Claim with wallet | NGN 500 wallet debit; one jackpot Ticket; offer CLAIMED; ledger balances | Promotional wallet unit; local ledger integration required |
| 13 | Claim same offer twice / concurrent rails | Second redemption rejected; unique ticket-to-offer FK enforced | Offer status/CAS unit; real PostgreSQL two-request concurrency test required |
| 14 | Payment fails / is cancelled | No ticket issued; offer remains reclaimable after failed attempt cleanup or reservation expiry | Init-failure unit and PSP sandbox rejection required; check claim lifecycle |
| 15 | Saturday cutoff passes | No new purchase; offer EXPIRED (or displayed effectively expired before normalization) | Lifecycle unit + time-travel integration |
| 16 | New jackpot week | Active weekly count resets; historical offers remain | Accumulation and admin tests; cycle transition |
| 17 | Nine tickets last week + one this week | New count = 1; no current-week offer | Accumulation unit |
| 18 | Promotional jackpot ticket | Enters Saturday draw exactly once, equally weighted | Mixed-price execution regression |
| 19 | Normal jackpot ticket | NGN 5,000 remains the regular ticket price; active ticket gets one pool position | Promotional-price and ticket-value unit; sandbox checkout |
| 20 | Financial rollout check | PASS, Blockers 0, Review items 0, Ready YES | `rollout:check --strict-review` |

### Existing regression files

- `apps/api/test/jackpot-accumulation.service.spec.ts`: ticket threshold, current cycle, historical reset, source linkage.
- `apps/api/test/purchase-confirmation.service.spec.ts`: confirmed Paystack replay.
- `apps/api/test/jackpot-offers.service.spec.ts`: ownership, decline, expiry, reservation, double claim, duplicate ticket guard.
- `apps/api/test/jackpot-offer-guest-decline.spec.ts`: confirmed-guest decline authorization.
- `apps/api/test/promotional-jackpot-purchase.service.spec.ts`: NGN 500 provider initialization and wallet ticket issuance.
- `apps/api/test/agent-jackpot-offer-entitlement.spec.ts`: agent-origin accumulation and queued offer notification.
- `apps/api/test/jackpot-offer-notification.spec.ts`: SMS content, expiry, confirmed agent origin and stable message identity.
- `apps/api/test/jackpot-offers-progress.spec.ts`: server-backed weekly progress.
- `apps/api/test/customer-admin-offers.spec.ts`: support/finance offer visibility.
- `apps/api/test/ticket-value-accounting.spec.ts`: mixed face-value ledger/revenue reconciliation.
- `apps/api/test/jackpot-mixed-price-engine.spec.ts`: actual draw execution and equal ticket positions.

**Do not label the full matrix PASS from unit tests alone.** Record independent evidence for Paystack sandbox, database-concurrent redemption, worker SMS, browser UI, and engine-controlled draw execution. A failed, skipped or not-run row is not a pass.

### Test commands

Run from the repo root on Windows CMD after pulling `main`:

```cmd
pnpm install --frozen-lockfile
pnpm --filter @surewina/api exec jest test/jackpot-mixed-price-engine.spec.ts test/jackpot-accumulation.service.spec.ts test/purchase-confirmation.service.spec.ts test/jackpot-offers.service.spec.ts test/jackpot-offer-guest-decline.spec.ts test/promotional-jackpot-purchase.service.spec.ts test/agent-jackpot-offer-entitlement.spec.ts test/jackpot-offer-notification.spec.ts test/jackpot-offers-progress.spec.ts test/customer-admin-offers.spec.ts test/ticket-value-accounting.spec.ts --runInBand

pnpm type-check
pnpm build
pnpm --filter @surewina/api rollout:check --strict-review
```

Also review `docs/FINANCIAL_ROLLOUT_RUNBOOK.md` for the separate prepaid/PSP/provider evidence requirements.

Record results as `PASS`, `FAIL`, or `NOT RUN`, with redacted transaction IDs and screenshots where appropriate.

## Phase 14 — migration and controlled release

**Do not deploy automatically from a GitHub push. Do not run migrations on production until the DBA/operator has confirmed backup, permissions, approved window, and a validated rollback procedure.**

### Repository migration inventory

The promotion is implemented across existing migrations, in chronological order:

1. `20261002110000_jackpot_discount_offers` — entitlement table and status.
2. `20261006204500_jackpot_offer_claim_reservation` — CLAIMING reservation.
3. `20261007001500_promotional_jackpot_purchases` — provider/wallet promotional purchases.
4. `20261008070000_jackpot_offer_ticket_redemption_guard` — one ticket per offer.
5. `20261008140000_jackpot_offer_unlock_purchase_origin` — unlock-source references.
6. `20261008180000_agent_jackpot_offer_sms` — delivery marker.

Earlier `20260906183013_jackpot_weekly_cycle` adds active-cycle counters. **Do not rerun or edit existing migrations once they have been applied.** `prisma migrate deploy` applies only pending migrations.

Phase 14 requires **no new jackpot-entry deletion or rewrite migration**. Historical records must remain valid for original results and claims.

### Ordered gated release procedure

1. **Inventory and backup** the environment. Record running service paths and commit SHA, DB migration status, service-account privileges, encrypted environment backup and the pre-deployment database backup. Test that restore works in isolation. Keep backups away from public folders.
2. **Prove Phase 13 passes** in isolated local/staging DB and provider sandboxes; confirm the current commit has all API, UI, worker and engine changes.
3. **Confirm operational ordering.** This repository already creates discount offers in the shared accumulator; it does **not** have separate runtime switches for "stop free-entry minting" versus "enable offer issuance." Do **not** assume these can be toggled one-by-one. If the business requires those as independent rollout steps, implement audited feature flags first.
4. **Prepare one coordinated cutover** with purchase writes paused or otherwise protected from mixed-version API/worker operation. Snapshot database and environment. Explicitly capture the migration ledger state.
5. **Apply pending Prisma migrations** using the operator-approved production configuration, then regenerate clients and deploy a compatible API. Schema compatibility with any old processes must be checked before switching traffic.
6. **Confirm the new server path**: no new `JackpotEntrySource.ACCUMULATION` mint, 10 regular tickets issue one persistent offer, duplicate webhooks and wallet retries stay idempotent.
7. **Deploy customer UI**, including post-purchase popup and secure offer checkout. Verify OTP and claim ownership. The offers themselves never authorize payment.
8. **Deploy compatible worker**, switch away from the old `JOB_JACKPOT_ENTRY_SMS` consumer, verify queue contents and retry policy, and configure a valid HTTPS public claim base. Handle queued legacy jobs deliberately, not by silently discarding audit-required records.
9. **Run read-only financial and migration gates**. On the production-configured machine, `rollout:check --production --strict-review` must pass in addition to standard readiness checks.
10. **Run a controlled test buyer and agent** through 9+1, 10-at-once and agent-10 (with approved sandbox/live-test procedures). Verify exactly the expected offer records, SMS behavior and UI ownership. Do not perform unapproved live payments or test draws in customer-visible production.
11. **Test one NGN 500 Paystack redemption** in the approved environment. Confirm provider evidence, one Ticket, CLAIMED timestamp, one ledger collection and no second redemption.
12. **Test one NGN 500 wallet redemption**, with a distinct offer and verified wallet balance; check hold/capture and revenue accounting.
13. **Execute a controlled mixed-price jackpot** only in a disposable/staging draw with a legitimate seed commitment and cutoff; verify 8 normal + 2 promo => 10 eligible ticket slots, zero price weighting, and an auditable signed result. Do not force a live customer draw.
14. **Recheck and sign off:** Finance, Compliance, API/Worker operations, customer support and release owner. Release traffic only after all required gates pass; monitor post-cutover exceptions and provider settlement.

### Rollback policy

- Keep a recorded pre-cutover commit and a tested database restore plan.
- A **code-only rollback after new offer/redemption data has been written is unsafe** unless its DB compatibility is proven. Older versions may mint free entries or mishandle newer offer rows.
- If an invariant fails, stop new promotional activity, isolate the environment, preserve evidence, and prefer a forward fix or a carefully approved paired code+data recovery. Never delete confirmed tickets or immutable ledger entries to hide a failed test.
- Retain historical `JackpotEntry` and `JackpotAccumulation` rows; check no prior draws or claims change.

**Release gate:** all 20 scenario rows with required evidence reviewed, zero financial blockers, operator-approved deployment and rollback, signed-off provider/SMS sandbox checks, and no mismatch in mixed-price draw eligibility.

**Current acceptance state:** NOT RUN/NOT VERIFIED for environment-dependent rows until the operator provides results.
