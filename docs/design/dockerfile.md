# Dockerfile Design

Issue: #244

## Overview

Add a Dockerfile, entrypoint script, and `.dockerignore` to enable
containerized deployment of Graphein. Multi-stage builds produce three build
targets via `--target`, covering all deployment patterns with a single
Dockerfile.

## Build Targets

| Target                  | Command                                       | Use case                                |
| ----------------------- | --------------------------------------------- | --------------------------------------- |
| `runner`                | `docker build --target runner`                | Production app (no migration)           |
| `migrator`              | `docker build --target migrator`              | Init container / one-shot migration job |
| `runner-with-migration` | `docker build --target runner-with-migration` | Self-host friendly (Lightdash style)    |

Default target (no `--target`): `runner-with-migration` — the safest default
for users who just want to `docker run` without extra setup.

## Dockerfile

### Stage 1: `deps` — Production dependencies

```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
```

- Excludes devDependencies (Playwright, Tailwind CLI, drizzle-kit, TypeScript).
- Used by the `runner` target for a minimal `node_modules`.

### Stage 2: `migration-deps` — Production + drizzle-kit

```dockerfile
FROM deps AS migration-deps
RUN bun add drizzle-kit
```

- Extends `deps` and adds only drizzle-kit (and its transitive dependencies).
- `bun add` modifies `package.json` and `bun.lock` within this layer, but those
  changes are confined to the build stage — the host files are unaffected.
- Used by `migrator` and `runner-with-migration` targets.
- Much smaller than full devDependencies (avoids Playwright, Tailwind CLI,
  TypeScript, @types/bun).

### Stage 3: `builder` — CSS build

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY src/ src/
RUN bun run css:build
```

- Full devDependencies for Tailwind CSS compilation.
- Outputs `public/styles.css`.
- Its `node_modules` is not carried into any final target.

### Stage 4: `runner` — Production image (no migration)

```dockerfile
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
```

- Uses production-only `node_modules` from `deps` — smallest image.
- No drizzle-kit, no migration files — migrations are handled externally.

### Stage 5: `migrator` — Migration-only image

```dockerfile
FROM oven/bun:1-slim AS migrator
WORKDIR /app

COPY --from=migration-deps /app/node_modules node_modules
COPY package.json drizzle.config.ts ./
COPY src/db/ src/db/
COPY drizzle/ drizzle/

ENV NODE_ENV=production
CMD ["bun", "run", "db:migrate"]
```

- `node_modules` from `migration-deps` (production + drizzle-kit only).
- Only copies DB schema and migration SQL files — no app source, no static
  assets.
- Runs `drizzle-kit migrate` and exits.
- Use as a Kubernetes init container, Cloud Run job, or one-shot `docker run`.

### Stage 6: `runner-with-migration` — Self-host image (default)

```dockerfile
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
```

- `node_modules` from `migration-deps` (production + drizzle-kit only).
- Entrypoint runs migration before starting the app (Lightdash pattern).
- Slightly larger than `runner` (drizzle-kit overhead), but much smaller than
  full devDependencies.

## Entrypoint Script

`docker/entrypoint.sh`:

```bash
#!/bin/bash
set -e

bun run db:migrate

exec "$@"
```

- `set -e` ensures the container fails fast if migration errors occur.
- `exec "$@"` replaces the shell with the CMD process (`bun run src/index.ts`),
  so signals are forwarded correctly.
- `drizzle-kit migrate` is idempotent — it tracks applied migrations in the
  `__drizzle_migrations` journal table.

## .dockerignore

```
node_modules
.git
.env*
.envrc
test/
tools/
scripts/
docs/
*.md
compose.yaml
.github/
playwright.config.ts
playwright-report/
test-results/
public/styles.css
```

Key exclusions:

- `node_modules` — rebuilt inside the image
- `.env*`, `.envrc` — secrets must not be baked in
- `test/`, `tools/`, `scripts/` — not needed at runtime
- `public/styles.css` — rebuilt in the `builder` stage
- `docs/`, `*.md` — documentation

## Image Size Comparison

| Target                  | `node_modules` source | Includes drizzle-kit | Relative size |
| ----------------------- | --------------------- | -------------------- | ------------- |
| `runner`                | `deps` (prod only)    | No                   | Smallest      |
| `migrator`              | `migration-deps`      | Yes                  | Small         |
| `runner-with-migration` | `migration-deps`      | Yes                  | Medium        |

All targets avoid the bulk of devDependencies (Playwright, Tailwind CLI,
TypeScript). The `migration-deps` stage adds only drizzle-kit on top of
production dependencies.

## Considered Alternatives

### Full devDependencies for migration targets

Copy `node_modules` from the `builder` stage (which has all devDependencies)
into migration targets. Simpler Dockerfile but includes unnecessary packages
(Playwright, Tailwind CLI, TypeScript) that inflate image size significantly.

### Copy only drizzle-kit directory from builder

Instead of a `migration-deps` stage, copy `node_modules/drizzle-kit` (and
transitive dependencies) from `builder`. This is fragile — transitive
dependency trees change across versions and must be maintained manually.

### Bun compile (single binary)

`bun build --compile` could produce a standalone binary, eliminating the need
for `node_modules` in the final image. However:

- Drizzle ORM's runtime behavior with compiled Bun binaries is not well-tested.
- The `postgres` driver uses native TCP which should work, but edge cases exist.
- Slack Bolt's dynamic module loading may break.

This could be revisited later for further size optimization.

### Distroless / Alpine base

Using `gcr.io/distroless` or Alpine would further reduce image size, but:

- Bun doesn't officially provide distroless images.
- Alpine uses musl libc which can cause compatibility issues with some npm
  packages.
- `bun:1-slim` is already reasonably small (~150MB base).

## File Changes

| File                   | Change   |
| ---------------------- | -------- |
| `Dockerfile`           | New file |
| `docker/entrypoint.sh` | New file |
| `.dockerignore`        | New file |
