# Draw approvals (Phase 2)

Built 2026-11-24 from Mr Alex's checker/approval requirement and the
ChatGPT recommendation he shared. Not accepted yet. Approvers are a setting
until Mr Alex names them.

## Gate 1 — setup approved before sales open

- Product draws: approved through their product and their schedule, each
  approved by a second senior admin (Admin → Products). The scheduler marks
  the draw approved when it creates it.
- Draws set up by hand (Admin → Draws → New): sales cannot open until a
  different senior admin approves the setup (Admin → Draws → Approvals).
  Any edit clears the approval.
- The engine opens sales only when `setup_approved_at` is set.
- Draws that existed before this change were marked approved by the
  migration, so nothing in flight stops.

## Gate 2 — checks and approval after sales close

Within 30 seconds of a draw's sales closing, the API checks it:

| Check | Blocks approval |
| --- | --- |
| Setup was approved before sales | Yes |
| Seed sealed before any ticket was sold | Yes |
| No ticket sold after the cutoff | Yes |
| Every ticket has a confirmed payment or completed wallet purchase | Yes |
| Every agent ticket is linked to its agent | Yes |
| Prize setup valid and locked when sales opened | Yes |
| Pool covered by sales (else company top-up shown) | No |
| No unresolved wallet purchases for the draw | No |
| The draw has entries | No |

It also records the draw's **fingerprint**: a hash of its exact entries and
prize setup (`draw-snapshot.ts`, identical copies in the API and engine).

- A blocking failure: the draw is held (`CHECKS_FAILED`), and cannot be
  approved. Fix, then **Check again**.
- All pass: `AWAITING_APPROVAL`. An approver reviews the checks, the
  figures, what it pays, and can download every ticket (CSV). They approve
  with their **password and two-factor code**. Approvers must have
  two-factor sign-in set up.
- Reject: a reason is required; the draw is held. Then check again, or
  cancel the draw (tickets refunded).
- The engine runs only `APPROVED` draws, and recomputes the fingerprint on
  the exact entries it is about to draw. If it differs, it does not run: the
  approval is marked `INVALIDATED` and the draw goes back for a fresh check.
- Not approved within `DRAW_RELEASE_ESCALATE_MINUTES` of the cutoff:
  escalated (CRITICAL audit, notification). The draw waits; it never runs
  unapproved. Players see "Draw verification in progress".
- Approving cannot change who wins: the seed was sealed before sales.

## Settings (apps/api/.env)

| Setting | Default | Meaning |
| --- | --- | --- |
| `DRAW_RELEASE_APPROVAL_REQUIRED` | `true` | `false`: approved automatically when every check passes (a failing draw is still held) |
| `DRAW_RELEASE_APPROVER_TIERS` | `SUPER` | Admin tiers that may approve |
| `DRAW_RELEASE_APPROVER_ROLES` | (any) | Optionally limit to roles, e.g. `OPERATOR,FINANCE_OFFICER` |
| `DRAW_RELEASE_ESCALATE_MINUTES` | `30` | Minutes after the cutoff before escalation |

Restart `surewina-api` after changing them.

Migration: `20261124180000_draw_approvals`.
