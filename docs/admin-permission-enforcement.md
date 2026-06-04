# Admin backend permission enforcement

Phase 4 adds backend-side permission policy and guarded admin governance endpoints.

## Roles

- Basic Admin
- Intermediate Admin
- Super Admin
- Auditor

## Key rules

- Frontend visibility is not trusted as security.
- Every sensitive endpoint must declare a required admin action with `@RequireAdminAction(...)`.
- `AdminPermissionGuard` extracts the admin principal and evaluates the role against the shared permission policy.
- Auditor is read-only and cannot create, edit, approve, reject, or initiate actions.
- Same-user initiate-and-approve is blocked for sensitive finalization actions.
- Intermediate Admin cannot perform final authorization actions.

## Current identity adapter

The scaffold extracts admin identity from headers:

- `x-admin-user-id`
- `x-admin-email`
- `x-admin-role`

This is intentionally temporary. When real auth lands, replace this with JWT/session validation and keep the same permission guard boundary.

## Covered backend actions

- `VIEW_AGENTS`
- `INITIATE_AGENT_PROFILING`
- `APPROVE_AGENT_ONBOARDING`
- `CREATE_DRAW_SETUP_REQUEST`
- `APPROVE_DRAW_SETUP`
- `VIEW_AUDIT_LOGS`
- `MANAGE_ADMINS`
- `CHANGE_TICKET_PRICE`
- `CHANGE_DRAW_FORMULA`

## Example

```ts
@Post('draws/setup-requests/:requestId/approve')
@RequireAdminAction('APPROVE_DRAW_SETUP')
approveDrawSetup(...) {
  // only an allowed role can enter here
}
```

## Next hardening steps

- Replace header identity with real authenticated admin sessions.
- Persist permission decisions into the operational audit log.
- Attach workflow records to every sensitive request.
- Enforce database-level status transitions.
- Add tests for each role/action combination.
