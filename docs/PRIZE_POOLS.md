# Prize pools and jackpot stages

Built 2026-11-20 from Mr Alex's requirements. Not accepted yet. Values in the
admin form are placeholders until the business confirms them.

## The three prize models

Each draw has a `prizeModel`:

| Model | Who wins | Set on the draw |
| --- | --- | --- |
| `SINGLE` (default, unchanged) | One winner wins `prizeValueNgn` | Prize value |
| `POOL` | Up to 3 categories, many winners each | Payout ratio, minimum pool, revenue counted, and per category: share of the pool and prize per winner |
| `STAGES` | Up to 3 jackpot stages | Per stage: on/off, number of winners, prize per winner. Stage 1 (main jackpot) is always on |

Draw templates (the scheduler) still create `SINGLE` draws.

## Pool arithmetic

Whole naira; percentages in basis points (5000 = 50%). One file,
`prize-pool.math.ts`, is copied identically into the engine and the API (a
test fails if they differ), so the admin preview is exactly what the draw
pays.

- Eligible revenue = active tickets at face value (`GROSS`), or less each
  selling agent's commission (`NET_OF_COMMISSION`). Default `GROSS`. **Open
  with Mr Alex.**
- Pool = max(minimum pool, floor(payout ratio × eligible revenue)). If the
  minimum is higher, the difference is the company top-up
  (`fundingShortfallNgn`, audited as `DRAW_POOL_FUNDING_SHORTFALL`).
- Category winners = floor(floor(pool × share) ÷ prize per winner). The rest
  is rounding, kept by the company.
- Shares of the active categories must add up to exactly 100%.
- Fewer entries than prizes: category 1 is filled first; prizes nobody could
  win are kept by the company. No rollover.

Example (from the tests): 3,600 tickets × ₦500 = ₦1.8m, 50% = ₦900k pool;
25% / 20% / 55% at ₦25,000 / ₦10,000 / ₦5,000 gives 9 / 18 / 99 winners and
pays all ₦900k.

## Picking winners (engine 1.1.0)

No person and no AI picks winners. Same sealed seed, same frozen pool and
Merkle root as before.

- `SINGLE`: unchanged method (`<drawCode>:WINNER_INDEX`), so every past draw
  still verifies.
- `POOL` / `STAGES`: pick k (from 0) uses `<drawCode>:PICK:<k>`, uniform over
  the entries not yet picked; a ticket wins at most once. Winners take
  category 1 first, then 2, then 3.
- Only `POOL` draws read ticket prices (their pool depends on revenue).
  Single and stage draws never see what a ticket cost.
- Each winner is a `draw_winners` row and gets their own claim
  (`prize_claims.draw_winner_id`) and SMS. The worker refuses a job that does
  not match the recorded winner exactly.

## Integrity certificate

Pool and stage draws store a signed certificate in `draw_results.certificate`
(plain `json`, not `jsonb`, so the signed text survives). It lists the pool
figures, every tier, every winner in pick order, totals and the randomness
evidence. The engine signs `JSON.stringify(certificate)`.

The public verification endpoint returns it, and
`packages/verify/verify.cjs` recomputes every winner, their tiers, the pool
sums and the signature. Tests confirm it fails if a winner is swapped or moved
to a bigger prize.

## Locking

A draw's prize setup can be edited only while `SCHEDULED`. When the engine
opens sales (`SCHEDULED → ACTIVE`) it sets `prizeConfigLockedAt`; edits are
guarded on both, so a draw that has just opened is never changed.

Changes to the payout ratio or minimum pool are audited as `WARNING`
(`poolTermsChanged`). The approval workflow Mr Alex asked for ("the full
complement of approvals") waits for who the approvers are.

## Uncollected prizes ledger

`retained_prizes`, read-only, shown to finance at **Admin → Finance →
Uncollected prizes** (`GET /admin/finance/uncollected-prizes`).

- `ROUNDING` and `UNAWARDED`: written by the engine with the draw result.
- `UNCLAIMED`: written by the claims sweep in the same transaction as the
  forfeit, one row per claim, at the gross prize.

## Still open

- Revenue gross or after commission (built as a per-draw setting).
- Real categories, shares, prizes and minimum.
- Who approves changes to the payout ratio and minimum.
- WHT rate and threshold (code default 5%, no threshold) — tax adviser.
- Jackpot stage prizes, and whether jackpot winners share the jackpot.
- Regulator approval and RNG certification (blocks go-live, not the build).
