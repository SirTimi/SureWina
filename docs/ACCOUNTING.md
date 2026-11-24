# Accounting (Phase 3)

The accounting framework around SureWina's double-entry ledger. Nothing here
changes how money is posted; it adds month close, a mapping to the accounting
consultant's chart of accounts, and exports.

Admin page: **Finance → Accounting** (`/accounting`). As with the other finance
pages, it is visible to Super Admin and Auditor tiers.

## Months (accounting periods)

Months are calendar months in Nigerian time (WAT). 23:30 UTC on 31 October is
already November.

| Step | Who | What happens |
|---|---|---|
| Propose close | Finance officer or Super Admin, after the month has ended | Month becomes *To approve* |
| Approve and close | A Super Admin **other than the proposer** | Trial balance at month end is frozen with a SHA-256 fingerprint; month becomes *Closed* |
| Reject | Super Admin | Back to *Open* |
| Reopen (exceptional) | Super Admin, reason of at least 10 characters | Back to *Open*; the old frozen balance and fingerprint stay in the audit log (CRITICAL) |

While a month is closed, nothing dated in it can be posted:

- the ledger service refuses with a clear message, and
- the database trigger `ledger_transactions_closed_period` refuses any insert
  (or change of date) into `ledger_transactions` for a closed month, so nothing
  can bypass the service.

Approving a close briefly locks `ledger_transactions` (SHARE MODE) so no
posting slips in between the balance being read and the month being closed.

The month view shows whether the live ledger still matches what was frozen
(it should, unless the month was reopened).

Late items for a closed month are posted in the current month, as usual in
accounting.

## Trial balance

One line per system account, and one line per *purpose* for customers' and
agents' own accounts (for example "Customer Available (all customers)"), so the
accountant sees control totals, not thousands of wallets.

## Chart of accounts

Each SureWina account (system code, or purpose for customer/agent accounts) is
mapped to a GL code and name from the consultant's chart. Every change is
proposed and then approved by a **different** Super Admin. Until mapped, lines
export with GL code `UNMAPPED` and SureWina's own account name.

## Exports

`GET /v1/admin/accounting/periods/:YYYY-MM/journal.csv?view=summary|detail`

- **summary**: one line per day, GL code and product, netted to one side.
  Debits equal credits for each day. Journal reference `SW-YYYY-MM-DD`.
- **detail**: every posting line, with the ledger journal id, kind, source
  reference, SureWina account, GL code, product and memo.

The product on a line is found from what the posting came from: card/transfer
payments (via the tickets), wallet purchases (via the draw) and prize claims
(via the draw result). Other postings (funding, withdrawals, fees) have no
product.

## Profit by product

`GET /v1/admin/accounting/periods/:YYYY-MM/pnl`

- **Ledger view** (what was posted): ticket sales revenue, agent commission,
  prize expense, payment fees, other expense, net.
- **Draws view** (what the month's draws did): prizes awarded, company top-ups,
  amounts kept (rounding, unawarded, unclaimed), and GGR = sales − prizes
  awarded.

Prize expense in the ledger follows claims as they are paid; prizes awarded
follows the draws. The two differ by prizes not yet claimed.

## Tests

- `apps/api/test/accounting.service.spec.ts`: close and mapping rules.
- `apps/api/test/accounting-postgres.spec.ts`: the SQL, the trigger and the full
  flow on a real database. Runs only on a database named `surewina_ci` with
  `CI=true` or `SUREWINA_FINANCIAL_DB_TESTS=1`.
