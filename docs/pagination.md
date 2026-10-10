# Bounded lists and cursor pagination

No database migration is needed for this change; restart the API. Response changes are intentional: users, beneficiaries, payouts and financial/admin lists now return `{ data, meta }` instead of a bare array. Update frontend consumers to use response.data.

Cursor-only lists: GET /users (admin), /beneficiaries, /wallet/payouts, /admin/financial-operations/runs, /issues, /cases, /fees, and /admin/account-controls/flags. Paths here omit /api/v1. Default limit 20; maximum 100. Fetch the first page without cursor:

```text
GET /api/v1/users?limit=20
```

```json
{
  "data": [],
  "meta": { "limit": 20, "hasMore": false, "nextCursor": null }
}
```

When hasMore=true, pass meta.nextCursor unchanged as the cursor query parameter. Preserve filters and endpoint; user-specific cursors cannot be used for a different user's list. Tokens encode a date/ID boundary, are validated and scoped, and are not authorization credentials or signed snapshots. Query ownership/role predicates remain enforced independently of the cursor. Altering a cursor cannot grant access to foreign records. Malformed or incorrectly scoped cursors return 400. Stop when nextCursor=null. Cursor lists omit total counts to avoid full-count queries per page.

GET /wallet/transactions retains the existing page-mode response with totalItems/currentPage/etc. Defaults page=1 and limit=10, maximum limit=100 and page=1000. Larger/invalid values return 400 rather than silently truncating. Reversed date ranges also return 400. For deep history use:

```text
GET /api/v1/wallet/transactions?mode=cursor&limit=20
GET /api/v1/wallet/transactions?mode=cursor&limit=20&cursor=PREVIOUS_NEXT_CURSOR
```

The cursor response uses `{ data, meta: { limit, hasMore, nextCursor } }`. Keep type/startDate/endDate filters unchanged. cursor requires mode=cursor and cannot be combined with page other than 1.

GET /notifications retains legacy page mode (20/page, maximum page=1000) and unreadCount. Add mode=cursor and limit (1–100) for efficient deep scrolling; unreadOnly must remain unchanged between pages. Cursor mode includes unreadCount but omits total counts. Custom limit is only supported in cursor mode. Reading items while paginating unreadOnly=true changes membership, as expected.

Ordering is descending immutable date then descending ID. Date fields: createdAt for users, transactions, notifications, payouts, beneficiaries, fees, cases and activity flags; startedAt for reconciliation runs; firstSeenAt for reconciliation issues. Financial cases/issues are now ordered by original creation/first-seen time rather than mutable update/last-seen time. A new record may appear before your cursor and is seen when you refresh the first page. State-filter changes may remove rows; cursors are not a frozen snapshot.

This step bounds response sizes and offset depth. Query indexes, query plans and database connection limits are the next milestone item; cursor pagination does not by itself guarantee an indexed query plan.

Manual checks: create enough records for multiple pages, follow nextCursor until null, and verify no repeated IDs; include records with the same timestamp. Insert a newer record between requests and verify it does not shift subsequent pages. Delete the cursor boundary row and verify remaining pages still work. Try limit=101, page=1001, malformed cursors and foreign/scoped cursors and expect 400. Regular users must still receive 403 on admin lists.
