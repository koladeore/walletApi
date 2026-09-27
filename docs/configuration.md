# Required configuration

The API validates configuration at startup, before serving requests. Errors name invalid settings but never echo secrets or connection URLs.

| Setting | Requirement |
| --- | --- |
| NODE_ENV | Explicitly `development`, `test`, or `production` |
| DATABASE_URL | PostgreSQL URL with a hostname and database name |
| JWT_SECRET / REFRESH_SECRET | Required, different values; production rejects short, repetitive, and known placeholder secrets |
| JWT_EXPIRES_IN / REFRESH_EXPIRES_IN | Positive durations with `s`, `m`, `h`, or `d`; defaults `15m` / `7d`; maximum `365d` |
| PORT / REDIS_PORT | Integer 1-65535; defaults 3000 / 6379 |
| REDIS_HOST | Required in production; defaults to localhost in development/test |
| ENABLE_SIMULATED_FUNDING | `true` or `false`; default false; true is rejected in production |
| RESEND_API_KEY | Optional for local mock delivery; if supplied, must begin with `re_` |

Validation checks syntax and policy, not whether database/Redis credentials work or a provider key is valid. Length checks cannot prove randomness: generate secrets cryptographically. The application still permits mock email without a Resend key; configure real delivery before launch.

## Generate signing secrets

Run this command twice and place the separate outputs in `.env` under JWT_SECRET and REFRESH_SECRET. Do not commit or share the outputs:

```bash
node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'
```

Compose no longer provides JWT secret fallbacks. Missing values cause Compose to stop with a named configuration error. Changing signing secrets invalidates existing tokens after restart; users must log in again.

## Local setup and applying changes

For a new checkout, copy `.env.example` to `.env` and supply both secrets. The example contains localhost database settings for native development. Compose sets production mode and its own database/Redis addresses.

Apply code changes with `docker compose up -d --build api`. Later environment-only changes use `docker compose up -d api`.

The included PostgreSQL credentials and published database/Redis ports are for local development. They are not a production infrastructure configuration. A real deployment needs private database/Redis access and independently provisioned credentials. Changing POSTGRES_PASSWORD in Compose does not rotate the password in an already initialized PostgreSQL volume; coordinate database credential changes instead of deleting the volume.
