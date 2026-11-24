# Products, twice-daily draws and prize payment rules

Built 2026-11-24 from Mr Alex's changes (accounting consultant review). Not
accepted yet. Names and prices are placeholders until Mr Alex sends them.

## Products

A product is a game players buy (`products` table, Admin → Products).

| | Daily product | Jackpot product |
| --- | --- | --- |
| Prizes | Prize pool, up to **4** categories, cash only | Up to **3** stages |
| Winners per category | Worked out: floor(share of pool ÷ prize) | Set by management |
| Who wins | The engine, from the sealed seed | The engine, from the sealed seed |
| Item prizes | No | Yes: a stage can be an item; its prize amount is the cash value |

Each product has a code (used in draw codes), a name, the name printed on
the ticket, a ticket price, a headline, and its prize setup (payout %,
minimum pool and revenue counted for daily products).

**Maker-checker.** A new product, or any change to one, is proposed by one
admin (intermediate or above) and approved by a different senior admin.
Approval applies the change to the product and to its draws that have not
opened for sales. Draws already selling keep what buyers were shown.

## Schedules (draw times)

Each product has one schedule per slot, e.g. NOON and EVENING, also
maker-checker. A schedule has: sales open (optionally the evening before),
sales close, draw time, and weekdays. Default for daily products:

| Slot | Sales | Draw |
| --- | --- | --- |
| NOON | 19:00 the day before → 11:00 | 12:00 |
| EVENING | 13:00 → 17:00 | 18:00 |

The hour between close and draw is the approval window (Phase 2).

The scheduler creates one draw per product per slot per day, a week ahead,
code `RD-<PRODUCT>-<YYYYMMDD>-<SLOT>`, copying the product's price and prize
setup. The engine opens sales only at `sales_open_at`. Jackpot schedules use
their own weekdays (e.g. Wednesday and Saturday) and run alongside the daily
draws. Approving a schedule replaces only the same product and slot.

Draws from before products, and schedules without a product, work as before.

## Tickets and selling

Every open draw is listed, one per product: customer buy page, home page,
agent sell screen. Tickets print the product, e.g. "SURE 100 · 12:00", code
"SW100-1200". The draw page lists the prize categories and shows the draw's
real seed fingerprint (it previously showed a fixed example).

## Prize payment rules

- Daily prizes are cash only. Choosing an item is refused unless the jackpot
  category is an item prize.
- A winner who does not choose by the selection deadline gets **cash** (not
  forfeited). Only the claim deadline forfeits a prize (then it goes to the
  uncollected prizes ledger).
- **Automatic wallet credit** (switch `PRIZE_AUTO_WALLET_CREDIT_ENABLED`, also
  needs `WITMANGO_PRIZE_CREDITS_ENABLED`; both off): cash prizes on tickets a
  customer bought directly are paid into their CBA Winnings account after the
  draw, WHT deducted, once their wallet is set up. One attempt per claim.
  Agent-sold tickets are paid by the agent, who is reimbursed. Customers must
  open a wallet to receive winnings.

## Reports

Admin → Reports → Sales now also shows sales by product (by draw time and by
agent/direct), and the top 50 agents with state and super agent.

## Deploying

`bash /opt/surewina/scripts/deploy.sh`: backup, pull, install, migrate as the
migrator, generate, build, restart all six, health check. If anything fails
before the restart, the previous build is put back and nothing is restarted.

Migration: `20261124100000_products_and_slots` (additive).
