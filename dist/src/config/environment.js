"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
function validateEnvironment(config) {
    const errors = [];
    const text = (key, fallback) => {
        const value = config[key] ?? fallback;
        if (typeof value !== 'string' || !value.trim()) {
            errors.push(`${key} is required`);
            return '';
        }
        return value.trim();
    };
    const nodeEnv = text('NODE_ENV');
    if (!['development', 'test', 'production'].includes(nodeEnv)) {
        errors.push('NODE_ENV must be development, test, or production');
    }
    const databaseUrl = text('DATABASE_URL');
    try {
        const url = new URL(databaseUrl);
        if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
            !url.hostname ||
            url.pathname.length < 2) {
            errors.push('DATABASE_URL must be a PostgreSQL URL with a host and database');
        }
    }
    catch {
        errors.push('DATABASE_URL must be a valid PostgreSQL URL');
    }
    const port = (key, fallback) => {
        const raw = config[key] ?? fallback;
        const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
        const result = Number(value);
        if (!/^\d+$/.test(value) || !Number.isInteger(result) || result < 1 || result > 65535) {
            errors.push(`${key} must be an integer from 1 to 65535`);
        }
        return result;
    };
    const apiPort = port('PORT', '3000');
    const redisPort = port('REDIS_PORT', '6379');
    const redisHost = text('REDIS_HOST', nodeEnv === 'production' ? undefined : 'localhost');
    if (/\s|:\/\//.test(redisHost))
        errors.push('REDIS_HOST must be a hostname, not a URL');
    const secret = (key) => {
        const value = text(key);
        if (nodeEnv === 'production' &&
            (value.length < 32 ||
                /change[_ -]?me|replace[_ -]?with|your[_ -].*secret|local_(access|refresh)_secret/i.test(value) ||
                new Set(value).size < 8)) {
            errors.push(`${key} must be a strong random secret of at least 32 characters, not a placeholder`);
        }
        return value;
    };
    const jwtSecret = secret('JWT_SECRET');
    const refreshSecret = secret('REFRESH_SECRET');
    if (jwtSecret && jwtSecret === refreshSecret)
        errors.push('JWT_SECRET and REFRESH_SECRET must differ');
    const duration = (key, fallback) => {
        const value = text(key, fallback);
        const match = /^([1-9]\d*)(s|m|h|d)$/.exec(value);
        const units = { s: 1, m: 60, h: 3600, d: 86400 };
        const seconds = match ? Number(match[1]) * units[match[2]] : NaN;
        if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 365 * 86400) {
            errors.push(`${key} must be a positive duration using s, m, h, or d, up to 365d`);
        }
        return seconds;
    };
    const accessTtl = duration('JWT_EXPIRES_IN', '15m');
    const refreshTtl = duration('REFRESH_EXPIRES_IN', '7d');
    const simulation = text('ENABLE_SIMULATED_FUNDING', 'false');
    if (!['true', 'false'].includes(simulation))
        errors.push('ENABLE_SIMULATED_FUNDING must be true or false');
    if (nodeEnv === 'production' && simulation === 'true') {
        errors.push('ENABLE_SIMULATED_FUNDING must be false in production');
    }
    const resendKey = config.RESEND_API_KEY;
    const paystackEnabled = text('PAYSTACK_ENABLED', 'false');
    if (!['true', 'false'].includes(paystackEnabled))
        errors.push('PAYSTACK_ENABLED must be true or false');
    const paystackKey = config.PAYSTACK_SECRET_KEY ?? '';
    if (typeof paystackKey !== 'string' ||
        (paystackKey !== '' && !/^sk_test_[A-Za-z0-9]+$/.test(paystackKey)))
        errors.push('PAYSTACK_SECRET_KEY must be a test secret key beginning with sk_test_');
    if (paystackEnabled === 'true' && !paystackKey)
        errors.push('PAYSTACK_SECRET_KEY is required when PAYSTACK_ENABLED is true');
    if (resendKey && (typeof resendKey !== 'string' || !resendKey.startsWith('re_'))) {
        errors.push('RESEND_API_KEY must be empty or a Resend API key');
    }
    if (errors.length)
        throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
    return {
        ...config,
        NODE_ENV: nodeEnv,
        DATABASE_URL: databaseUrl,
        PORT: apiPort,
        REDIS_HOST: redisHost,
        REDIS_PORT: redisPort,
        JWT_SECRET: jwtSecret,
        REFRESH_SECRET: refreshSecret,
        JWT_EXPIRES_IN: accessTtl,
        REFRESH_EXPIRES_IN: refreshTtl,
        ENABLE_SIMULATED_FUNDING: simulation,
        PAYSTACK_ENABLED: paystackEnabled,
        PAYSTACK_SECRET_KEY: paystackKey,
    };
}
//# sourceMappingURL=environment.js.map