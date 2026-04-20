# AGENTS.md

This file provides guidance to Claude Code agents working on this repository.
See also `docs/design-principles.md` for UI/UX design guidelines.

## Project Overview

Graphein converts Slack messages into trackable tasks. Users trigger a message
shortcut in Slack, confirm details in a modal, and the task appears in a
server-rendered web UI.

## Architecture

```
src/
├── index.ts          # Bun server entry point
├── app.ts            # Hono app with all route mounts
├── env.ts            # Environment variable validation (throws on missing)
├── db/
│   ├── schema.ts     # Drizzle ORM table definitions + relations
│   └── client.ts     # DB connection singleton
├── auth/
│   ├── routes.tsx    # Slack OIDC login, callback, logout
│   ├── session.ts    # JWT sign/verify helpers
│   └── middleware.ts # authMiddleware (all protected routes), adminMiddleware
├── tasks/
│   ├── routes.tsx    # CRUD routes: list, create, edit, archive, done toggle
│   └── service.ts   # Business logic: createTask, archiveTask, toggleDone, etc.
├── users/
│   └── service.ts   # findOrCreateUser, findUserBySlackUserId, updateUserLocale
├── admin/
│   └── routes.tsx   # User management (promote/demote)
├── slack/
│   ├── bolt.ts      # Slack Bolt app: shortcut handler + modal submission
│   ├── receiver.ts  # Custom HonoReceiver for HTTP mode
│   ├── helpers.ts   # createSlackLabelResolver, hydrateMentionLabels
│   ├── labels.ts    # Render-time entity label cache (users, channels, groups)
│   ├── mrkdwn.tsx   # Slack mrkdwn → JSX renderer
│   └── rich-text.ts # rich_text blocks → mrkdwn string converter
├── llm/
│   └── gemini.ts    # Gemini 2.0 Flash: extract title + deadline from message
├── i18n/
│   ├── index.ts     # t(locale, key) function
│   └── messages.ts  # ja/en translation strings
└── views/
    ├── layout.tsx           # Root HTML shell (head, scripts, fonts)
    ├── components/
    │   ├── nav.tsx          # Top navigation bar
    │   ├── task-card.tsx    # Single task card with actions
    │   └── task-list.tsx    # Task list with temporal grouping
    └── pages/
        ├── home.tsx         # Main page: assigned/owned tabs + filter tabs
        ├── task-detail.tsx  # Edit form + owner management
        ├── task-status.tsx  # Per-assignee completion progress
        ├── archived.tsx     # Archived tasks with assigned/owned tabs
        ├── login.tsx        # Slack OAuth login
        └── admin-users.tsx
```

## Database Schema

Four tables with UUID primary keys:

- **users**: `slackUserId` (unique), `email`, `displayName`, `avatarUrl`, `role` ("user"|"admin"), `locale` ("en"|"ja")
- **tasks**: `title`, `description`, `archived`, `deadline`, `slackMessageTs`, `slackChannelId`, `slackPermalink`, `createdById` (FK → users)
- **taskAssignees**: composite PK (`taskId`, `userId`), `done` (boolean) — per-assignee completion
- **taskOwners**: composite PK (`taskId`, `userId`) — task creator is auto-added as owner

Migrations live in `drizzle/`. Generate with `bun run db:generate`, apply with `bun run db:migrate`.

## Key Flows

### Task Creation (Slack → DB)

1. User triggers "Create task" message shortcut in Slack
2. `bolt.ts` shortcut handler opens a loading modal immediately (3s trigger_id limit)
3. Extracts message text from `blocks` (rich text) or falls back to plain `text`
4. Resolves usergroup mentions → pre-resolves group users to DB user IDs
5. Extracts individual user mentions (excluding those already in groups)
6. Hydrates mention labels (`<@U1>` → `<@U1|alice>`) for stored description
7. Calls Gemini to generate title + deadline from message content
8. Updates modal: title input, optional deadline picker, `multi_users_select` (users), `multi_static_select` (groups), original message quote
9. On submission: resolves selected users via Slack API → `findOrCreateUser`, combines with group user IDs, creates task, posts confirmation in thread

