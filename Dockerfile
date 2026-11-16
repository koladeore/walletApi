# syntax=docker/dockerfile:1

# Prisma needs OpenSSL while generating its client and at runtime.
FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install every dependency needed to generate Prisma and compile TypeScript.
FROM base AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Build the application in a separate, disposable stage.
FROM dependencies AS build

COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate \
    && npm run build

# Remove build-only packages without changing the reusable build stage.
FROM build AS production-dependencies
RUN npm prune --omit=dev

# Keep only production files in the final image.
FROM base AS production

# Associate the GHCR package with the repository that publishes it.
LABEL org.opencontainers.image.source="https://github.com/koladeore/walletApi"

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
