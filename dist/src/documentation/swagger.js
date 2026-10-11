"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentFrontendApi = documentFrontendApi;
const string = (example, description) => ({
    type: 'string',
    example,
    ...(description ? { description } : {}),
});
const uuid = () => ({
    ...string('de305d54-75b4-431b-adb2-eb6b9e546014'),
    format: 'uuid',
});
const date = (nullable = false) => ({
    ...string('2026-10-09T12:00:00.000Z'),
    format: 'date-time',
    nullable,
});
const bool = (example = false) => ({ type: 'boolean', example });
const integer = (example = 1) => ({ type: 'integer', example });
const nullable = (schema) => ({ ...schema, nullable: true });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const array = (items) => ({ type: 'array', items });
const ref = (name) => ({ allOf: [{ $ref: `#/components/schemas/${name}` }] });
const enumeration = (...values) => ({
    type: 'string',
    enum: values,
    example: values[0],
});
const money = () => string('100.50', 'Decimal amount as a string. Never use floating-point arithmetic for money.');
const minor = () => string('10050', 'Integer minor units as a string (100 kobo = 1 NGN); may exceed JavaScript safe integer range.');
const message = object({ message: string('Operation completed') });
const userFields = {
    id: uuid(),
    email: { ...string('user@example.com'), format: 'email' },
    firstName: nullable(string('Ada')),
    lastName: nullable(string('Okafor')),
};
const timestamps = { createdAt: date(), updatedAt: date() };
const profile = object({ ...userFields, isActive: bool(true), ...timestamps });
const wallet = object({
    id: uuid(),
    userId: uuid(),
    balanceMinor: minor(),
    reservedMinor: string('0'),
    balance: money(),
    reservedBalance: string('0.00'),
    availableMinor: minor(),
    availableBalance: money(),
    currency: string('NGN'),
    outgoingFrozen: bool(),
    closedAt: date(true),
    ...timestamps,
});
const transaction = object({
    id: uuid(),
    amount: money(),
    amountMinor: minor(),
    currency: string('NGN'),
    type: enumeration('CREDIT', 'DEBIT', 'TRANSFER'),
    status: enumeration('SUCCESS', 'PENDING', 'FAILED'),
    referenceId: string('fund-example'),
    metadata: { type: 'object', additionalProperties: true, nullable: true },
    senderWalletId: nullable(uuid()),
    receiverWalletId: nullable(uuid()),
    reversalOfId: nullable(uuid()),
    ...timestamps,
});
const beneficiary = object({
    id: uuid(),
    bankCode: string('058'),
    accountNumberLast4: string('4567'),
    accountName: string('ADA OKAFOR'),
    currency: string('NGN'),
    providerMode: string('test'),
    verifiedAt: date(),
    createdAt: date(),
});
const run = object({
    id: uuid(),
    status: enumeration('CLEAN', 'DIFFERENCES', 'RUNNING', 'INCOMPLETE'),
    startedAt: date(),
    completedAt: date(true),
    summary: { type: 'object', additionalProperties: true, nullable: true },
});
const issue = object({
    id: uuid(),
    key: string('wallet:example'),
    kind: string('WALLET_BALANCE_MISMATCH'),
    reference: nullable(string('fund-example')),
    details: { type: 'object', additionalProperties: true },
    status: enumeration('OPEN', 'RESOLVED'),
    firstSeenAt: date(),
    lastSeenAt: date(),
    resolvedAt: date(true),
    resolution: nullable(string('Investigation completed')),
});
const schemas = {
    NotificationDelivery: object({
        id: uuid(),
        userId: uuid(),
        kind: string('WELCOME'),
        title: string('Welcome to your wallet'),
        createdAt: date(),
        emailStatus: enumeration('FAILED', 'SKIPPED', 'PENDING', 'SENT'),
        emailAttempts: integer(5),
        emailBatchAttempts: integer(5),
        emailRecoveryCount: integer(0),
        emailLastError: nullable(string('PROVIDER_HTTP_403')),
        emailFirstAttemptAt: date(true),
        emailNextAttemptAt: date(),
        emailLockedUntil: date(true),
    }),
    Notification: object({
        id: uuid(),
        kind: enumeration('WELCOME', 'FUNDING_SUCCESS', 'TRANSFER_SENT', 'TRANSFER_RECEIVED', 'PAYOUT_SUCCESS', 'PAYOUT_FAILED', 'PAYOUT_REVERSED', 'WALLET_FROZEN', 'WALLET_UNFROZEN'),
        title: string('Funding confirmed'),
        body: string('Your payment was confirmed and your wallet credited.'),
        data: {
            type: 'object',
            additionalProperties: true,
            description: 'Navigation reference, transactionId or walletId; monetary amountMinor is a string when present.',
        },
        readAt: date(true),
        createdAt: date(),
    }),
    NotificationPage: object({
        data: array(ref('Notification')),
        meta: object({
            page: integer(),
            pageSize: integer(20),
            total: integer(20),
            totalPages: integer(),
        }),
        unreadCount: integer(3),
    }),
    UnreadCount: object({ unreadCount: integer(3) }),
    NotificationsRead: object({ updated: integer(3) }),
    AccountLimits: object({
        tier: enumeration('BASIC', 'VERIFIED'),
        emailVerified: bool(true),
        timezone: string('Africa/Lagos'),
        day: string('2026-10-09'),
        transactionLimit: string('50000.00'),
        dailyLimit: string('100000.00'),
        usedToday: money(),
        remainingToday: string('99899.50'),
        outgoingFrozen: bool(),
    }),
    TierChanged: object({ userId: uuid(), tier: enumeration('BASIC', 'VERIFIED') }),
    AccountFrozen: object({ userId: uuid(), outgoingFrozen: bool(true) }),
    ActivityFlag: object({
        id: uuid(),
        key: string('user:day:OUTGOING_VELOCITY'),
        userId: uuid(),
        kind: enumeration('OUTGOING_VELOCITY', 'DAILY_LIMIT_NEAR'),
        status: enumeration('OPEN', 'RESOLVED'),
        details: { type: 'object', additionalProperties: true },
        createdAt: date(),
        resolvedAt: date(true),
        resolution: nullable(string('Investigation completed')),
    }),
    Session: object({
        id: uuid(),
        userAgent: nullable(string('Mozilla/5.0 ...')),
        createdAt: date(),
        lastUsedAt: date(),
        expiresAt: date(),
        current: bool(true),
    }),
    PublicUser: profile,
    Wallet: wallet,
    Transaction: transaction,
    Beneficiary: beneficiary,
    Message: message,
    AuthTokens: object({
        accessToken: string('eyJ...access-token'),
        sessionId: uuid(),
        sessionExpiresAt: date(),
        refreshToken: string('eyJ...refresh-token'),
        user: object({ ...userFields, role: enumeration('USER', 'ADMIN') }),
    }),
    VerificationStatus: object({ emailVerified: bool(true), emailVerifiedAt: date(true) }),
    SecurityChallenge: object({ challengeId: uuid(), expiresAt: date() }),
    EmailConfirmed: object({ emailVerified: bool(true) }),
    StepUpProof: object({
        stepUpToken: string('a'.repeat(64), 'Single-use action approval. Send as x-step-up-token; not a bearer token.'),
        expiresAt: date(),
        action: enumeration('PAYOUT', 'TRANSFER', 'BENEFICIARY', 'ADMIN'),
    }),
    Funding: object({
        reference: string('fund-de305d54-75b4-431b-adb2-eb6b9e546014'),
        amount: money(),
        amountMinor: minor(),
        currency: string('NGN'),
        status: enumeration('PENDING', 'INITIALIZING', 'INITIALIZATION_UNKNOWN', 'SUCCESS', 'FAILED'),
        authorizationUrl: nullable({
            ...string('https://checkout.paystack.com/example'),
            format: 'uri',
        }),
        accessCode: nullable(string('checkout-access-code')),
    }),
    Payout: object({
        id: uuid(),
        reference: string('payout-de305d54-75b4-431b-adb2-eb6b9e546014'),
        beneficiaryId: uuid(),
        amount: money(),
        amountMinor: minor(),
        currency: string('NGN'),
        status: enumeration('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED'),
        providerStatus: nullable(string('pending')),
        uncertain: bool(),
        lastError: nullable(string('Provider outcome uncertain')),
        createdAt: date(),
    }),
    Banks: object({
        banks: array(object({ name: string('Guaranty Trust Bank'), code: string('058'), active: bool(true) })),
        page: integer(),
        nextPage: nullable(integer(2)),
    }),
    ResolvedBank: object({
        accountNumber: string('0001234567'),
        bankCode: string('058'),
        accountName: string('ADA OKAFOR'),
        currency: string('NGN'),
        providerMode: string('test'),
    }),
    FundedWallet: object({ wallet: ref('Wallet'), transaction: ref('Transaction') }),
    TransactionPage: object({
        data: array(ref('Transaction')),
        meta: object({
            totalItems: integer(20),
            itemCount: integer(10),
            itemsPerPage: integer(10),
            totalPages: integer(2),
            currentPage: integer(),
        }),
    }),
    Recipient: object({ id: uuid(), firstName: userFields.firstName, lastName: userFields.lastName }),
    ClosedAccount: {
        oneOf: [ref('PublicUser'), object({ id: uuid(), closedAt: date(), isActive: bool() })],
    },
    ReconciliationRun: run,
    ReconciliationIssue: issue,
    FinancialCase: object({
        id: uuid(),
        kind: string('DISPUTE'),
        providerId: string('provider-case-id'),
        fundingId: uuid(),
        reference: string('fund-example'),
        walletId: uuid(),
        providerStatus: string('pending'),
        amountMinor: minor(),
        recoveredMinor: string('0'),
        shortfallMinor: string('0'),
        applied: bool(),
        nextCheckAt: date(),
        ...timestamps,
    }),
    ProviderFee: object({
        id: string('provider-fee-id'),
        reference: string('fund-example'),
        kind: string('FUNDING'),
        amountMinor: string('150'),
        createdAt: date(),
    }),
    UnfrozenWallet: object({ walletId: uuid(), outgoingFrozen: bool() }),
    WebhookAcknowledgement: object({ received: bool(true) }),
    ApiError: object({
        statusCode: integer(400),
        timestamp: date(),
        path: string('/api/v1/auth/security/email/confirm'),
        message: {
            oneOf: [
                string('Internal server error'),
                object({
                    message: {
                        oneOf: [string('Invalid or expired security code'), array(string('Validation error'))],
                    },
                    error: string('Unauthorized'),
                    statusCode: integer(401),
                }),
            ],
        },
    }),
};
function documentFrontendApi(document) {
    document.components ??= {};
    document.components.schemas = { ...document.components.schemas, ...schemas };
    const routes = {
        'post /auth/register': 'PublicUser',
        'post /auth/login': 'AuthTokens',
        'post /auth/refresh': 'AuthTokens',
        'post /auth/logout': 'Message',
        'get /auth/sessions': 'Session[]',
        'post /auth/sessions/{id}/logout': 'Message',
        'post /auth/logout-all': 'Message',
        'get /auth/security/status': 'VerificationStatus',
        'post /auth/security/email/request': 'SecurityChallenge',
        'post /auth/security/email/confirm': 'EmailConfirmed',
        'post /auth/security/password/request-reset': 'Message',
        'post /auth/security/password/reset': 'Message',
        'post /auth/security/step-up/request': 'SecurityChallenge',
        'post /auth/security/step-up/confirm': 'StepUpProof',
        'get /admin/notification-deliveries': 'NotificationDeliveryCursorPage',
        'get /admin/notification-deliveries/{id}': 'NotificationDelivery',
        'post /admin/notification-deliveries/{id}/retry': 'NotificationDelivery',
        'get /notifications': 'NotificationHistory',
        'get /notifications/unread-count': 'UnreadCount',
        'post /notifications/read-all': 'NotificationsRead',
        'post /notifications/{id}/read': 'Notification',
        'get /wallet/limits': 'AccountLimits',
        'post /admin/account-controls/users/{id}/tier': 'TierChanged',
        'post /admin/account-controls/users/{id}/freeze': 'AccountFrozen',
        'get /admin/account-controls/flags': 'ActivityFlagCursorPage',
        'post /admin/account-controls/flags/{id}/resolve': 'ActivityFlag',
        'get /users': 'PublicUserCursorPage',
        'get /users/profile': 'PublicUser',
        'get /users/wallet': 'Wallet',
        'get /users/{id}': 'PublicUser',
        'post /users/recipient-lookup': 'Recipient',
        'patch /users/{id}/status': 'PublicUser',
        'post /users/{id}/close': 'ClosedAccount',
        'delete /users/{id}': 'ClosedAccount',
        'get /beneficiaries/banks': 'Banks',
        'post /beneficiaries/resolve': 'ResolvedBank',
        'post /beneficiaries': 'Beneficiary',
        'get /beneficiaries': 'BeneficiaryCursorPage',
        'get /beneficiaries/{id}': 'Beneficiary',
        'post /wallet/funding/initialize': 'Funding',
        'get /wallet/funding/{reference}': 'Funding',
        'post /wallet/funding/{reference}/verify': 'Funding',
        'post /wallet/payouts': 'Payout',
        'get /wallet/payouts': 'PayoutCursorPage',
        'get /wallet/payouts/{reference}': 'Payout',
        'post /wallet/payouts/{reference}/verify': 'Payout',
        'post /wallet/fund': 'FundedWallet',
        'post /wallet/transfer': 'Transaction',
        'get /wallet/transactions': 'TransactionHistory',
        'post /wallet/transactions/{id}/reverse': 'Transaction',
        'post /paystack/webhook': 'WebhookAcknowledgement',
        'get /paystack/callback': 'Message',
        'post /admin/financial-operations/reconcile': 'ReconciliationRun',
        'get /admin/financial-operations/runs': 'ReconciliationRunCursorPage',
        'get /admin/financial-operations/issues': 'ReconciliationIssueCursorPage',
        'post /admin/financial-operations/issues/{id}/resolve': 'ReconciliationIssue',
        'get /admin/financial-operations/cases': 'FinancialCaseCursorPage',
        'get /admin/financial-operations/fees': 'ProviderFeeCursorPage',
        'post /admin/financial-operations/wallets/{id}/unfreeze': 'UnfrozenWallet',
    };
    const paged = (name) => object({
        data: array(ref(name)),
        meta: object({
            limit: integer(20),
            hasMore: bool(true),
            nextCursor: nullable(string('OPAQUE_CURSOR_FROM_SERVER', 'Pass unchanged in cursor query parameter. null means no next page.')),
        }),
    });
    for (const name of [
        'PublicUser',
        'Payout',
        'Beneficiary',
        'ReconciliationRun',
        'ReconciliationIssue',
        'FinancialCase',
        'ProviderFee',
        'ActivityFlag',
        'NotificationDelivery',
    ])
        document.components.schemas[`${name}CursorPage`] = paged(name);
    document.components.schemas.TransactionCursorPage = paged('Transaction');
    document.components.schemas.TransactionHistory = {
        oneOf: [ref('TransactionPage'), ref('TransactionCursorPage')],
    };
    document.components.schemas.NotificationCursorPage = object({
        ...paged('Notification').properties,
        unreadCount: integer(3),
    });
    document.components.schemas.NotificationHistory = {
        oneOf: [ref('NotificationPage'), ref('NotificationCursorPage')],
    };
    for (const [path, item] of Object.entries(document.paths)) {
        for (const method of ['get', 'post', 'patch', 'delete']) {
            const operation = item[method];
            if (!operation)
                continue;
            const name = routes[`${method} ${path.replace(/^\/api\/v1/, '')}`];
            if (!name)
                continue;
            const code = Object.keys(operation.responses).find((status) => /^2\d\d$/.test(status)) ?? '200';
            operation.responses[code] = {
                ...operation.responses[code],
                description: operation.responses[code]?.description ||
                    'Successful response. JSON schema below matches the returned body.',
                content: {
                    'application/json': {
                        schema: name.endsWith('[]') ? array(ref(name.slice(0, -2))) : ref(name),
                    },
                },
            };
            operation.description =
                (operation.description ?? '') +
                    ' Shared Redis rate limits apply by policy and IP/account. 429 responses include Retry-After in seconds; Redis outages return 503. Paystack webhooks are exempt.';
            for (const [status, description] of Object.entries({
                400: 'Invalid request, invalid amount, or insufficient funds.',
                401: 'Missing/expired credentials, invalid code, or invalid/used step-up proof.',
                403: 'Permission, email verification, account status, freeze, or feature restriction.',
                404: 'Requested record not found or not owned by the caller.',
                409: 'Conflicting state, cooldown, or idempotency key reused for different data.',
                429: 'Too many requests. Wait before retrying.',
                503: 'Provider or authentication delivery unavailable.',
                500: 'Unexpected server error.',
            })) {
                operation.responses[status] = {
                    ...operation.responses[status],
                    description: operation.responses[status]?.description || description,
                    content: { 'application/json': { schema: ref('ApiError') } },
                };
            }
        }
    }
}
//# sourceMappingURL=swagger.js.map