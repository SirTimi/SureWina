# AI Build State

Updated: 2026-10-02

## Current Goal

Validate jackpot discount Phase 8: make server-backed active-cycle weekly progress authoritative for customer pre-purchase UI and dashboard, with accurate threshold and available-offer numbers and no client-side quantity-driven eligibility claims.

## Current Status

AWAITING USER TEST

## Last Accepted Task

Phase 8: add authenticated GET /jackpot-offers/progress, read JackpotAccumulation for the CURRENT active Saturday jackpot cycle and count AVAILABLE discount offers; expose typed progress via the API client; replace lifetime/quantity-derived dashboard and checkout copy; remove obsolete claims of automatic free jackpot entries.

## Current Implementation

Latest jackpot-promotion increment:
- GET /jackpot-offers/progress is protected by CustomerJwtGuard; the request identifies the customer through a verified JWT phone, not a caller-supplied arbitrary phone.
- The API uses a read-only REPEATABLE READ transaction to choose the earliest ACTIVE Saturday jackpot with a future cutoff, then reads that specific draw's accumulation and available unexpired offers.
- The response contains promotionActive, jackpotDrawCode, jackpotScheduledAt, weeklyTicketCount, completedThresholds, ticketsToNextOffer and availableOfferCount.
- A stale JackpotAccumulation row for an earlier jackpot cycle displays zero this cycle; no active jackpot means promotionActive=false and zero counts.
- completedThresholds counts multiples of 10 reached in the current weekly tally; availableOfferCount separately counts only unexpired AVAILABLE offers, not already CLAIMED, DECLINED or CLAIMING ones.
- The customer API client exposes jackpotOffers.progress(), with no-store private HTTP caching headers.
- Customer dashboard removes its invalid lifetime / 100-ticket-page-based free-entry calculations and gets the same authoritative progress from the API.
- Customer regular-ticket checkout displays server progress independent of the selected purchase quantity. The progress panel refreshes on focus/tab visibility and on a different authenticated account, and shows no stale guessed values while loading/errors occur.
- Signed-in buyers see their own account's count only when the purchase phone matches; a guest is invited to use OTP sign-in for a verified read rather than an unauthenticated phone-based purchase-history lookup.
- Customer landing/draws/FAQ/explainer/lookup and agent sales/receipt text were updated to describe a separate OPTIONAL NGN 500 jackpot ticket purchase, never a free or automatically issued jackpot entry.
- Agent sale completion no longer uses sale.quantity % 10 to assert customer eligibility.
- Removed unused exported frontend helper functions that calculated free jackpot entries from an arbitrary selected quantity.
- No Phase 8 schema migration, ledger change or change to eligibility/redemption logic is needed.
- New backend unit tests cover pre-threshold progress, milestone boundaries, active-cycle reset, offer state counting, and absence of an open jackpot.
- Browser/provider acceptance and production rollout remain separate explicit approval gates.

- Direct web ticket purchases use Paystack.
- Customer wallet funding uses Monnify or Flutterwave.
- Bank prize payouts use Monnify or Flutterwave.
- Ledger-backed wallets support CUSTOMER and AGENT owners.
- Customer wallet UI is available at `/dashboard/wallet`.
- Agent wallet UI is available at `/wallet`.
- Signed-in customers can buy tickets from their wallet or continue with Paystack.
- New agent ticket sales are prepaid:
  - customer pays the gross cash amount;
  - agent retains configured commission;
  - SureWina's net share is debited immediately from the agent wallet;
  - prepaid sales do not create remittance debt.
- Eligible agent-paid prizes are reimbursed immediately to the agent wallet.
- Historical remittance remains stored, settleable, auditable, and separated from current prepaid operations.
- Finance can browse customer/agent wallets, balances, funding, ledger activity, prepaid agent activity, prize reimbursements, and funding exceptions from `/wallets`.
- Legacy browser-side financial compatibility code has been removed:
  - no speculative offline sale queue/replay;
  - no browser shadow prize-payment ledger;
  - no remittance-era finance simulator in the agent mock store;
  - dashboard API contract explicitly separates selling, wallet, and legacy remittance.
