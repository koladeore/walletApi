# Atomic wallet requests and safe retries

Funding and transfers require `x-idempotency-key`: 1–200 ASCII letters, digits,
underscores, dots, colons or hyphens. Generate a new UUID for each intended operation.
After a timeout or lost response, retry with the **same key and request**. Do not
create a new key to retry an uncertain payment.

Keys currently have a global namespace, matching the existing unique transaction
reference contract. A key is bound to operation, authenticated user, currency, exact
minor-unit amount and (for transfers) recipient email. Equivalent amounts such as
`"1"` and `"1.00"` match. Recipient emails match exactly. Another user or different
request receives 409, with no original transaction data disclosed.

Matching successful retries return HTTP 200 with the original response snapshot.
For funding, that includes the balance at the time of the original request. Use
GET /api/v1/users/wallet for the current balance. Replays do not resend transfer
notifications. Normal authentication and simulated-funding restrictions still apply.

The request's advisory transaction lock is taken before wallet locks. Transfers keep
ascending wallet-ID lock order. The balance mutations, transaction, ledger postings,
and response snapshot commit together in a READ COMMITTED transaction. Concurrent
matching requests wait for the first transaction, then replay its committed result.
Failed/rolled-back requests leave no success snapshot and can be attempted again.
A database timeout or deadlock is not a successful payment response: retry the same
key. There is no automatic unbounded server retry loop.

Snapshots persist across process restarts and are protected against update/deletion.
They are not automatically expired: deleting them could allow old keys to be reused.
Pre-migration transactions have no response snapshot and return 409 rather than
repeating a movement; reconcile those through transaction history.

Withdrawal reservations retain their separate reference namespace and existing
state-based retries. A reference lock now also serializes competing reservations
from different wallets. Repeated capture/release outcomes are safe; opposite terminal
outcomes conflict. Reserving an already resolved reference returns its current state
and does not reserve funds again.

Notifications are still best-effort after commit. A crash between commit and sending
can lose a notification. A transactional outbox is a separate delivery milestone;
financial idempotency does not guarantee notification delivery.

Deploy the new migration with the old API stopped (back up first):

```sh
docker compose stop api
docker compose up -d --build api
```

Regression checks include simultaneous matching funding/transfers, request mismatches,
owner separation, failed-request rollback, reverse-direction transfers, immutable
snapshots, legacy references, and notification suppression on replay.
