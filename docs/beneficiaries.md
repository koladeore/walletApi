# Beneficiaries and bank-account verification

Sensitive write routes now require verified email and an action-bound `x-step-up-token`. Complete the [account security flow](account-security.md) before following write examples below.

This step supports Nigerian NGN bank accounts through the existing Paystack test integration. Apply the migration and restart:

```bash
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Authorize Swagger with your user's access token. All beneficiary endpoints require authentication.

1. Call `GET /api/v1/beneficiaries/banks?page=1`. Choose an active bank and copy its string `code` exactly, including letters or leading zeros. If `nextPage` is provided, use it to fetch the next page.
2. Call `POST /api/v1/beneficiaries/resolve` with your test bank details:

   ```json
   { "bankCode": "058", "accountNumber": "0001234567" }
   ```

   These values illustrate the required format; they are not guaranteed working Paystack test fixtures. Use account details supported by your Paystack test environment. Keep account numbers and bank codes as strings so leading zeros are preserved. Provider access restrictions or outages fail closed; the app does not invent a verified account name.

3. Review the returned `accountName`. Resolving confirms the name reported for that account, not that the logged-in user owns it or passed KYC.
4. Call `POST /api/v1/beneficiaries` with the same two fields to save. The server resolves the account again; do not send `accountName`, `userId`, currency, or provider fields. Extra body fields are rejected.
5. Call `GET /api/v1/beneficiaries` or `GET /api/v1/beneficiaries/{id}` to read your saved records. Responses show the account number's last four digits. Another user's beneficiary ID returns 404. Repeating the save for the same user, bank, and account reuses the beneficiary ID and refreshes the verification timestamp.

The database retains the full account number for future payouts; it is masked in saved-beneficiary responses and is not logged by this feature. Protect database access and backups. Account-name previews are returned only to the authenticated requester.

Saving does not reserve or debit money, create a transfer recipient at Paystack, or initiate a payout. Use the [payout endpoints](payouts.md) to request a withdrawal to a saved beneficiary. Full Milestone 4 is not complete yet.

References: [Paystack account resolution](https://paystack.com/docs/api/verification/) and [supported bank list](https://paystack.com/docs/api/miscellaneous/).

`npm run test:beneficiaries` tests concurrent saving, ownership, database constraints, and unchanged balances on a migrated disposable `LEDGER_TEST_DATABASE_URL` database named `wallet_ledger_test*`. Provider resolution responses are mocked. Never run database integration tests against the application database.

See [pagination](pagination.md) for page limits, cursor parameters and frontend response changes.
