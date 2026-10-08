# AI Build State

Updated: 2026-10-08

## Current Goal

Validate Phase 10: retire current-use free jackpot entry SMS notifications in favor of per-offer notification plumbing, complete agent-earned offer notices, and retain separate historical free-entry reporting.

## Current Status

AWAITING USER TEST — notification worker, agent post-commit dispatch, delivery marker, recovery sweep and current copy have been implemented; requires Prisma migration, generated clients, tests, builds and real SMS sandbox verification.

## Last Accepted Task

Phase 10: replace JOB_JACKPOT_ENTRY_SMS with JOB_JACKPOT_OFFER_SMS for new notifications; queue an SMS for each newly issued agent-earned offer, revalidate the persisted entitlement and qualifying confirmed agent sale in the worker, and send only a phone-verification claim URL.

## Current Implementation

Latest jackpot-promotion increment:
- Phase 9 secure claim page is already live in the repository at /jackpot-offers/claim. It demands OTP-authenticated phone ownership before reading or purchasing any offer.
- The notification job type has changed from jackpot-entry-sms to jackpot-offer-sms with offerId, buyerPhone, offerPriceNgn, normalPriceNgn, jackpotScheduledAt and expiresAt. New code never enqueues free-entry notifications.
- Newly created JackpotDiscountOffer rows from the confirmed agent sale are queried by unlockedByPaymentTxnId after the sale commits, and one idempotently keyed notification is queued per offer. No entitlements are inferred from sale quantity alone.
- The worker verifies the offered amounts/expiry against the persisted offer and checks the source transaction is confirmed AGENT_CASH for the matching buyerPhone. Expired/claimed/declined/already-notified offers do not trigger notifications.
- SMS includes no unrestricted offer or purchase token; it directs customers to a generic secure sign-in/phone-verification claim page and describes a separate optional NGN 500 ticket purchase, not a free entry.
- SMS sending respects stored smsEnabled opt-out, self-exclusion, and blocked-phone status. A stable V2N message ID keyed by offerId mitigates duplicates across worker retries.
- JackpotDiscountOffer.offerSmsSentAt tracks delivery after provider acceptance. The new migration 20261008180000_agent_jackpot_offer_sms adds this nullable column and an index; historical offers remain intact.
- An agent-only worker recovery sweep finds undelivered available offers joined to confirmed AGENT_CASH transactions, so a Redis outage after the sale commit can be recovered without recreating the entitlement.
- Customer marquee and admin customer and jackpot screens no longer promise automatically minted free entries. Admin historical counters remain explicitly labeled as historical, not active promotion benefits.
- Admin customer weekly progress is scoped to the currently open Saturday jackpot cycle, with milestone and available-offer counts.
- The historical jackpot-entry model, draw engine and results remain untouched to preserve auditability.
- Added entitlement/notification tests. The customer/agent build, Prisma migration and live SMS/provider behaviour still require local/sandbox validation before production rollout.

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

1. Pull main; validate the Prisma schema and apply the new 20261008180000_agent_jackpot_offer_sms migration to the correct nonproduction database, then regenerate Prisma Client for API and Worker.
2. Run test/agent-jackpot-offer-entitlement.spec.ts and test/jackpot-offer-notification.spec.ts plus earlier jackpot-offer tests.
3. Run API/Worker/shared-package and customer/admin web builds, and pnpm type-check / pnpm build.
4. Run rollout:check --strict-review and verify no financial invariants regressed.
5. Verify agent 9+1 and single 10-ticket sale: exactly one NGN 500 offer appears, and a phone-verified customer can view it.
6. In a controlled SMS sandbox, confirm an offer notice is sent once, never before committed confirmation, never after expiry, and never to explicitly opted-out or blocked customers.
7. Simulate Redis unavailable at sale completion; worker recovery should notify an eligible still-open offer when connectivity is restored. Do not deploy this without consent/legal review of promotional messaging and approved SMS copy.

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

`feat: replace jackpot entry SMS with offer notifications` (this development cycle)

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
