# User access and recipient lookup

## Access rules

- `GET /api/v1/users` and `GET /api/v1/users/:id` require an active authenticated `ADMIN`.
- `GET /api/v1/users/profile` and `GET /api/v1/users/wallet` remain available to each active authenticated user for their own account.
- `POST /api/v1/users/recipient-lookup` accepts `{ "email": "recipient@example.com" }` from an active authenticated user. It matches an exact email and returns only `id`, `firstName`, and `lastName` for an active user with a wallet. Missing, inactive, or walletless recipients return 404.
- Recipient lookup uses the application's existing global rate limiter. Do not expose unrestricted directory search as a substitute.
- Roles are read from the database on every authenticated request, not trusted from JWT role claims. Demotions therefore take effect on the next request.

## Apply the change

Run `docker compose up -d --build api`. Compose applies the new migration before starting the API. All existing users default to `USER`; registration also explicitly creates `USER` accounts. No existing account is automatically promoted.

For a non-Docker deployment, run `npx prisma generate`, apply migrations with `npx prisma migrate deploy`, and rebuild/restart the API. Apply the migration before running the updated API against that database.

## Assign the first admin

Only a trusted database operator should assign roles. After verifying the intended person's identity and user ID, run this SQL against the intended database, replacing the placeholder:

```sql
UPDATE users
SET role = 'ADMIN', "updatedAt" = NOW()
WHERE id = '<verified-user-uuid>' AND "isActive" = true
RETURNING id, email, role;
```

Check that exactly the intended account was updated. To revoke admin access, set `role = 'USER'` using the same verified ID. No public registration or role-promotion endpoint is provided.

## Swagger verification

1. Log in as a regular user: both directory routes must return 403.
2. Confirm the user's own profile and wallet still return 200.
3. Call recipient lookup with an active wallet holder's exact email: expect only ID and names. Invalid emails return 400; unavailable recipients return 404.
4. After a trusted operator assigns ADMIN, the directory routes should return 200 with the account's access token.
5. Revoke ADMIN and repeat: directory access must return 403, even with the same token.
