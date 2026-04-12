# AGENTS.md

This file provides guidance to Claude Code agents working on this repository.
See also `CLAUDE.md` for base instructions (commands, definition of done, etc.).

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
├── members/
│   └── service.ts   # findOrCreateMember, findMemberBySlackUserId, updateMemberLocale
├── admin/
│   └── routes.tsx   # Member management (promote/demote)
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
        └── admin-members.tsx
```

## Database Schema

Four tables with UUID primary keys:

- **members**: `slackUserId` (unique), `email`, `displayName`, `avatarUrl`, `role` ("user"|"admin"), `locale` ("en"|"ja")
- **tasks**: `title`, `description`, `archived`, `deadline`, `slackMessageTs`, `slackChannelId`, `slackPermalink`, `createdById` (FK → members)
- **taskAssignees**: composite PK (`taskId`, `memberId`), `done` (boolean) — per-assignee completion
- **taskOwners**: composite PK (`taskId`, `memberId`) — task creator is auto-added as owner

Migrations live in `drizzle/`. Generate with `bun run db:generate`, apply with `bun run db:migrate`.

## Key Flows

### Task Creation (Slack → DB)

1. User triggers "Create task" message shortcut in Slack
2. `bolt.ts` shortcut handler opens a loading modal immediately (3s trigger_id limit)
3. Extracts message text from `blocks` (rich text) or falls back to plain `text`
4. Resolves usergroup mentions → pre-resolves group members to DB member IDs
5. Extracts individual user mentions (excluding those already in groups)
6. Hydrates mention labels (`<@U1>` → `<@U1|alice>`) for stored description
7. Calls Gemini to generate title + deadline from message content
8. Updates modal: title input, optional deadline picker, `multi_users_select` (users), `multi_static_select` (groups), original message quote
9. On submission: resolves selected users via Slack API → `findOrCreateMember`, combines with group member IDs, creates task, posts confirmation in thread

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
- Locale determined by: cookie → DB (`members.locale`) → default `"en"`
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

## Conventions

- Files using JSX must have `.tsx` extension
- Route files importing JSX components also use `.tsx`
- `HX-Request` header distinguishes partial vs full page responses
- Database port: 15432 (mapped from container 5432)
- Always pass `locale` prop through the component tree; never hardcode language strings
- Slack entity IDs are stored raw in DB; labels are resolved at render time
- Task creator is automatically added as task owner
- Admins can perform all owner actions on any task regardless of ownership