### Auth Flow

1. `/auth/slack` → Slack OIDC authorize redirect
2. Callback exchanges code for token, fetches user info
3. First-ever user becomes admin automatically
4. JWT cookie (7d, httpOnly) + locale cookie (365d) set
5. `authMiddleware` on all protected routes verifies JWT, sets `jwtPayload` and `isAdmin` in Hono context

### Rendering (SSR + htmx)

- Full page: returns `<Layout>` wrapper with `<html>`, `<head>`, scripts
- htmx partial: detected by `HX-Request` header without `HX-Boosted`, returns content fragment only
- `hx-boost="true"` on `<body>` enables SPA-like navigation globally

## i18n

- Two locales: `"en"` (default) and `"ja"`
- `t(locale, "key.path")` returns translated string; falls back to key if missing
- All messages in `src/i18n/messages.ts` as flat key-value records
- Locale determined by: cookie → DB (`users.locale`) → default `"en"`
- Locale persisted to DB on switch (`POST /locale/:lang`), restored on login

## Slack Integration Details

### Mention Formats

- User: `<@U[A-Z0-9]+>` — resolved via `users.info` API
- Channel: `<#C[A-Z0-9]+>` — resolved via `conversations.info` API
- Usergroup: `<!subteam^S[A-Z0-9]+>` — resolved via `usergroups.list` + `usergroups.users.list` APIs

### Modal Elements

- `multi_users_select` for individual user assignment (native Slack user picker with search)
- `multi_static_select` for usergroup assignment (only shown when groups are mentioned)
- Users already in a selected group are excluded from `initial_users` to avoid duplication
- `datetimepicker` for optional deadline
- `private_metadata` carries context between modal open and submission (channelId, messageTs, groupCandidates, locale, etc.)

### Label Resolution

- `createSlackLabelResolver(client)` returns a cached resolver for users, channels, and usergroups
- `hydrateMentionLabels(text, resolver)` replaces raw IDs with display labels for storage
- At render time, `<Mrkdwn>` component uses `MrkdwnOptions` to resolve labels in task descriptions

## Styling

- Tailwind CSS v4 with custom design tokens as CSS variables
- Dark-first design (no light mode toggle)
- Key variables: `--color-page`, `--color-surface`, `--color-ink`, `--color-accent`, `--color-danger`, `--color-success`, `--color-edge`, `--color-muted`
- Border radius: `--radius-sm` (8px), `--radius-lg` (16px)
- Fonts: Plus Jakarta Sans (Latin) + Noto Sans JP (Japanese), loaded from Google Fonts
- Custom CSS for: checkbox styling, htmx request states, toast notifications, disclosure triangles, stagger-in animations

## Language

All documentation, code comments, commit messages, issues, and pull requests must be written in English.

## Tools

- **`tools/run-sql.ts`**: Use this to execute SQL against the dev or test database. Do not use `psql` or other database clients directly.

  ```bash
  bun run tools/run-sql.ts "SELECT * FROM users LIMIT 5"       # dev DB
  bun run tools/run-sql.ts --test "SELECT count(*) FROM users"  # test DB
  bun run tools/run-sql.ts --file path/to/query.sql             # from file
  ```

- **`tools/wait-pr.ts`**: Poll a PR until CI passes and LGTM is received, or an actionable state is reached.
  ```bash
  bun run tools/wait-pr.ts <pr-number> [--reviewer <user>] [--since <iso-timestamp>]
  ```
  Polls every 30s (up to ~5 min). The JSON output includes a `status` field: `approved`, `ci_failed`, `has_feedback`, `merged`, `closed`, or `pending`. Non-zero exit only on errors.

## E2E Tests

Playwright-based E2E tests live in `test/e2e/`. They test the full Slack → Graphein integration.

### Prerequisites

