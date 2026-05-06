# Development Guide

Guide for setting up a local development environment and contributing to Graphein.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Docker (for PostgreSQL)
- A Slack workspace for testing
- [ngrok](https://ngrok.com/) (for Slack OIDC callback during local development)

## Local Setup

### 1. Start ngrok

Slack OIDC login requires a publicly reachable callback URL. Use ngrok to expose your local server:

```bash
ngrok http 3000
```

Copy the generated `https://xxxx.ngrok-free.app` URL — you'll use it as `BASE_URL` and for the Slack App Redirect URL.

### 2. Create a Slack App

See [README.md](../README.md#1-create-a-slack-app) for creating the Slack app. Use your ngrok URL as the base URL when running `./scripts/generate-slack-manifest.sh`.

Additionally for local development:

1. Go to **Settings → Basic Information → App-Level Tokens** and generate a token with the `connections:write` scope (starts with `xapp-`) — this enables Socket Mode
2. Set the OIDC Redirect URL to your ngrok URL: `https://xxxx.ngrok-free.app/auth/slack/callback`

### 3. Configure Environment Variables

```bash
cp .envrc.example .envrc
direnv allow
```

Key differences from production:

- `SLACK_SOCKET_MODE=true` — avoids needing a public URL for Slack events
- `SLACK_APP_TOKEN` — required for Socket Mode (`xapp-...`)
- `BASE_URL` — your ngrok URL
- `DATABASE_URL` — default value from `.envrc.example` works with Docker

### 4. Start Services

```bash
bun install
bun run db:up        # Start PostgreSQL (dev + test + e2e databases)
bun run db:migrate   # Apply migrations
bun run css:build    # Initial CSS build
bun run dev          # Start dev server with auto-reload
```

Access the app at `http://localhost:3000`.

## Common Commands

```bash
bun run dev              # Dev server with auto-reload
bun run css              # Watch and rebuild CSS on changes
bun run css:build        # One-off CSS build
bun run db:generate      # Generate migration after schema changes
bun run db:migrate       # Apply pending migrations
bun run check:all        # Run all checks (typecheck, tests, format, lint, workflows)
```

## Database

PostgreSQL runs in Docker via `docker compose`. The dev database is exposed on port 15432.

```bash
bun run db:up            # Start all databases (dev + test + e2e)
bun run db:down          # Stop all databases
bun run db:generate      # Generate migration after editing src/db/schema.ts
bun run db:migrate       # Apply pending migrations
```

## Testing

### Unit Tests

```bash
bun test
```

### Integration Tests

Require the test database running (`bun run db:up`).

```bash
bun run test:integration
```

### E2E Tests

Playwright-based E2E tests live in `test/e2e/`. They test the full Slack-to-Graphein integration.

**Prerequisites:**

- E2E database running (`bun run db:up` starts all databases including `db-e2e` on port 15434)
- Slack workspace accessible (bot token with posting permissions)
- The E2E server is started automatically by `global-setup.ts` on port 3001

**Environment variables** (set in `.envrc`):

| Variable                   | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `E2E_SLACK_BOT_TOKEN`      | Slack bot token for posting messages                    |
| `E2E_SLACK_SIGNING_SECRET` | Slack signing secret for request signature verification |
| `E2E_SLACK_CHANNEL_ID`     | General test channel ID                                 |
| `E2E_SLACK_USER_ID`        | Slack user ID for the test user                         |
| `E2E_SNIPPET_CHANNEL_ID`   | Snippet-monitored channel ID                            |
| `E2E_KUDOS_CHANNEL_ID`     | Kudos-monitored channel ID                              |
| `E2E_DATABASE_URL`         | E2E database connection string                          |
| `E2E_JWT_SECRET`           | JWT signing secret for E2E test auth (session and MCP)  |

**Running:**

```bash
bun run test:e2e              # Run all E2E tests
bun run test:e2e -- --headed  # Run with visible browser
```

## Coding Conventions

- Files using JSX must have `.tsx` extension
- Route files importing JSX components also use `.tsx`
- `HX-Request` header distinguishes partial vs full page responses
- Always pass `locale` prop through the component tree; never hardcode language strings
- Slack entity IDs are stored raw in DB; labels are resolved at render time
- Task creator is automatically added as task owner
- Admins can perform all owner actions on any task regardless of ownership
- All documentation, code comments, commit messages, issues, and pull requests must be written in English

## API Design

- Follow [Google API Improvement Proposals (AIP)](https://google.aip.dev/)
- Key references: [AIP-122 (Resource names)](https://google.aip.dev/122), [AIP-127 (HTTP and gRPC Transcoding)](https://google.aip.dev/127), [AIP-190 (Naming conventions)](https://google.aip.dev/190)
- URL path collection identifiers use camelCase (e.g. `/api/v1/snippetChannels`)
- See [docs/design/api.md](design/api.md) for the full API design doc