- This increment adds a repeatable controlled-rollout gate:
  - `pnpm --filter @surewina/api rollout:check` performs read-only database/ledger validation;
  - `--json` provides machine-readable output;
  - `--strict-review` makes any Finance review item fail the gate;
  - `--production` adds production provider/callback/treasury/cutover validation;
  - the checker never initializes payments, payouts, settlements, or provider synchronization;
  - `docs/FINANCIAL_ROLLOUT_RUNBOOK.md` defines the manual sandbox/local and future live verification matrix.

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
- prepaid agent ticket sales with immediate commission recognition;
- immediate wallet reimbursement for eligible agent-paid prizes;
- retirement of `UNSETTLED_REMITTANCE` selling suspension;
- agent UX separation of current prepaid operations and historical remittance;
- admin/finance wallet operations and prepaid-agent visibility;
- technical cleanup of offline sale replay and browser shadow finance state.

Current engineering increment:
- add local-only rollout smoke tooling for the prepaid core;
- list existing candidate customers, ACTIVE agents, ACTIVE draws, and local rollout draws;
- create a local-only SCHEDULED `TEST-ROLLOUT-*` draw when no active draw exists;
- require the real Engine to commit the RNG seed and activate that test draw;
- provide a safe cancel command for the rollout test draw;
- provision and seed a selected customer wallet from a dedicated local test asset;
- provision and seed a selected agent wallet from the same dedicated local test asset;
- keep smoke seeding separate from WalletFunding/provider evidence;
- make smoke seeding idempotent per selected owner;
- refuse smoke seeding in production;
- require Phase 8 FINALIZED before smoke seeding;
- add a production rollout blocker for any `TEST:ROLLOUT:*` account, `RolloutSmokeSeed` journal, or `TEST-ROLLOUT-*` draw;
- document which browser tests may use local seeded balance and which still require real provider sandbox flows.

## Next Tasks

1. Pull latest main and run pnpm install --frozen-lockfile; there is no Phase 8 Prisma migration.
2. Run the new jackpot-offers-progress Jest suite, then all existing promotion/financial tests.
3. Run @surewina/types, @surewina/api-client, API, web-customer and web-agent type-check/build checks; validate full monorepo.
4. Run rollout:check --strict-review; promotion integrity and other financial checks must remain green.
5. In a local authenticated browser, verify 7/10, 8/10, 10/10 and 28/30 display exactly what GET /jackpot-offers/progress returns.
6. Verify dashboard and pre-purchase widget agree, guest view offers sign-in rather than leaking phone purchase data, different buyer-phone hides account progress, and new jackpot cycle resets progress.
7. Complete provider sandbox and production rollout approval separately before deploying.

## Known Issues

- Historical remittance settlement controls remain intentionally available until every legacy obligation is settled or otherwise resolved.
- The worker still contains legacy remittance catch-up/deadline services because historical receivable-backed records must remain auditable.
- Exact `UNSETTLED_REMITTANCE` cleanup remains intentionally present until old debt-only suspensions are gone.
- Production Monnify/Flutterwave credentials and treasury values still require controlled configuration before live provider testing.
- Customer, Super Agent, and Training agent-portal screens still use temporary local mock data; financial operations do not depend on that mock store.
- The rollout checker is intentionally database/ledger read-only. Browser/provider behavior remains a manual controlled-flow test documented in the runbook.

## Testing Status

Previous increment:
- legacy offline sale queue/replay removed;
- queued/temporary sale-success UI removed;
- dead browser prize-payment finance ledger/wiring removed;
- agent finance mock state removed;
- dashboard contract simplified to current selling/wallet plus historical remittance;
- local build initially failed because `agent-mock.ts` used the reserved local variable name `module`;
- fix commit `5fe7acab3079fc1cfbd0562f71ff99f1838f33a6` renamed it to `trainingModule`;
- user reported the resulting build green.

Current increment engineering review:
- inspected latest `main`, recent commits, package scripts, Phase 8 migration tooling, ledger service semantics, wallet/purchase/funding schemas, agent-sale accounting, agent-prize accounting, bank-prize payout finalization, reconciliation models, treasury bootstrap, and production environment validation;
- confirmed there was no existing end-to-end financial test harness;
- designed the checker to distinguish objective BLOCKER states from REVIEW items;
- confirmed ledger `totalAmountNgn` represents total debit, so the checker verifies entry count, debit=credit, and debit=stored total;
- confirmed completed wallet purchases are atomic and therefore must not leave persisted PENDING purchases or HELD purchase holds;
- confirmed prepaid agent sales are distinguishable from legacy sales by AGENT_AVAILABLE vs AGENT_RECEIVABLE ledger participation;
- confirmed current agent prize reimbursement uses AGENT_AVAILABLE while legacy payouts remain AGENT_RECEIVABLE-backed;
- confirmed successful bank payouts debit Prize Payable and credit provider Payout Clearing;
- production mode checks configuration only and makes no external provider requests;
- production mode additionally requires NODE_ENV=production and HTTPS public callback URLs;
- no Prisma schema or database migration is required;
- no new environment variable is required.

