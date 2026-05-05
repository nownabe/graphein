# Stage 1: Production dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production

# Stage 2: Production + drizzle-kit for migrations
FROM deps AS migration-deps
RUN bun add drizzle-kit

# Stage 3: CSS build (full devDependencies for Tailwind)
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY src/ src/
RUN bun run css:build

# Stage 4: Production image (no migration)
FROM oven/bun:1-slim AS runner
WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY src/ src/
COPY public/favicon.svg public/favicon.svg
COPY --from=builder /app/public/styles.css public/styles.css

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]

# Stage 5: Migration-only image
FROM oven/bun:1-slim AS migrator
WORKDIR /app

COPY --from=migration-deps /app/node_modules node_modules
COPY package.json drizzle.config.ts ./
COPY src/infrastructure/db/ src/infrastructure/db/
COPY drizzle/ drizzle/

ENV NODE_ENV=production
CMD ["bun", "run", "db:migrate"]

# Stage 6: Self-host image with migration (default)
FROM oven/bun:1-slim AS runner-with-migration
WORKDIR /app

COPY --from=migration-deps /app/node_modules node_modules
COPY package.json drizzle.config.ts ./
COPY src/ src/
COPY public/favicon.svg public/favicon.svg
COPY --from=builder /app/public/styles.css public/styles.css
COPY drizzle/ drizzle/
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["entrypoint.sh"]
CMD ["bun", "run", "src/index.ts"]
