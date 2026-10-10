import { validateEnvironment } from './environment';

const valid = () => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@db:5432/wallet',
  REDIS_HOST: 'redis',
  JWT_SECRET: 'access-4e7c68db9f03a251bc6d907ec23a419f',
  REFRESH_SECRET: 'refresh-d3285b9ec7f04a69817bdcf42506ea93',
  AUTH_SECURITY_SECRET: 'security-fd2910bac68495e324916827ac308b52',
});

describe('Startup configuration', () => {
  it('accepts an enabled test integration and does not echo rejected provider secrets', () => {
    expect(
      validateEnvironment({
        ...valid(),
        PAYSTACK_ENABLED: 'true',
        PAYSTACK_SECRET_KEY: 'sk_test_example123',
      }).PAYSTACK_ENABLED,
    ).toBe('true');
    const secret = 'sk_live_private123';
    try {
      validateEnvironment({ ...valid(), PAYSTACK_SECRET_KEY: secret });
      throw new Error('Expected rejection');
    } catch (error) {
      expect((error as Error).message).toContain('PAYSTACK_SECRET_KEY');
      expect((error as Error).message).not.toContain(secret);
    }
  });
  it('accepts valid production settings and normalizes safe defaults', () => {
    expect(validateEnvironment(valid())).toEqual({
      ...valid(),
      PORT: 3000,
      RATE_LOGIN_IP_LIMIT: 10,
      RATE_LOGIN_ACCOUNT_LIMIT: 5,
      RATE_MONEY_IP_LIMIT: 20,
      RATE_MONEY_ACCOUNT_LIMIT: 10,
      RATE_READ_IP_LIMIT: 120,
      RATE_READ_ACCOUNT_LIMIT: 120,
      RATE_WRITE_IP_LIMIT: 30,
      RATE_WRITE_ACCOUNT_LIMIT: 20,
      DB_POOL_MAX: 10,
      DB_CONNECTION_TIMEOUT_MS: 5000,
      DB_IDLE_TIMEOUT_MS: 30000,
      DB_STATEMENT_TIMEOUT_MS: 15000,
      DB_LOCK_TIMEOUT_MS: 5000,
      NOTIFICATION_EMAIL_ENABLED: 'true',
      REDIS_PORT: 6379,
      JWT_EXPIRES_IN: 900,
      REFRESH_EXPIRES_IN: 604800,
      ENABLE_SIMULATED_FUNDING: 'false',
      PAYSTACK_ENABLED: 'false',
      PAYSTACK_SECRET_KEY: '',
      AUTH_DELIVERY_MODE: 'disabled',
      AUTH_EMAIL_FROM: '',
    });
  });
  it.each(['NODE_ENV', 'DATABASE_URL', 'REDIS_HOST', 'JWT_SECRET', 'REFRESH_SECRET'])(
    'requires %s',
    (key) => {
      expect(() => validateEnvironment({ ...valid(), [key]: undefined })).toThrow(key);
    },
  );
  it.each([
    ['NODE_ENV', 'prod'],
    ['DATABASE_URL', 'https://example.com'],
    ['DATABASE_URL', 'postgresql://localhost'],
    ['PORT', '3000oops'],
    ['PORT', '0'],
    ['REDIS_PORT', '65536'],
    ['REDIS_HOST', 'redis://redis'],
    ['JWT_SECRET', 'short'],
    ['REFRESH_SECRET', 'replace_with_a_long_random_refresh_secret'],
    ['JWT_SECRET', 'local_access_secret_change_me'],
    ['JWT_SECRET', 'a'.repeat(40)],
    ['JWT_EXPIRES_IN', '900'],
    ['REFRESH_EXPIRES_IN', '0d'],
    ['JWT_EXPIRES_IN', '-1h'],
    ['REFRESH_EXPIRES_IN', '366d'],
    ['ENABLE_SIMULATED_FUNDING', 'TRUE'],
    ['ENABLE_SIMULATED_FUNDING', 'true'],
    ['AUTH_DELIVERY_MODE', 'test'],
    ['AUTH_DELIVERY_MODE', 'provider'],
    ['AUTH_DELIVERY_MODE', 'invalid'],
    ['AUTH_SECURITY_SECRET', 'short'],
    ['PAYSTACK_ENABLED', 'TRUE'],
    ['PAYSTACK_ENABLED', 'true'],
    ['PAYSTACK_SECRET_KEY', 'sk_live_private'],
    ['PAYSTACK_SECRET_KEY', 'pk_test_private'],
  ])('rejects unsafe or invalid %s', (key, value) => {
    expect(() => validateEnvironment({ ...valid(), [key]: value })).toThrow(key);
  });
  it('requires different access and refresh secrets', () => {
    expect(() => validateEnvironment({ ...valid(), REFRESH_SECRET: valid().JWT_SECRET })).toThrow(
      'must differ',
    );
  });
  it('permits deliberate development simulation with optional email delivery', () => {
    const result = validateEnvironment({
      ...valid(),
      NODE_ENV: 'development',
      REDIS_HOST: undefined,
      ENABLE_SIMULATED_FUNDING: 'true',
      RESEND_API_KEY: '',
    });
    expect(result.REDIS_HOST).toBe('localhost');
    expect(result.ENABLE_SIMULATED_FUNDING).toBe('true');
  });
  it('never prints secret or database values in validation errors', () => {
    const secret = 'sensitive-invalid-secret';
    const database = 'invalid://username:private-password@host';
    try {
      validateEnvironment({ ...valid(), JWT_SECRET: secret, DATABASE_URL: database });
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('Invalid configuration');
      expect(message).not.toContain(secret);
      expect(message).not.toContain('private-password');
    }
  });
});