- E2E database running (`bun run db:up` starts all databases including `db-e2e` on port 15434)
- Slack workspace accessible (bot token with posting permissions)
- The E2E server is started automatically by `global-setup.ts` on port 3001 (HTTP mode, Socket Mode off)

### Environment Variables

Set these in `.envrc` (direnv) or your shell before running E2E tests:

| Variable                   | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `E2E_SLACK_BOT_TOKEN`      | Slack bot token for posting messages                    |
| `E2E_SLACK_SIGNING_SECRET` | Slack signing secret for request signature verification |
| `E2E_SLACK_CHANNEL_ID`     | General test channel ID                                 |
| `E2E_SLACK_USER_ID`        | Slack user ID for the test user                         |
| `E2E_SNIPPET_CHANNEL_ID`   | Snippet-monitored channel ID                            |
| `E2E_KUDOS_CHANNEL_ID`     | Kudos-monitored channel ID                              |
| `E2E_DATABASE_URL`         | E2E database connection string                          |
| `E2E_JWT_SECRET`           | JWT signing secret for E2E test auth                    |

### Running

```bash
bun run test:e2e              # Run all E2E tests
bun run test:e2e -- --headed  # Run with visible browser
```

### Architecture

- **E2E server starts automatically** — `global-setup.ts` spawns the Graphein server on port 3001 in HTTP mode (Socket Mode off). Torn down by `global-teardown.ts`.
- **Slack shortcut/modal flows are simulated via signed HTTP requests** — `slack-interaction.ts` constructs Slack-compatible payloads with HMAC-SHA256 signatures and POSTs them to `/slack/interactions`.
- **Slack API helpers** — messages are posted via `chat.postMessage`, reactions checked via `reactions.get`, etc.
- **Graphein UI verification uses Playwright** — the browser navigates to the web app and asserts on rendered content.
- **Auth is handled via JWT cookies** — the `authenticateContext` helper creates a valid session token and sets it as a cookie, bypassing the Slack OIDC flow.
- **DB verification uses the `postgres` driver directly** — helpers in `test/e2e/helpers/db.ts` query the E2E database. Migrations run automatically via `global-setup.ts`.

### Helpers

| File                                    | Purpose                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `test/e2e/global-setup.ts`              | DB migrations, user setup, E2E server startup        |
| `test/e2e/global-teardown.ts`           | E2E server shutdown                                  |
| `test/e2e/fixtures.ts`                  | Custom Playwright fixtures (`authedPage`)            |
| `test/e2e/helpers/env.ts`               | Environment variable accessors                       |
| `test/e2e/helpers/slack.ts`             | Slack API helpers (post, delete, reactions, threads) |
| `test/e2e/helpers/slack-interaction.ts` | Signed Slack interaction request helpers             |
| `test/e2e/helpers/db.ts`                | Database query/cleanup helpers                       |
| `test/e2e/helpers/auth.ts`              | JWT token creation, browser context auth             |

## API Design

- Follow [Google API Improvement Proposals (AIP)](https://google.aip.dev/) for API design
- Key references: [AIP-122 (Resource names)](https://google.aip.dev/122), [AIP-127 (HTTP and gRPC Transcoding)](https://google.aip.dev/127), [AIP-190 (Naming conventions)](https://google.aip.dev/190)
- URL path collection identifiers use camelCase (e.g. `/api/v1/snippetChannels`)
- See `docs/design/api.md` for the API design doc

## Conventions

- Files using JSX must have `.tsx` extension
- Route files importing JSX components also use `.tsx`
- `HX-Request` header distinguishes partial vs full page responses
- Database port: 15432 (mapped from container 5432)
- Always pass `locale` prop through the component tree; never hardcode language strings
- Slack entity IDs are stored raw in DB; labels are resolved at render time
- Task creator is automatically added as task owner
- Admins can perform all owner actions on any task regardless of ownership
- Use the Read tool to read files instead of `sed`, `cat`, `head`, `tail`, or other shell commands