Runtime/type/build validation:
- the connected GitHub environment does not expose a checked-out Node workspace, so local `pnpm type-check`, `pnpm build`, and the database rollout check cannot be executed before push;
- rollout checker bootstrap issues were fixed in commits `8fad349` and `7a45616`;
- the first successful checker run showed the local DB itself is pre-Phase-8: 0 ledger transactions, 0 wallets, all 15 system ledger accounts missing, all 5 treasury registry rows missing, 10 material payments without collection ledgers, 4 agent sales without prepaid/legacy ledger classification, and no migration run;
- this is an environment-state blocker rather than a checker false positive;
- Phase 8 migration bootstrap is hardened for this path: the migration-only module no longer requires unrelated provider callback configuration, the CLI uses `ts-node` so Nest decorator metadata is preserved, TreasuryBootstrapService runs alongside the existing ledger bootstrap, and RequestContextModule is imported so AuditService can be resolved in the standalone migration context;
- first local migration-plan attempt after `343921d` reached Nest startup but failed because AuditService could not resolve RequestContextService; commit `32b1a42` fixed that wiring;
- the next plan attempt exposed another standalone-module leak: importing full `LedgerModule` instantiated its admin controller guard, which required AdminTokenRevocationService from the HTTP/admin-auth graph;
- fix: Phase8MigrationModule no longer imports full LedgerModule/WalletModule. It directly provides only LedgerService, LedgerBootstrapService, PaymentAccountingService, WalletService, and TreasuryBootstrapService, so the offline CLI does not load HTTP controllers or auth guards;
- LedgerBootstrapService still runs on module init, and TreasuryBootstrapService runs on application bootstrap, preserving account/bootstrap order;
- normal API startup environment validation and financial runtime behavior remain unchanged;
- local validation must include build/type-check plus `pnpm --filter @surewina/api rollout:check`;
- the manual browser/provider matrix remains a separate acceptance step after the checker itself builds and runs.

## Architecture Decisions

- GitHub `main` is the implementation source of truth.
- Direct web ticket purchases: Paystack.
- Wallet funding: Monnify or Flutterwave only.
- Bank prize payouts: Monnify or Flutterwave only.
- Wallet balances are derived from immutable ledger entries.
- Agent sales require a live server transaction and live wallet authorization.
- New agent sales are prepaid and never feed new remittance debt.
- Eligible agent-paid prizes reimburse the agent wallet immediately.
- Historical remittance remains an auditable legacy obligation only.
- A financial rollout gate must be repeatable and read-only by default.
- Database corruption/invariant failures are BLOCKERs.
- Operational exceptions that require Finance judgment are REVIEW items.
- Production rollout uses `--production --strict-review`; it must not silently ignore any review queue.
- Provider calls and real-money actions are deliberately outside the automated rollout checker.

## Last Commit

`feat: show authoritative weekly jackpot progress` (this development cycle)

## Latest Acceptance Evidence

Strict rollout result reported by user after Phase 8 finalization:
- system ledger accounts: PASS;
- 11 ledger transactions balanced: PASS;
- payment collections: PASS;
- 4 legacy agent sales correctly classified: PASS;
- Financial Suspense zero: PASS;
- treasury registry: PASS;
- migration FINALIZED: PASS;
- historical remittance NGN 25,000 preserved: PASS;
- Blockers=0;
- Review items=0;
- Passed checks=16;
- Ready=YES.


Latest smoke discovery:
- rollout smoke CLI starts successfully;
- Phase 8 is FINALIZED;
- 2 customer candidates found;
- 1 ACTIVE agent candidate found;
- 0 ACTIVE draws found;
- next prerequisite is a local scheduled smoke draw activated by the real Engine.
