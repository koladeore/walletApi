# Administrator controls

The startup uses USER and ADMIN only. Every staff endpoint is protected by JWT authentication and a current database-backed ADMIN role. Inactive, closed, revoked-session, and stale authorization-version credentials cannot authenticate. Each owner/developer should use their own admin account; registration cannot choose a role.

Admin reads: user list, user-by-ID, and financial operations runs/issues/cases/fees. Successful reads create ADMIN_RECORDS_READ records with actor ID, server timestamp, path, and target ID when applicable. Response data, query strings, passwords, codes, and tokens are not copied into these records. Audit failure prevents returning the read result.

Admin mutations: user status changes, account closure, internal transaction reversal, issue resolution, wallet unfreezing, and manually starting reconciliation. These require verified email, current password/email-code step-up, and a reason in the request body. Actual mutation code rechecks the administrator and authorization version. Changes already record target IDs and reasons in audit_logs; reconciliation records requested and completed events with its resulting run ID and status. Automatic background reconciliation remains automatic and does not impersonate a human operator.

For manual reconciliation, request ADMIN step-up with:

```json
{
  "password": "YOUR_CURRENT_PASSWORD",
  "action": "ADMIN",
  "details": {
    "method": "POST",
    "path": "/api/v1/admin/financial-operations/reconcile",
    "body": { "reason": "Investigate provider and ledger differences" }
  }
}
```

Confirm its code, then send the proof in x-step-up-token and the exact same reason body to POST /api/v1/admin/financial-operations/reconcile. The reason must be 10–1000 characters. Other admin endpoints retain their existing reason validation. Read-only staff endpoints require normal bearer authorization without step-up.

Audit records use userId as the actor and metadata for affected records/reasons, with a server-generated timestamp. Inspect them using trusted database tooling; there is no public audit-log endpoint. Access denials do not change financial state. Completed read records describe successful access; mutation records describe committed changes. Audit logs are not yet a tamper-proof external audit archive.

Manual verification: use a regular user token on each staff route and expect 403. An admin without a step-up proof cannot mutate. An admin with the exact matching proof can perform a valid action and its audit record must identify that admin, target, time and reason. Changing the action body invalidates the proof. Admin reads must create records without including sensitive response contents.

Account-tier changes, manual outgoing freezes and activity-flag resolution are also protected admin mutations. See [account limits](account-limits.md). Open activity flags must be resolved before wallet unfreezing.
